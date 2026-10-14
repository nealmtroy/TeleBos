"""Standalone Cloudflare Turnstile solver driven by Camoufox.

Telegram's spam-appeal flow hands out a one-shot captcha URL at
``telegram.org/captcha?scope=sbot_spam&actor=...``. The token that comes back is
bound to that scope/actor pair, so it has to be produced by a real browser
sitting on the real page — which is what this service does.

It replaces 2captcha: same contract (URL in, token out), no per-solve fee. The
token is only worth anything for a short window, so the browser is launched once
at startup and reused, rather than per request.

Runs as its own container so the ~2.8 GB browser image and the GTK/GL
dependencies stay out of the backend image. Bound to the compose network only —
there is no reason to publish it.
"""

import asyncio
import logging
import os
from contextlib import asynccontextmanager

import httpx
from camoufox.async_api import AsyncCamoufox
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, HttpUrl, field_validator

from url_security import is_prohibited_target, validate_safe_captcha_url

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
)
logger = logging.getLogger("camoufox-solver")

# Turnstile issues a token in a couple of seconds when it is satisfied, and one
# is never valid for long. Setting a 15s default ensures we solve rapidly or fail fast
# before upstream reverse proxies timeout.
TOKEN_POLL_SECONDS = int(os.getenv("SOLVER_POLL_SECONDS", "15"))
NAV_TIMEOUT_MS = int(os.getenv("SOLVER_NAV_TIMEOUT_MS", "30000"))
# Serialise solves: one shared browser, and Turnstile is unhappy with a burst of
# parallel challenges from one address.
_SOLVE_LOCK = asyncio.Lock()

# Copied straight off the page when it has not been satisfied and wants the human
# to act. Its presence is the difference between "wrong IP" and "no token yet".
_INTERACTIVE_PHRASES = [
    "verify you are human",
    "checking your browser",
    "additional verification",
    "attention required",
]


class SolveRequest(BaseModel):
    url: HttpUrl = Field(
        ...,
        description="The live telegram.org/captcha URL, scope+actor included.",
    )
    poll_seconds: int | None = Field(
        None,
        ge=5,
        le=90,
        description="Override the default token wait. Usually leave unset.",
    )

    @field_validator("url")
    @classmethod
    def validate_url(cls, v: HttpUrl) -> HttpUrl:
        # Strict validation: HTTPS only, telegram.org/t.me host, /captcha path, no private IPs
        validate_safe_captcha_url(str(v), check_dns=True)
        return v


class SolveResponse(BaseModel):
    ok: bool
    token: str | None = None
    # Diagnostics, so a failure says *why* it failed instead of just "no token".
    landed_url: str | None = None
    title: str | None = None
    widget_rendered: bool = False
    interactive: bool = False
    detail: str | None = None
    elapsed_seconds: float | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Launch the browser once. Per-request launch costs ~2s and a lot of memory,
    # and the profile/fingerprint warm-up helps Turnstile rather than hurting it.
    # disable_coop=True is required to interact with cross-origin Turnstile iframes.
    app.state.browser_cm = AsyncCamoufox(
        headless=True,
        humanize=True,
        disable_coop=True,
        i_know_what_im_doing=True,
    )
    app.state.browser = await app.state.browser_cm.__aenter__()
    logger.info("camoufox browser ready")
    try:
        yield
    finally:
        await app.state.browser_cm.__aexit__(None, None, None)
        logger.info("camoufox browser closed")


app = FastAPI(title="camoufox-solver", version="1.0.0", lifespan=lifespan)


@app.get("/health")
async def health() -> dict:
    browser = getattr(app.state, "browser", None)
    if browser is None:
        raise HTTPException(status_code=503, detail="browser not ready")
    return {"status": "ok", "browser": "ready"}


@app.get("/selftest")
async def selftest() -> dict:
    """Cheap end-to-end check that the browser can still load pages.

    Useful after a container restart: it distinguishes "browser is broken" from
    "Telegram handed us an expired URL", which look identical from the outside.
    """
    url = os.getenv("SOLVER_SELFTEST_URL", "https://telegram.org")
    if is_prohibited_target(url):
        raise HTTPException(status_code=400, detail="Prohibited selftest URL")
    async with _SOLVE_LOCK:
        page = await app.state.browser.new_page()
        try:
            resp = await page.goto(
                url, timeout=NAV_TIMEOUT_MS, wait_until="domcontentloaded"
            )
            return {
                "ok": True,
                "status": resp.status if resp else None,
                "landed": page.url,
                "title": await page.title(),
            }
        except Exception as exc:
            raise HTTPException(
                status_code=502, detail=f"{type(exc).__name__}: {exc}"
            ) from exc
        finally:
            await page.close()


@app.post("/solve", response_model=SolveResponse)
async def solve(req: SolveRequest) -> SolveResponse:
    target = str(req.url)
    # Re-validate target URL
    try:
        validate_safe_captcha_url(target, check_dns=True)
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))

    poll_seconds = req.poll_seconds or TOKEN_POLL_SECONDS
    started = asyncio.get_running_loop().time()

    logger.info("solve requested: %s", target)
    page = None
    try:
        # One solve at a time — the browser is shared and Turnstile rate-limits
        # a single address harder than it rate-limits a single user.
        async with _SOLVE_LOCK:
            page = await app.state.browser.new_page()

            # Intercept and block any request attempting to access internal/private resources
            async def intercept_route(route):
                req_url = route.request.url
                if is_prohibited_target(req_url):
                    logger.warning("SSRF blocked by browser route interception: %s", req_url)
                    await route.abort("blockedbyclient")
                else:
                    await route.continue_()

            await page.route("**/*", intercept_route)

            cloudflare_calls = 0

            def note_request(request):
                nonlocal cloudflare_calls
                if "challenges.cloudflare.com" in request.url:
                    cloudflare_calls += 1

            page.on("request", note_request)

            try:
                resp = await page.goto(
                    target,
                    timeout=NAV_TIMEOUT_MS,
                    wait_until="domcontentloaded",
                )
            except Exception as exc:
                elapsed = asyncio.get_running_loop().time() - started
                logger.warning(
                    "navigation failed for %s: %s: %s",
                    target, type(exc).__name__, exc,
                )
                return SolveResponse(
                    ok=False,
                    detail=f"navigation failed: {type(exc).__name__}: {exc}",
                    elapsed_seconds=round(elapsed, 2),
                )

            landed = page.url
            title = await page.title()
            status = resp.status if resp else None
            logger.info(
                "landed=%s status=%s title=%r", landed, status, title
            )

            # Telegram answers a spent captcha URL with a redirect to the
            # homepage, so a redirect away from /captcha is a dead URL, not a
            # solve failure. Say so plainly.
            if "/captcha" not in landed:
                elapsed = asyncio.get_running_loop().time() - started
                return SolveResponse(
                    ok=False,
                    landed_url=landed,
                    title=title,
                    detail=(
                        "captcha URL appears expired — it no longer serves the "
                        "widget. Re-run the spambot flow for a fresh URL."
                    ),
                    elapsed_seconds=round(elapsed, 2),
                )

            token = None
            has_clicked = False
            for step in range(poll_seconds):
                await asyncio.sleep(1)
                try:
                    token = await page.evaluate(
                        """() => {
                            const el = document.querySelector(
                                'input[name="cf-turnstile-response"]'
                            );
                            if (el && el.value) return el.value;
                            if (window.turnstile && typeof window.turnstile.getResponse === 'function') {
                                const resp = window.turnstile.getResponse();
                                if (resp) return resp;
                            }
                            return null;
                        }"""
                    )
                except Exception as exc:
                    logger.warning("token poll failed: %s", exc)
                    break

                if token:
                    break

                # If after 2 seconds no token is generated automatically, Turnstile likely requires
                # interaction (checkbox click / challenge stage). Perform humanized click!
                if step >= 2 and not has_clicked:
                    # Method A: Click inside the cross-origin Cloudflare frame directly
                    for frame in page.frames:
                        if "challenges.cloudflare.com" in frame.url:
                            try:
                                for sel in (
                                    'input[type="checkbox"]',
                                    '#challenge-stage',
                                    '.ctp-checkbox-label',
                                    '[role="checkbox"]',
                                    'div#cf-stage',
                                    '#cf-turnstile',
                                ):
                                    loc = frame.locator(sel)
                                    if await loc.count() > 0:
                                        logger.info("Clicking Turnstile element '%s' in frame", sel)
                                        await loc.first.click(timeout=1500)
                                        has_clicked = True
                                        break
                            except Exception as click_err:
                                logger.debug("Frame element click ignored: %s", click_err)

                    # Method B: If frame internal locator didn't click, click iframe bounding box
                    if not has_clicked:
                        try:
                            cf_iframe = page.locator('iframe[src*="challenges.cloudflare.com"]').first
                            if await cf_iframe.count() > 0:
                                box = await cf_iframe.bounding_box()
                                if box and box["width"] > 0 and box["height"] > 0:
                                    click_x = box["x"] + min(32, box["width"] / 4)
                                    click_y = box["y"] + box["height"] / 2
                                    logger.info(
                                        "Clicking Turnstile iframe bounding box at (%.1f, %.1f)",
                                        click_x, click_y,
                                    )
                                    await page.mouse.click(click_x, click_y)
                                    has_clicked = True
                        except Exception as box_err:
                            logger.debug("Iframe box click ignored: %s", box_err)

            state = await page.evaluate(
                """(phrases) => {
                    const w = document.querySelector(
                        'iframe[src*="challenges.cloudflare.com"]');
                    const body = document.body.innerText || '';
                    const hay = body.toLowerCase();
                    return {
                        iframe: !!w,
                        interactive: phrases.some((p) => hay.includes(p)),
                        text: body.slice(0, 200).replace(/\\s+/g, ' '),
                    };
                }""",
                _INTERACTIVE_PHRASES,
            )

            has_cf_frame = any("challenges.cloudflare.com" in f.url for f in page.frames)
            widget_rendered = state["iframe"] or has_cf_frame

            elapsed = asyncio.get_running_loop().time() - started

            if token:
                logger.info(
                    "token obtained len=%d in %.1fs (cf calls=%d)",
                    len(token), elapsed, cloudflare_calls,
                )
                return SolveResponse(
                    ok=True,
                    token=token,
                    landed_url=landed,
                    title=title,
                    widget_rendered=True,
                    interactive=state["interactive"] or has_clicked,
                    elapsed_seconds=round(elapsed, 2),
                )

            # No token: distinguish the causes
            if state["interactive"] or has_clicked:
                detail = (
                    "widget rendered and clicked, but issued no token — this address is "
                    "being downgraded or blocked by Cloudflare."
                )
            elif cloudflare_calls == 0 and not has_cf_frame:
                detail = (
                    "no Turnstile traffic at all — the widget never loaded. "
                    "Usually an expired or malformed captcha URL."
                )
            else:
                detail = (
                    "widget made Cloudflare calls but issued no token within "
                    f"{poll_seconds}s."
                )

            logger.warning(
                "no token: interactive=%s cf_calls=%d text=%r",
                state["interactive"] or has_clicked, cloudflare_calls, state["text"][:120],
            )
            return SolveResponse(
                ok=False,
                landed_url=landed,
                title=title,
                widget_rendered=widget_rendered,
                interactive=state["interactive"] or has_clicked,
                detail=detail,
                elapsed_seconds=round(elapsed, 2),
            )

    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    finally:
        if page is not None:
            try:
                await page.close()
            except Exception:
                # A page that will not close must not mask the real result.
                pass
