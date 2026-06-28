"""Service layer for Telegram account spam appeal logic."""

import asyncio
import logging
import re
import time
from urllib.parse import urlparse, parse_qs
from typing import Any

from telethon import TelegramClient
from telethon.tl.types import Message

from app.config import get_settings

logger = logging.getLogger(__name__)


def find_button(msg: Message, keywords: list[str]) -> Any | None:
    """Find a button on a message containing any of the keywords (case-insensitive)."""
    if not msg.buttons:
        return None
    for row in msg.buttons:
        for btn in row:
            for kw in keywords:
                if kw.lower() in btn.text.lower():
                    return btn
    return None


async def check_appeal_history(client: TelegramClient) -> bool:
    """
    Check chat history with @spambot to see if an appeal has already been submitted.
    Returns True if an appeal is already submitted or in progress, False otherwise.
    """
    try:
        entity = await client.get_entity("spambot")
        history = []
        async for msg in client.iter_messages(entity, limit=30):
            if msg.text:
                history.append(msg.text.lower())

        if not history:
            return False

        # Keywords indicating appeal has been submitted
        keyword_banding_terkirim = [
            "your appeal has been submitted",
            "appeal has been submitted",
            "banding anda telah dikirim",
            "pengajuan banding",
            "restriction review submitted",
            "already submitted",
            "banding sebelumnya",
            "previously submitted",
            "kamu sudah pernah",
            "already appealed",
            "we have received your appeal",
            "permohonan banding",
            "we will review",
            "akan ditinjau",
            "sedang diproses",
            "help us understand",
        ]

        # Keywords indicating active flow (in the middle of steps)
        keyword_flow_aktif = [
            "do you admit",
            "apakah kamu mengakui",
            "apa yang terjadi",
            "tell us more",
            "jelaskan lebih",
            "is your account useful",
            "apakah akun anda bermanfaat",
            "why did this happen",
            "mengapa ini terjadi",
            "kirimkan ke moderators",
            "send to moderators",
        ]

        found_submitted = False
        found_flow = False

        for text in history:
            for kw in keyword_banding_terkirim:
                if kw in text:
                    found_submitted = True
                    break
            for kw in keyword_flow_aktif:
                if kw in text:
                    found_flow = True
                    break

        if found_submitted or found_flow:
            logger.info("Previous appeal detected (submitted: %s, active flow: %s)", found_submitted, found_flow)
            return True

        return False
    except Exception as e:
        if "cannot find any entity" in str(e).lower():
            return False
        logger.warning("Failed to check appeal history with @spambot: %s", e)
        return False


def solve_captcha_via_2captcha_sync(captcha_url: str, api_key: str) -> str | None:
    """Synchronously extract sitekey and solve Turnstile captcha via 2captcha API."""
    import requests
    import cloudscraper
    logger.info("Extracting Turnstile parameters from %s", captcha_url)
    try:
        scraper = cloudscraper.create_scraper(
            browser={'browser': 'chrome', 'platform': 'windows', 'desktop': True, 'mobile': False}
        )
        resp = scraper.get(captcha_url, timeout=30)
        html = resp.text

        # Extract sitekey from data-sitekey
        sitekey_match = re.search(r'data-sitekey=["\']([^"\']+)["\']', html)
        if not sitekey_match:
            logger.warning("No data-sitekey found in captcha page HTML")
            return None
        sitekey = sitekey_match.group(1)
        logger.info("Sitekey found: %s...", sitekey[:15])

        action = None
        cdata = None
        chl_pagedata = None

        action_match = re.search(r'action:\s*["\']([^"\']+)["\']', html)
        if action_match:
            action = action_match.group(1)

        cdata_match = re.search(r'cData["\']?\s*[=:]\s*["\']([^"\']+)["\']', html)
        if cdata_match:
            cdata = cdata_match.group(1)

        chl_match = re.search(r'chlPageData["\']?\s*[=:]\s*["\']([^"\']+)["\']', html)
        if chl_match:
            chl_pagedata = chl_match.group(1)

        # Call 2captcha createTask
        api_url = "https://api.2captcha.com"
        task_payload = {
            "type": "TurnstileTaskProxyless",
            "websiteURL": captcha_url,
            "websiteKey": sitekey,
        }
        if action:
            task_payload["action"] = action
        if cdata:
            task_payload["data"] = cdata
        if chl_pagedata:
            task_payload["pagedata"] = chl_pagedata

        create_payload = {
            "clientKey": api_key,
            "task": task_payload
        }

        resp = requests.post(f"{api_url}/createTask", json=create_payload, timeout=30)
        data = resp.json()
        if data.get("errorId") != 0:
            logger.error("2captcha createTask error: %s", data.get("errorDescription"))
            return None

        task_id = data.get("taskId")
        result_payload = {
            "clientKey": api_key,
            "taskId": task_id
        }

        # Poll for result
        for attempt in range(60):
            time.sleep(3)
            poll = requests.post(f"{api_url}/getTaskResult", json=result_payload, timeout=30)
            result = poll.json()

            if result.get("errorId") != 0:
                logger.error("2captcha getTaskResult error: %s", result.get("errorDescription"))
                return None

            if result.get("status") == "ready":
                return result["solution"].get("token", "")
            elif result.get("status") != "processing":
                logger.warning("2captcha unexpected status: %s", result.get("status"))
                return None

        logger.warning("2captcha timeout waiting for token")
        return None
    except Exception as e:
        logger.exception("Error solving captcha via 2captcha: %s", e)
        return None


def submit_turnstile_token_sync(captcha_url: str, token: str) -> bool:
    """Submit the Turnstile solution token to Telegram's checkcaptcha endpoint."""
    import cloudscraper
    logger.info("Submitting Turnstile token to Telegram...")
    try:
        parsed = urlparse(captcha_url)
        params = parse_qs(parsed.query)
        scope = params.get('scope', [''])[0]
        actor = params.get('actor', [''])[0]

        submit_url = "https://telegram.org/captcha/checkcaptcha"
        payload = {
            'token': token,
            'scope': scope,
            'actor': actor,
        }

        scraper = cloudscraper.create_scraper(
            browser={'browser': 'chrome', 'platform': 'windows', 'desktop': True, 'mobile': False}
        )

        for attempt in range(1, 21):
            r = scraper.post(submit_url, data=payload, timeout=30)
            try:
                res_json = r.json()
            except ValueError:
                logger.warning("Failed to parse JSON response on checkcaptcha submit: %s", r.text[:200])
                return False

            if "error" in res_json:
                logger.warning("checkcaptcha error from Telegram: %s", res_json['error'])
                return False

            if "pending" in res_json and res_json["pending"]:
                time.sleep(0.2)
                continue

            logger.info("Turnstile token successfully verified by Telegram!")
            return True
        return False
    except Exception as e:
        logger.exception("Error submitting Turnstile token: %s", e)
        return False


async def start_spam_appeal(client: TelegramClient, reason: str, force: bool = False) -> dict:
    """
    Start the multi-step appeal flow with @spambot.
    Returns a dict with 'status', 'message', and optionally 'captcha_url'.
    """
    if not force:
        already_appealed = await check_appeal_history(client)
        if already_appealed:
            return {
                "status": "already_submitted",
                "message": "Banding sudah pernah diajukan sebelumnya.",
            }

    async with client.conversation("spambot") as conv:
        # Step 1: Send /start
        await conv.send_message("/start")
        response = await conv.get_response()

        # Check if already free / no limits
        if "good news" in response.text.lower() or "kabar baik" in response.text.lower() or "no limits" in response.text.lower():
            return {
                "status": "completed",
                "message": response.text,
            }

        # Step 2: Click "This is a mistake" button
        btn = find_button(response, ["mistake", "kesalahan"])
        if not btn:
            return {
                "status": "failed",
                "message": "Tombol 'kesalahan/mistake' tidak ditemukan pada respon pertama.",
            }

        await btn.click()
        response = await conv.get_response()

        # Step 2b: Bot might switch to English and show buttons again
        if find_button(response, ["ok", "what is spam", "i was wrong"]):
            btn_mistake = find_button(response, ["mistake"])
            if btn_mistake:
                await btn_mistake.click()
                response = await conv.get_response()

        # Step 3: Click "Yes" / "Ya"
        btn_yes = find_button(response, ["yes", "ya"])
        if not btn_yes:
            return {
                "status": "failed",
                "message": "Tombol 'Ya/Yes' tidak ditemukan.",
            }

        await btn_yes.click()
        response = await conv.get_response()

        # Step 4: Click "No! Never did that!" / "Tidak pernah"
        btn_no = find_button(response, ["never", "tidak pernah", "no!", "tidak!"])
        if not btn_no:
            return {
                "status": "failed",
                "message": "Tombol konfirmasi tidak pernah melakukan spam tidak ditemukan.",
            }

        await btn_no.click()
        response = await conv.get_response()

        # Step 5: Check for Cloudflare Turnstile Captcha
        captcha_match = re.search(r'(https://telegram\.org/captcha\S+)', response.text)
        if captcha_match:
            captcha_url = captcha_match.group(1).rstrip(').')
            logger.info("Captcha Turnstile detected: %s", captcha_url)

            # Try auto solving if 2captcha key is configured
            settings = get_settings()
            twocaptcha_key = getattr(settings, "TWOCAPTCHA_API_KEY", "")
            if twocaptcha_key:
                logger.info("Found TWOCAPTCHA_API_KEY in settings. Attempting auto solve...")
                try:
                    loop = asyncio.get_running_loop()
                    token = await loop.run_in_executor(
                        None, solve_captcha_via_2captcha_sync, captcha_url, twocaptcha_key
                    )
                    if token:
                        submit_ok = await loop.run_in_executor(
                            None, submit_turnstile_token_sync, captcha_url, token
                        )
                        if submit_ok:
                            # Resume appeal flow by clicking Done
                            btn_done = find_button(response, ["done", "selesai"])
                            if btn_done:
                                await btn_done.click()
                                response = await conv.get_response()
                                
                                # Send appeal reason
                                await conv.send_message(reason)
                                final_resp = await conv.get_response()
                                return {
                                    "status": "completed",
                                    "message": final_resp.text,
                                }
                except Exception as ex:
                    logger.error("Exception in 2captcha automated solve block: %s", ex)

            return {
                "status": "captcha_required",
                "message": "Cloudflare Turnstile Captcha verification required.",
                "captcha_url": captcha_url,
            }

        # Step 6: Click "Done" / "Selesai" (just in case captcha was skipped)
        btn_done = find_button(response, ["done", "selesai"])
        if btn_done:
            await btn_done.click()
            response = await conv.get_response()

        # Step 7: Send reason
        await conv.send_message(reason)
        final_resp = await conv.get_response()
        return {
            "status": "completed",
            "message": final_resp.text,
        }


async def resume_spam_appeal(client: TelegramClient, reason: str) -> dict:
    """
    Resume the appeal flow after the user solves the captcha in their browser.
    Clicks 'Done' / 'Selesai', verifies status, and submits the reason.
    """
    entity = await client.get_entity("spambot")

    # Get the latest message from spambot to click its buttons
    last_msg = None
    async for msg in client.iter_messages(entity, limit=10):
        if not msg.out:
            last_msg = msg
            break

    if not last_msg:
        return {
            "status": "failed",
            "message": "Riwayat chat spambot kosong. Silakan mulai banding dari awal.",
        }

    btn_done = find_button(last_msg, ["done", "selesai"])
    if not btn_done:
        # Check if they are already asking for explanation
        # (e.g. if the captcha was solved and the spambot already transitioned)
        if last_msg.text and ("jelaskan" in last_msg.text.lower() or "explain" in last_msg.text.lower() or "tell us" in last_msg.text.lower()):
            # Send explanation reason
            await client.send_message(entity, reason)
            
            # Read final response
            final_resp = None
            for _ in range(5):
                await asyncio.sleep(1)
                msgs = await client.get_messages(entity, limit=5)
                for m in msgs:
                    if not m.out:
                        final_resp = m
                        break
                if final_resp and final_resp.date > last_msg.date:
                    break

            return {
                "status": "completed",
                "message": final_resp.text if final_resp else "Banding terkirim.",
            }

        return {
            "status": "failed",
            "message": "Tombol 'Done/Selesai' tidak ditemukan pada pesan terakhir.",
        }

    async with client.conversation("spambot") as conv:
        # Click Done
        await btn_done.click()
        response = await conv.get_response()

        # Check if captcha is still required (meaning Turnstile solve was not registered or failed)
        captcha_match = re.search(r'(https://telegram\.org/captcha\S+)', response.text)
        if captcha_match:
            captcha_url = captcha_match.group(1).rstrip(').')
            return {
                "status": "captcha_required",
                "message": "Cloudflare Turnstile Captcha verification still required. Please solve it first.",
                "captcha_url": captcha_url,
            }

        # Otherwise, send reason
        await conv.send_message(reason)
        final_resp = await conv.get_response()
        return {
            "status": "completed",
            "message": final_resp.text,
        }
