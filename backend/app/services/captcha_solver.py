"""Talk to the local Camoufox solver service, with 2captcha as the backstop.

Why this shape:

* The solver is a separate container, so the backend must treat it as a network
  dependency that can be slow, down, or simply not deployed yet. Every call is
  bounded by a timeout and returns ``None`` rather than raising, because a
  captcha failure must never abort the appeal — the caller decides whether to
  fall back.
* 2captcha stays wired. If the solver is unreachable, has no token, or is
  disabled by config, appeals keep working exactly as before. The point is to
  remove the per-solve fee when we can, not to create a new single point of
  failure.
* The captcha URL is single-use and short-lived, so it is never cached and never
  retried. A stale URL comes back as a redirect to the homepage, which the
  solver reports as "expired" — retrying that is pure waste.
"""

import asyncio
import logging

import httpx

logger = logging.getLogger(__name__)

# The solver may need to launch a page and wait out a Turnstile challenge; give
# it more than a typical HTTP timeout but far less than an appeal worker should
# ever block.
DEFAULT_SOLVER_URL = "http://camoufox-solver:8000"
DEFAULT_TIMEOUT = 90.0
# Reconnecting each call costs a handshake; the solve is long enough that a
# pooled client is clearly worth it.
_CLIENT: httpx.AsyncClient | None = None
_CLIENT_URL: str | None = None


def get_settings():
    from app.config import get_settings as _get

    return _get()


async def _client() -> httpx.AsyncClient:
    """Shared client, rebuilt if the configured URL changed."""
    global _CLIENT, _CLIENT_URL

    url = getattr(get_settings(), "CAMOUFOX_SOLVER_URL", "") or DEFAULT_SOLVER_URL
    if _CLIENT is None or _CLIENT_URL != url:
        if _CLIENT is not None:
            await _CLIENT.aclose()
        _CLIENT = httpx.AsyncClient(
            base_url=url,
            timeout=DEFAULT_TIMEOUT,
            limits=httpx.Limits(max_connections=4, max_keepalive_connections=2),
        )
        _CLIENT_URL = url
    return _CLIENT


async def close_client() -> None:
    """Release the pooled client. Call from the app's shutdown hook."""
    global _CLIENT, _CLIENT_URL
    if _CLIENT is not None:
        await _CLIENT.aclose()
        _CLIENT = None
        _CLIENT_URL = None


def solver_enabled() -> bool:
    """True when the local solver is switched on.

    Default off: a deployment that upgrades the backend before the solver
    container exists must not start calling something that isn't there.
    """
    return bool(getattr(get_settings(), "CAMOUFOX_SOLVER_ENABLED", False))


async def solve_captcha_via_camoufox(
    captcha_url: str, poll_seconds: int | None = None
) -> str | None:
    """Solve one Telegram Turnstile captcha with the local Camoufox service.

    Returns the token, or ``None`` on any failure. Never raises — the caller
    falls back to 2captcha and the appeal must not fail because of the solver.
    """
    if not solver_enabled():
        logger.debug("camoufox solver disabled by config")
        return None

    from app.utils.url_security import validate_safe_captcha_url
    try:
        validated_url = validate_safe_captcha_url(captcha_url, check_dns=True)
    except ValueError as val_err:
        logger.warning("SSRF blocked in solve_captcha_via_camoufox: %s", val_err)
        return None

    client = await _client()
    payload: dict = {"url": validated_url}
    if poll_seconds:
        payload["poll_seconds"] = poll_seconds

    try:
        resp = await client.post("/solve", json=payload)
    except httpx.HTTPError as exc:
        # Unreachable or timed out. Expected whenever the container is not
        # deployed, so this is a log line, not an error.
        logger.warning("camoufox solver unreachable: %s: %s", type(exc).__name__, exc)
        return None

    if resp.status_code != 200:
        logger.warning(
            "camoufox solver returned HTTP %s: %s",
            resp.status_code,
            resp.text[:200],
        )
        return None

    try:
        data = resp.json()
    except ValueError:
        logger.warning("camoufox solver returned non-JSON: %s", resp.text[:200])
        return None

    if data.get("ok") and data.get("token"):
        logger.info(
            "camoufox solved captcha in %ss (interactive=%s)",
            data.get("elapsed_seconds"),
            data.get("interactive"),
        )
        return data["token"]

    # The service distinguishes its failure modes; surface the reason because
    # "no token" alone is not actionable.
    logger.warning(
        "camoufox returned no token: %s (landed=%s widget=%s interactive=%s)",
        data.get("detail"),
        data.get("landed_url"),
        data.get("widget_rendered"),
        data.get("interactive"),
    )
    return None


async def solver_selftest() -> dict:
    """Ask the solver to load a page. Used by health checks and by hand."""
    client = await _client()
    try:
        resp = await client.get("/selftest", timeout=30.0)
        return {"status_code": resp.status_code, **resp.json()}
    except httpx.HTTPError as exc:
        return {"error": f"{type(exc).__name__}: {exc}"}


__all__ = [
    "close_client",
    "solve_captcha_via_camoufox",
    "solver_enabled",
    "solver_selftest",
]
