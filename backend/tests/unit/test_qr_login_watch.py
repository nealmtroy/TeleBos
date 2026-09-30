"""QR login watcher error classification (PYTHON-FASTAPI-V)."""

import asyncio
import logging
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.api.accounts import _pending_qr_logins, watch_qr_login


@pytest.mark.asyncio
async def test_expired_token_is_not_logged_as_error(caplog):
    """An unscanned QR is an ordinary end state, not a fault.

    Telethon raises a bare TimeoutError whose str() is "", which used to
    produce the contentless "watching failed: " in Sentry.
    """
    qr_id = "qr-expired-test"
    _pending_qr_logins[qr_id] = {
        "client": None,
        "status": "pending",
        "created_at": 0.0,
        "account_id": None,
        "error": None,
    }
    client = MagicMock()
    client.disconnect = AsyncMock()
    qr_login = MagicMock()
    qr_login.wait = AsyncMock(side_effect=asyncio.TimeoutError())

    with caplog.at_level(logging.ERROR, logger="app.api.accounts"):
        await watch_qr_login(qr_id, client, qr_login, "user-1")

    assert _pending_qr_logins[qr_id]["status"] == "expired"
    assert not [r for r in caplog.records if r.levelno >= logging.ERROR]
    _pending_qr_logins.pop(qr_id, None)


@pytest.mark.asyncio
async def test_real_failure_logs_exception_type(caplog):
    """A genuine fault must still be an error, and name its type.

    The exception message alone can be empty, so the type is what makes the
    log line diagnosable.
    """
    qr_id = "qr-failed-test"
    _pending_qr_logins[qr_id] = {
        "client": None,
        "status": "pending",
        "created_at": 0.0,
        "account_id": None,
        "error": None,
    }
    client = MagicMock()
    client.disconnect = AsyncMock()
    qr_login = MagicMock()
    qr_login.wait = AsyncMock(side_effect=ValueError("boom"))

    with caplog.at_level(logging.ERROR, logger="app.api.accounts"):
        await watch_qr_login(qr_id, client, qr_login, "user-1")

    errors = [r for r in caplog.records if r.levelno >= logging.ERROR]
    assert errors, "a real failure must still be logged as an error"
    assert "ValueError" in errors[0].getMessage()
    assert _pending_qr_logins[qr_id]["status"] == "failed"
    _pending_qr_logins.pop(qr_id, None)
