"""Regression tests for PYTHON-FASTAPI-17 and PYTHON-FASTAPI-11.

**17 — RuntimeError: No response returned.**  ``SecurityHeadersMiddleware`` was a
``BaseHTTPMiddleware`` subclass.  ``BaseHTTPMiddleware`` runs the downstream app in
a task group; when the endpoint raises, the group's ``__aexit__`` fires before
``call_next`` resumes, so ``call_next`` raised ``RuntimeError("No response
returned.")`` and Starlette wrapped the real failure in an ``ExceptionGroup``.
Every failing endpoint reported that instead of its own traceback, hiding real
bugs and making every trace unreadable.  Rewritten as pure ASGI.

**11 — FrozenMethodInvalidError: FLOOD.**  ``mark_read`` sent a read receipt with
no FloodWait handling, so Telegram rate-limiting surfaced as an opaque 500 and was
reported as an application fault.  It now records the flood against the adaptive
controller and raises a readable RuntimeError naming the retry window.
"""

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ── PYTHON-FASTAPI-17: SecurityHeadersMiddleware is pure ASGI ────────────────


def test_security_headers_middleware_is_not_basehttp():
    """The ExceptionGroup wrapper only exists in BaseHTTPMiddleware."""
    from starlette.middleware.base import BaseHTTPMiddleware

    from app.main import SecurityHeadersMiddleware

    assert not issubclass(SecurityHeadersMiddleware, BaseHTTPMiddleware)


@pytest.mark.asyncio
async def test_headers_added_on_success():
    """All five hardening headers still reach the client."""
    from app.main import SecurityHeadersMiddleware

    seen: list[dict] = []

    async def app(scope, receive, send):
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    async def send(message):
        seen.append(message)

    async def receive():  # pragma: no cover - never awaited
        return {"type": "http.request"}

    mw = SecurityHeadersMiddleware(app)
    await mw({"type": "http", "headers": []}, receive, send)

    start = next(m for m in seen if m["type"] == "http.response.start")
    headers = {k.decode().lower(): v.decode() for k, v in start["headers"]}
    assert headers["x-content-type-options"] == "nosniff"
    assert headers["x-frame-options"] == "DENY"
    assert headers["x-xss-protection"] == "0"
    assert "strict-transport-security" in headers
    assert "frame-ancestors 'none'" in headers["content-security-policy"]


@pytest.mark.asyncio
async def test_endpoint_exception_propagates_untouched():
    """The real error must reach Sentry, not be masked as "No response returned"."""
    from app.main import SecurityHeadersMiddleware

    sentinel = ValueError("boom from the endpoint")

    async def app(scope, receive, send):
        raise sentinel

    async def send(message):  # pragma: no cover - never reached
        pass

    async def receive():  # pragma: no cover - never reached
        return {"type": "http.request"}

    mw = SecurityHeadersMiddleware(app)
    with pytest.raises(ValueError) as excinfo:
        await mw({"type": "http", "headers": []}, receive, send)

    assert excinfo.value is sentinel


@pytest.mark.asyncio
async def test_non_http_scope_passes_through():
    """A lifespan scope must bypass the header wrapper untouched."""
    from app.main import SecurityHeadersMiddleware

    called = False

    async def app(scope, receive, send):
        nonlocal called
        called = True

    mw = SecurityHeadersMiddleware(app)

    async def noop():  # pragma: no cover - never reached
        return {}

    await mw({"type": "lifespan"}, noop, noop)
    assert called is True


# ── PYTHON-FASTAPI-11: FloodWait in mark_read ───────────────────────────────


def _account(account_id: str | None = None):
    acct = MagicMock()
    acct.id = account_id or uuid.uuid4()
    acct.session_string = "encrypted-blob"
    return acct


@pytest.mark.asyncio
async def test_mark_read_handles_flood_wait():
    """FLOOD becomes a readable RuntimeError, not an opaque 500."""
    from telethon.errors import FloodWaitError

    from app.services.chat_service import mark_read

    acct = _account()
    client = MagicMock()
    # Telethon's FloodWaitError takes `capture` as its second arg; that is what
    # lands on `.seconds`. Constructing it via the positional form mirrors how
    # Telethon itself builds it from the RPC error.
    client.send_read_acknowledge = AsyncMock(
        side_effect=FloodWaitError(request=None, capture=42)
    )
    client.is_connected = MagicMock(return_value=True)

    db = MagicMock()
    db.execute = AsyncMock()
    db.commit = AsyncMock()

    with patch("app.services.chat_service.client_pool") as pool, \
         patch("app.services.chat_service.decrypt", return_value="session"), \
         patch("app.services.chat_service.resolve_chat_entity", AsyncMock(return_value="entity")):
        pool.get = AsyncMock(return_value=client)

        with pytest.raises(RuntimeError) as excinfo:
            await mark_read(db, acct, 123456)

    assert "rate limiting" in str(excinfo.value).lower()
    assert "42" in str(excinfo.value)
    # The flood must be recorded so the next attempt backs off...
    from app.utils.flood_control import flood_controller

    assert flood_controller.get_delay(str(acct.id)) > 0
    # ...and the unread count must NOT be zeroed, since the receipt never landed.
    db.commit.assert_not_awaited()

    flood_controller.reset(str(acct.id))


@pytest.mark.asyncio
async def test_mark_read_success_clears_flood_and_commits():
    """A successful receipt records success and commits the unread reset."""
    from app.services.chat_service import mark_read

    acct = _account()
    client = MagicMock()
    client.send_read_acknowledge = AsyncMock(return_value=None)
    client.is_connected = MagicMock(return_value=True)

    db = MagicMock()
    db.execute = AsyncMock()
    db.commit = AsyncMock()

    with patch("app.services.chat_service.client_pool") as pool, \
         patch("app.services.chat_service.decrypt", return_value="session"), \
         patch("app.services.chat_service.resolve_chat_entity", AsyncMock(return_value="entity")):
        pool.get = AsyncMock(return_value=client)
        await mark_read(db, acct, 123456)

    db.commit.assert_awaited_once()