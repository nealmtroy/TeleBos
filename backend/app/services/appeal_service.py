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
from app.services.captcha_solver import (
    solve_captcha_via_camoufox,
    solver_enabled,
)

logger = logging.getLogger(__name__)


_TWOCAPTCHA_COOLDOWN_UNTIL: float = 0.0


# Multilingual SpamBot button patterns
MISTAKE_BUTTON_KEYWORDS = [
    "mistake",        # English: "This is a mistake"
    "kesalahan",      # Indonesian: "Ini adalah kesalahan"
    "kesilapan",      # Malay: "Ini adalah satu kesilapan", "Ini kesilapan"
    "satu kesilapan", # Malay variant
    "adalah kesilapan", # Malay variant
    "ошибка",         # Russian: "Это ошибка"
    "xatolik",        # Uzbek: "Bu xatolik"
    "xato",           # Uzbek
    "خطأ",            # Arabic: "هذا خطأ"
    "hata",           # Turkish: "Bu bir hata"
    "un error",       # Spanish: "Es un error" / "Esto es un error"
    "une erreur",     # French: "C'est une erreur"
    "ein fehler",     # German: "Das ist ein Fehler"
    "engano",         # Portuguese: "Isto é um engano"
]

CONFESSION_BUTTON_KEYWORDS = [
    "tersilap",       # Malay: "Saya tersilap, tolong bebaskan saya"
    "i was wrong",    # English: "I was wrong, please release me"
    "saya salah",     # Indonesian: "Saya salah, mohon bebaskan saya"
    "не прав",        # Russian: "Я был не прав"
    "ошибся",         # Russian
    "equivoqué",      # Spanish
    "hatalıydım",     # Turkish
    "hata yaptım",    # Turkish
    "أخطأت",          # Arabic
    "sebenarnya",     # Step 4 Confession: "Sebenarnya… saya melakukannya."
    "actually",       # Step 4 Confession: "Actually, I did it"
    "на самом деле",  # Step 4 Confession
    "aslında",        # Step 4 Confession
    "en realidad",    # Step 4 Confession
]

YES_BUTTON_KEYWORDS = [
    "yes",            # English
    "ya",             # Indonesian / Malay
    "да",             # Russian
    "نعم",            # Arabic
    "evet",           # Turkish
    "oui",            # French
    "si",             # Spanish / Italian
    "sí",             # Spanish
    "sim",            # Portuguese
    "ha",             # Uzbek
]

NEVER_BUTTON_KEYWORDS = [
    "never",          # English: "No! Never did that!"
    "tidak pernah",   # Indonesian: "Tidak! Tidak pernah!"
    "tak pernah",     # Malay: "Tidak! Tak pernah lakukan!"
    "tak pernah lakukan", # Malay
    "no!",            # English
    "tidak!",         # Indonesian / Malay
    "asla",           # Turkish
    "никогда",        # Russian
    "hech qachon",    # Uzbek
    "لم أفعل",        # Arabic
    "jamais",         # French
    "nunca",          # Spanish / Portuguese
    "nada disso",     # Portuguese
]

DONE_BUTTON_KEYWORDS = [
    "done",           # English: "Done"
    "selesai",        # Indonesian / Malay: "Selesai"
    "siap",           # Malay
    "sudah selesai",  # Indonesian / Malay
    "готово",         # Russian: "Готово"
    "tamam",          # Turkish: "Tamam"
    "تم",             # Arabic
    "bajarildi",      # Uzbek
    "tayyor",         # Uzbek
]


def find_button(msg: Message, keywords: list[str]) -> Any | None:
    """Find a button on a message containing any of the keywords (case-insensitive)."""
    if not msg or not getattr(msg, "buttons", None):
        return None
    for row in msg.buttons:
        for btn in row:
            txt = getattr(btn, "text", "") or ""
            txt_lower = txt.lower()
            for kw in keywords:
                if kw.lower() in txt_lower:
                    return btn
    return None


def find_dispute_mistake_button(msg: Message) -> Any | None:
    """
    Find the dispute button ('This is a mistake' / 'Ini adalah satu kesilapan')
    while guaranteeing that confession buttons ('Saya tersilap', 'I was wrong')
    are strictly excluded. Includes positional fallback for standard SpamBot layout.
    """
    if not msg or not getattr(msg, "buttons", None):
        return None

    # Pass 1: Keyword search matching mistake while skipping confession
    for row in msg.buttons:
        for btn in row:
            txt = (getattr(btn, "text", "") or "").lower()
            if any(conf in txt for conf in CONFESSION_BUTTON_KEYWORDS):
                continue
            if any(m in txt for m in MISTAKE_BUTTON_KEYWORDS):
                return btn

    # Pass 2: Fallback for 3-4 button layout in standard SpamBot initial response
    # Layout is typically: [0: OK, 1: What is spam?, 2: Confession, 3: Dispute]
    all_btns = [b for row in msg.buttons for b in row]
    if len(all_btns) >= 3:
        last_btn = all_btns[-1]
        last_txt = (getattr(last_btn, "text", "") or "").lower()
        if not any(conf in last_txt for conf in CONFESSION_BUTTON_KEYWORDS):
            if not any(f in last_txt for f in ["ok", "spam"]):
                logger.info("Matched dispute button by positional fallback: %r", getattr(last_btn, "text", ""))
                return last_btn

    return None


def find_affirmative_yes_button(msg: Message) -> Any | None:
    """
    Find the affirmative 'Yes' / 'Ya' button, avoiding negative buttons ('Tidak', 'No')
    or accidental substring false positives.
    """
    if not msg or not getattr(msg, "buttons", None):
        return None

    negative_words = {"tidak", "no", "нет", "hayır", "hayir", "لا", "yo'q", "non", "não", "batal", "cancel"}

    for row in msg.buttons:
        for btn in row:
            txt = (getattr(btn, "text", "") or "").strip().lower()
            if txt in negative_words:
                continue
            for kw in YES_BUTTON_KEYWORDS:
                if txt == kw or re.search(rf'\b{re.escape(kw)}\b', txt):
                    return btn
    return None


def find_denial_never_button(msg: Message) -> Any | None:
    """
    Find the denial button ('No! Never did that!' / 'Tidak! Tak pernah lakukan!')
    while strictly excluding confession buttons ('Sebenarnya… saya melakukannya.').
    """
    if not msg or not getattr(msg, "buttons", None):
        return None

    for row in msg.buttons:
        for btn in row:
            txt = (getattr(btn, "text", "") or "").strip().lower()
            if any(conf in txt for conf in CONFESSION_BUTTON_KEYWORDS):
                continue
            for kw in NEVER_BUTTON_KEYWORDS:
                if kw in txt:
                    return btn
    return None


def find_done_button(msg: Message) -> Any | None:
    """Find the 'Done' / 'Selesai' button across languages."""
    return find_button(msg, DONE_BUTTON_KEYWORDS)


async def check_appeal_history(client: TelegramClient) -> bool:
    """
    Check chat history with @spambot to see if an appeal has already been submitted.
    Returns True if an appeal is already submitted or in progress, False otherwise.
    """
    try:
        entity = await client.get_entity("spambot")
        from app.utils.spambot_helper import has_recent_appeal_keywords
        async for msg in client.iter_messages(entity, limit=30):
            if msg.text and has_recent_appeal_keywords(msg.text):
                logger.info("Previous appeal detected")
                return True
        return False
    except Exception as e:
        if "cannot find any entity" in str(e).lower():
            return False
        logger.warning("Failed to check appeal history with @spambot: %s", e)
        return False


def _extract_turnstile_params_sync(captcha_url: str) -> dict[str, str | None] | None:
    """Synchronously extract Turnstile parameters from target captcha URL using cloudscraper."""
    import cloudscraper
    from app.utils.url_security import validate_safe_captcha_url

    try:
        validated_url = validate_safe_captcha_url(captcha_url, check_dns=True)
    except ValueError as val_err:
        logger.warning("SSRF blocked in _extract_turnstile_params_sync: %s", val_err)
        return None

    logger.info("Extracting Turnstile parameters from %s", validated_url)
    try:
        scraper = cloudscraper.create_scraper(
            browser={'browser': 'chrome', 'platform': 'windows', 'desktop': True, 'mobile': False}
        )
        resp = scraper.get(validated_url, timeout=30)
        html = resp.text

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

        return {
            "sitekey": sitekey,
            "action": action,
            "cdata": cdata,
            "chl_pagedata": chl_pagedata,
        }
    except Exception as exc:
        logger.warning("Transient error extracting Turnstile parameters: %s", exc)
        return None


async def solve_captcha_via_2captcha_async(captcha_url: str, api_key: str) -> str | None:
    """Solve Turnstile captcha asynchronously via 2captcha without thread pool starvation (RES-04)."""
    global _TWOCAPTCHA_COOLDOWN_UNTIL
    if time.time() < _TWOCAPTCHA_COOLDOWN_UNTIL:
        logger.debug("Skipping 2captcha: balance or auth cooldown active")
        return None

    import httpx
    from app.utils.url_security import validate_safe_captcha_url

    try:
        validated_url = validate_safe_captcha_url(captcha_url, check_dns=True)
    except ValueError as val_err:
        logger.warning("SSRF blocked in solve_captcha_via_2captcha_async: %s", val_err)
        return None

    try:
        loop = asyncio.get_running_loop()
        params = await loop.run_in_executor(None, _extract_turnstile_params_sync, validated_url)
        if not params or not params.get("sitekey"):
            return None

        sitekey = params["sitekey"]
        api_url = "https://api.2captcha.com"
        task_payload = {
            "type": "TurnstileTaskProxyless",
            "websiteURL": captcha_url,
            "websiteKey": sitekey,
        }
        if params.get("action"):
            task_payload["action"] = params["action"]
        if params.get("cdata"):
            task_payload["data"] = params["cdata"]
        if params.get("chl_pagedata"):
            task_payload["pagedata"] = params["chl_pagedata"]

        create_payload = {
            "clientKey": api_key,
            "task": task_payload,
        }

        async with httpx.AsyncClient(timeout=30.0) as http_client:
            resp = await http_client.post(f"{api_url}/createTask", json=create_payload)
            data = resp.json()
            if data.get("errorId") != 0:
                err_code = str(data.get("errorCode", ""))
                err_desc = str(data.get("errorDescription", ""))
                if "zero or negative" in err_desc.lower() or err_code == "ERROR_ZERO_BALANCE":
                    _TWOCAPTCHA_COOLDOWN_UNTIL = time.time() + 3600  # 1 hour cooldown
                    logger.warning("2captcha balance is zero or negative. Pausing 2captcha fallback for 1h: %s", err_desc)
                elif "key" in err_desc.lower() or "auth" in err_desc.lower():
                    _TWOCAPTCHA_COOLDOWN_UNTIL = time.time() + 3600
                    logger.warning("2captcha auth or key error: %s", err_desc)
                else:
                    logger.warning("2captcha createTask failed: %s (code: %s)", err_desc, err_code)
                return None

            task_id = data.get("taskId")
            result_payload = {
                "clientKey": api_key,
                "taskId": task_id,
            }

            # Non-blocking async sleep — does NOT block OS worker threads
            for attempt in range(60):
                await asyncio.sleep(3)
                poll = await http_client.post(f"{api_url}/getTaskResult", json=result_payload)
                result = poll.json()

                if result.get("errorId") != 0:
                    logger.warning("2captcha getTaskResult error: %s", result.get("errorDescription"))
                    return None

                if result.get("status") == "ready":
                    return result["solution"].get("token", "")
                elif result.get("status") != "processing":
                    logger.warning("2captcha unexpected status: %s", result.get("status"))
                    return None

        logger.warning("2captcha timeout waiting for token")
        return None
    except Exception as e:
        logger.warning("Error solving captcha via 2captcha: %s", e)
        return None


def submit_turnstile_token_sync(captcha_url: str, token: str) -> bool:
    """Submit the Turnstile solution token to Telegram's checkcaptcha endpoint."""
    import cloudscraper
    from app.utils.url_security import validate_safe_captcha_url

    try:
        validated_url = validate_safe_captcha_url(captcha_url, check_dns=True)
    except ValueError as val_err:
        logger.warning("SSRF blocked in submit_turnstile_token_sync: %s", val_err)
        return False

    logger.info("Submitting Turnstile token to Telegram...")
    try:
        parsed = urlparse(validated_url)
        params = parse_qs(parsed.query)
        scope = params.get('scope', [''])[0]
        actor = params.get('actor', [''])[0]

        # Sanitize scope and actor to safe alphanumeric / underscore / hyphen tokens
        if not re.match(r'^[a-zA-Z0-9_\-]+$', scope) or not re.match(r'^[a-zA-Z0-9_\-]+$', actor):
            logger.warning("Invalid scope or actor format in captcha_url: scope=%r, actor=%r", scope, actor)
            return False

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


async def generate_ai_appeal_reason(preset_id: str) -> str:
    """Generate a unique appeal message using Groq Llama 3.1 8b model, rotating through up to 3 API keys."""
    settings = get_settings()
    
    # Collect configured keys in order (supporting up to 7 rotation keys)
    api_keys = []
    for i in range(1, 8):
        key_attr = f"GROQ_API_KEY_{i}"
        val = getattr(settings, key_attr, "")
        if val and val.strip():
            api_keys.append((key_attr, val.strip()))
            
    is_indo = preset_id == "ai_indonesian"
    
    if not api_keys:
        logger.warning("No GROQ_API_KEY (1-7) configured in environment settings. Falling back to default preset.")
        if is_indo:
            return "Halo moderator, akun saya terkena restricted secara tidak sengaja. Saya tidak pernah mengirim spam atau iklan kepada siapapun. Mohon periksa kembali akun saya. Terima kasih."
        return "Hello moderator, my account was restricted by mistake. I have never sent any spam or advertising to anyone. Please review my account. Thank you."

    url = "https://api.groq.com/openai/v1/chat/completions"
    prompt = (
        "Tulis pesan unik dan terdengar alami kepada moderator bantuan untuk membebaskan pembatasan akun Telegram.\n"
        "Pesan harus menyatakan bahwa akun dibatasi secara tidak sengaja, dan tidak ada spam, iklan, atau penyalahgunaan yang dikirim.\n"
        "Buat agar terdengar seperti ditulis oleh orang sungguhan dengan gaya tiket bantuan yang kasual, santun, atau ramah.\n"
        "Variasikan struktur dan kata-katanya secara acak agar unik.\n"
        "Jangan sertakan placeholder (seperti [Nama], [Telepon], [Nama Anda]), salam pembuka/penutup formal, atau tanda kutip.\n"
        "Hanya keluarkan teks pesan saja tanpa tambahan format markdown atau penjelasan lain."
    ) if is_indo else (
        "Write a unique, natural-sounding message to a support moderator requesting to unrestrict a Telegram account.\n"
        "The message must state that the account was restricted by mistake, and that no spam, ads, or abuse were sent.\n"
        "Make it sound like it was written by a real person in a casual, conversational, or polite support ticket style.\n"
        "Vary the structure and wording completely.\n"
        "Do not include any placeholders (like [Name], [Phone], [Your Name]), salutations, or greetings unless they are generic.\n"
        "Output ONLY the message text. Do not add quotes, markdown formatting, or introductory phrases."
    )

    import httpx

    configured_model = getattr(settings, "GROQ_MODEL", "openai/gpt-oss-120b") or "openai/gpt-oss-120b"
    model_candidates = [
        configured_model,
        "openai/gpt-oss-120b",
        "openai/gpt-oss-20b",
        "qwen/qwen3.8-27b",
    ]
    seen_models = set()
    models_to_try = []
    for m in model_candidates:
        if m and m not in seen_models:
            seen_models.add(m)
            models_to_try.append(m)

    # Try each API key in order
    for name, api_key in api_keys:
        logger.info("Attempting AI generation using Groq API key from %s", name)
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        for model in models_to_try:
            payload = {
                "model": model,
                "messages": [
                    {"role": "system", "content": "You are a helpful assistant writing a support ticket appeal."},
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.85,
                "max_tokens": 500
            }
            try:
                async with httpx.AsyncClient() as client:
                    resp = await client.post(url, json=payload, headers=headers, timeout=15)
                    if resp.status_code == 200:
                        data = resp.json()
                        text = data["choices"][0]["message"]["content"].strip()
                        if "<think>" in text and "</think>" in text:
                            text = text.split("</think>")[-1].strip()
                        elif "<think>" in text:
                            # Generation cut off while still in reasoning block
                            text = ""
                        text = text.strip('"\'')
                        if not text:
                            logger.warning("Groq model '%s' produced empty text (0 chars) after stripping reasoning tokens, trying next candidate...", model)
                            continue
                        logger.info("Successfully generated AI appeal reason via Groq (%s) using %s (%d chars)", model, name, len(text))
                        return text
                    elif resp.status_code == 404:
                        logger.warning("Groq model '%s' not found for %s (404), trying next model candidate...", model, name)
                        continue
                    else:
                        logger.warning("Groq API (%s with %s) returned error status %d: %s", name, model, resp.status_code, resp.text)
                        break
            except Exception as exc:
                logger.warning("Failed to call Groq API with %s (model %s): %s", name, model, exc)
                break

    logger.error("All configured Groq API keys failed to generate a reason. Falling back to default preset.")
    if is_indo:
        return "Halo moderator, akun saya terkena restricted secara tidak sengaja. Saya tidak pernah mengirim spam atau iklan kepada siapapun. Mohon periksa kembali akun saya dan bebaskan dari pembatasan ini. Terima kasih."
    return "Hello moderator, my account was restricted by mistake. I have never sent any spam or advertising to anyone. Please review my account and lift the restriction. Thank you."


async def start_spam_appeal(client: TelegramClient, reason: str, preset_id: str | None = None, force: bool = False) -> dict:
    """
    Start the multi-step appeal flow with @spambot.
    Returns a dict with 'status', 'message', and optionally 'captcha_url'.
    """
    generated = None
    if preset_id in ("ai_english", "ai_indonesian"):
        generated = await generate_ai_appeal_reason(preset_id)
        reason = generated

    if not force:
        already_appealed = await check_appeal_history(client)
        if already_appealed:
            return {
                "status": "already_submitted",
                "message": "Banding sudah pernah diajukan sebelumnya.",
                "generated_reason": generated
            }

    try:
        async with client.conversation("spambot", timeout=60) as conv:
            # Step 1: Send /start
            from app.utils.spambot_helper import is_clean_status, start_spambot_conversation
            await start_spambot_conversation(client, conv, "appeal")
            response = await conv.get_response()

            # Check if already free / no limits
            from app.utils.spambot_helper import is_clean_status
            if is_clean_status(response.text):
                return {
                    "status": "completed",
                    "message": response.text,
                    "generated_reason": generated
                }

            # Step 2: Click "This is a mistake" button
            btn = find_dispute_mistake_button(response)
            if not btn:
                return {
                    "status": "failed",
                    "message": "Tombol 'kesalahan/mistake' tidak ditemukan pada respon pertama.",
                    "generated_reason": generated
                }

            await btn.click()
            response = await conv.get_response()

            # Step 2b: Bot might switch language or show disambiguation buttons again
            if find_button(response, ["ok", "what is spam", "apa itu spam", "i was wrong", "saya salah", "saya tersilap"]):
                btn_mistake = find_dispute_mistake_button(response)
                if btn_mistake:
                    await btn_mistake.click()
                    response = await conv.get_response()

            # Step 3: Click "Yes" / "Ya"
            btn_yes = find_affirmative_yes_button(response)
            if not btn_yes:
                return {
                    "status": "failed",
                    "message": "Tombol 'Ya/Yes' tidak ditemukan.",
                    "generated_reason": generated
                }

            await btn_yes.click()
            response = await conv.get_response()

            # Step 4: Click "No! Never did that!" / "Tidak pernah" / "Tak pernah"
            btn_no = find_denial_never_button(response)
            if not btn_no:
                return {
                    "status": "failed",
                    "message": "Tombol konfirmasi tidak pernah melakukan spam tidak ditemukan.",
                    "generated_reason": generated
                }

            await btn_no.click()
            response = await conv.get_response()

            # Step 5: Check for Cloudflare Turnstile Captcha
            captcha_url = None
            captcha_match = re.search(r'(https://telegram\.org/captcha[^\s<>"\'\)]+)', response.text)
            if captcha_match:
                candidate_url = captcha_match.group(1).rstrip(').,;')
                from app.utils.url_security import validate_safe_captcha_url
                try:
                    captcha_url = validate_safe_captcha_url(candidate_url, check_dns=True)
                    logger.info("Captcha Turnstile detected and validated: %s", captcha_url)
                except ValueError as val_err:
                    logger.warning("SSRF blocked or invalid candidate captcha URL '%s': %s", candidate_url, val_err)
                    captcha_url = None

            if captcha_url:

                settings = get_settings()
                loop = asyncio.get_running_loop()

                def submit(token: str) -> bool:
                    """Hand the solved token back to Cloudflare, off the event loop.

                    This is a blocking HTTPS round-trip to telegram.org, so it must
                    not run inline on the loop.
                    """
                    return loop.run_in_executor(
                        None, submit_turnstile_token_sync, captcha_url, token
                    )

                # Prefer the local Camoufox solver: no per-solve fee. It is tried
                # first precisely because it is free; 2captcha is only paid for
                # when the local one cannot deliver.
                token = None
                solver_used = None
                if solver_enabled():
                    token = await solve_captcha_via_camoufox(captcha_url)
                    if token:
                        solver_used = "camoufox"
                    else:
                        logger.warning(
                            "Local camoufox solver produced no token; falling back "
                            "to 2captcha if a key is configured."
                        )
                else:
                    logger.info(
                        "CAMOUFOX_SOLVER_ENABLED is false; skipping local Camoufox solver. "
                        "Set CAMOUFOX_SOLVER_ENABLED=true in .env to use the local container."
                    )

                # Fallback: 2captcha, only when a key exists and camoufox did not
                # already deliver.
                if not token:
                    twocaptcha_key = getattr(settings, "TWOCAPTCHA_API_KEY", "")
                    if twocaptcha_key:
                        logger.info(
                            "Using TWOCAPTCHA_API_KEY for captcha solve..."
                        )
                        try:
                            token = await solve_captcha_via_2captcha_async(
                                captcha_url, twocaptcha_key
                            )
                            if token:
                                solver_used = "2captcha"
                        except Exception as ex:
                            logger.warning(
                                "Exception in 2captcha automated solve block: %s", ex
                            )

                if token:
                    try:
                        submit_ok = await submit(token)
                    except Exception as ex:
                        logger.warning("Failed submitting turnstile token: %s", ex)
                        submit_ok = False

                    if submit_ok:
                        # Resume appeal flow by clicking Done
                        btn_done = find_done_button(response)
                        if btn_done:
                            await btn_done.click()
                            response = await conv.get_response()

                        # Send appeal reason
                        await conv.send_message(reason)
                        final_resp = await conv.get_response()
                        logger.info(
                            "Appeal submitted with solver=%s", solver_used
                        )
                        return {
                            "status": "completed",
                            "message": final_resp.text,
                            "generated_reason": generated,
                            "captcha_solver": solver_used,
                        }

                    # The token was obtained but Cloudflare rejected it — almost
                    # always because the URL was spent or the address is
                    # downgraded. Either way, retrying with a second solver would
                    # fail the same way, so report rather than burn more money.
                    logger.warning(
                        "Token from %s was rejected by cloudflare", solver_used
                    )
                    return {
                        "status": "captcha_failed",
                        "message": (
                            "Captcha solved but the token was rejected. The captcha "
                            "URL is single-use; run the appeal again for a fresh one."
                        ),
                        "captcha_url": captcha_url,
                        "captcha_solver": solver_used,
                        "generated_reason": generated,
                    }

                return {
                    "status": "captcha_required",
                    "message": "Cloudflare Turnstile Captcha verification required.",
                    "captcha_url": captcha_url,
                    "generated_reason": generated
                }

            # Step 6: Click "Done" / "Selesai" (just in case captcha was skipped)
            btn_done = find_done_button(response)
            if btn_done:
                await btn_done.click()
                response = await conv.get_response()

            # Step 7: Send reason
            await conv.send_message(reason)
            final_resp = await conv.get_response()
            return {
                "status": "completed",
                "message": final_resp.text,
                "generated_reason": generated
            }
    except asyncio.TimeoutError:
        logger.warning("SpamBot appeal conversation timed out")
        return {
            "status": "failed",
            "message": "Batas waktu komunikasi @SpamBot habis (timeout).",
            "generated_reason": generated,
        }
    except Exception as conv_err:
        logger.warning("Spam appeal conversation failed: %s", conv_err)
        return {
            "status": "failed",
            "message": f"Gagal berkomunikasi dengan @SpamBot: {conv_err}",
            "generated_reason": generated,
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

    btn_done = find_done_button(last_msg)
    if not btn_done:
        # Check if they are already asking for explanation
        # (e.g. if the captcha was solved and the spambot already transitioned)
        if last_msg.text and any(k in last_msg.text.lower() for k in ["jelaskan", "explain", "tell us", "nyatakan", "huraikan"]):
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
        try:
            response = await asyncio.wait_for(conv.get_response(), timeout=5.0)
            resp_text = response.text
        except asyncio.TimeoutError:
            # Fallback if SpamBot edited the message in place rather than sending a new message
            msgs = await client.get_messages("spambot", limit=3)
            resp_text = msgs[0].text if msgs else ""

        # Check if captcha is still required (meaning Turnstile solve was not registered or failed)
        captcha_match = re.search(r'(https://telegram\.org/captcha[^\s<>"\'\)]+)', resp_text)
        if captcha_match:
            candidate_url = captcha_match.group(1).rstrip(').,;')
            from app.utils.url_security import validate_safe_captcha_url
            try:
                safe_url = validate_safe_captcha_url(candidate_url, check_dns=True)
            except ValueError as val_err:
                logger.warning("SSRF blocked or invalid candidate captcha URL '%s': %s", candidate_url, val_err)
                safe_url = None

            if safe_url:
                return {
                    "status": "captcha_required",
                    "message": "Cloudflare Turnstile Captcha verification still required. Please solve it first.",
                    "captcha_url": safe_url,
                }

        # Otherwise, send reason
        await conv.send_message(reason)
        try:
            final_resp = await asyncio.wait_for(conv.get_response(), timeout=8.0)
            final_text = final_resp.text
        except asyncio.TimeoutError:
            msgs = await client.get_messages("spambot", limit=3)
            final_text = msgs[0].text if msgs else "Banding terkirim."

        return {
            "status": "completed",
            "message": final_text,
        }


async def has_submitted_appeal_recently(client: TelegramClient, hours: int = 24) -> bool:
    """
    Check chat history with @spambot to see if an appeal was submitted in the last `hours` hours.
    """
    from datetime import datetime, timezone, timedelta
    from app.utils.spambot_helper import has_recent_appeal_keywords
    try:
        entity = await client.get_entity("spambot")
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(hours=hours)

        async for msg in client.iter_messages(entity, limit=30):
            # Check message date
            msg_date = msg.date
            if msg_date.tzinfo is None:
                msg_date = msg_date.replace(tzinfo=timezone.utc)

            # Iteration is newest first. Once we hit older than cutoff, stop
            if msg_date < cutoff:
                break

            if msg.text and has_recent_appeal_keywords(msg.text):
                return True
        return False
    except Exception as e:
        if "cannot find any entity" in str(e).lower():
            return False
        logger.warning("Failed to check recent appeal history: %s", e)
        return False
