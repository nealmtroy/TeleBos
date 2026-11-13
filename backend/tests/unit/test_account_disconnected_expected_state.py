"""A disconnected account is an expected state, not an application error.

Production signature (24h window, async-runner, 2026-11-13)::

    RuntimeError: Account <uuid> is disconnected. Please reconnect first.
    Traceback (most recent call last):
      ...
      File "app/workers/command_consumer.py", line 519, in process_single_command
        logger.exception("Unexpected error executing action '%s' for %s: %s", ...)

``borrow_client`` raised a bare ``RuntimeError`` when the pool could not hand out
a client, so it fell through to the catch-all handler: one ERROR + traceback per
command aimed at an account whose session had expired. It is a state the product
already models (the UI asks the user to reconnect) — not a defect worth a Sentry
event each time.

The fix gives it a dedicated type (``AccountDisconnectedError``) and answers the
caller with a readable ``ACCOUNT_DISCONNECTED`` error at WARNING level.

The second test pins the same class of bug in the Adaptive Sync sweep, where a
log line read ``db_acc.phone`` *after* ``await db_session.rollback()``: rollback
expires every attribute, so the log itself triggered a lazy load outside the
greenlet and raised ``MissingGreenlet``. The outer handler then reported a
"sync error" that was really the logger's fault.
"""

import inspect
import json
import logging
import uuid
from unittest.mock import AsyncMock, patch

import pytest

from app.schedulers import background_tasks
from app.services.telegram_command_bus import TELEGRAM_RESPONSE_PREFIX
from app.utils.telethon_helpers import AccountDisconnectedError, borrow_client
from app.workers.command_consumer import process_single_command


@pytest.mark.asyncio
async def test_borrow_client_raises_dedicated_type_when_pool_returns_none():
    """The type must be distinguishable without inspecting the message."""
    account = {"id": str(uuid.uuid4()), "session_string": "encrypted"}

    with patch("app.utils.telethon_helpers.decrypt", return_value="session"), patch(
        "app.utils.telethon_helpers.client_pool"
    ) as fake_pool:
        fake_pool.borrow = AsyncMock(return_value=None)

        with pytest.raises(AccountDisconnectedError) as exc_info:
            await borrow_client(account)

    # Still a RuntimeError: existing API handlers map that to HTTP 400.
    assert isinstance(exc_info.value, RuntimeError)
    assert "is disconnected" in str(exc_info.value)


@pytest.mark.asyncio
async def test_disconnected_account_is_answered_at_warning_not_error(caplog):
    """A dead session must not produce an ERROR-level traceback."""
    account_id = str(uuid.uuid4())
    request_id = str(uuid.uuid4())
    raw_cmd = json.dumps(
        {
            "request_id": request_id,
            "account_id": account_id,
            "action": "send_message",
            "params": {"chat_id": 123, "text": "hi"},
        }
    )

    fake_redis = AsyncMock()
    fake_redis.rpush = AsyncMock()
    fake_redis.expire = AsyncMock()

    class _Account:
        session_string = "encrypted"
        id = account_id

    with caplog.at_level(logging.INFO, logger="app.workers.command_consumer"), patch(
        "app.workers.command_consumer.redis_client", fake_redis
    ), patch(
        "app.workers.command_consumer._get_account_by_id",
        AsyncMock(return_value=_Account()),
    ), patch(
        "app.workers.command_consumer.borrow_client",
        AsyncMock(side_effect=AccountDisconnectedError(f"Account {account_id} is disconnected. Please reconnect first.")),
    ):
        await process_single_command(raw_cmd)

    fake_redis.rpush.assert_called_once()
    _key, raw_res = fake_redis.rpush.call_args[0]
    assert _key == f"{TELEGRAM_RESPONSE_PREFIX}{request_id}"

    res = json.loads(raw_res)
    assert res["status"] == "error"
    assert res["error"]["code"] == "ACCOUNT_DISCONNECTED"
    assert "reconnect" in res["error"]["message"].lower()

    client_records = [r for r in caplog.records if r.name == "app.workers.command_consumer"]
    assert not [r for r in client_records if r.levelno >= logging.ERROR], (
        "a disconnected account must not be logged at ERROR: "
        f"{[r.getMessage() for r in client_records if r.levelno >= logging.ERROR]}"
    )
    assert [r for r in client_records if r.levelno == logging.WARNING], (
        "the caller still needs a WARNING breadcrumb that the account was unavailable"
    )


def test_adaptive_sync_logs_do_not_touch_expired_orm_attributes():
    """Log lines must use the prefetched phone, not ``db_acc.phone``.

    ``await db_session.rollback()`` expires loaded attributes; reading one in the
    except-branch re-opens a lazy load outside the async greenlet and raises
    ``MissingGreenlet`` — the log statement becomes the failure it was meant to
    report.
    """
    src = inspect.getsource(background_tasks)

    assert "db_acc.phone" not in src, (
        "Adaptive Sync logs must use the phone captured before the DB round-trip; "
        "reading db_acc.phone after a rollback raises MissingGreenlet"
    )
