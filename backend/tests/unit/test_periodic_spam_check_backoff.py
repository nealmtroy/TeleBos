"""Tests for the periodic spam-check sweep's handling of dead Telegram sessions.

The behaviour worth protecting is not "does the SpamBot conversation work" —
that is Telethon's job. It is that a background sweep must not treat
"this account's session is gone" as a fault, and above all must not retry the
same dead account every hour for the lifetime of the deployment.

Before the fix, `check_spam_status` raised before it ever reached
`account.spam_last_checked_at = ...`. The sweep therefore logged an ERROR
(backed to Sentry as PYTHON-FASTAPI-19) once per hour, per dead account,
forever, because the 12-hour backoff never had a timestamp to work from.
"""

import logging
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.telegram_account import TelegramAccount
from app.services.account_service import AccountDisconnectedError
from app.services.session_manager import SessionManager

PHONE = "+6281234567890"


# ── fakes ───────────────────────────────────────────────────────────────────


class _Rows:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


class _Scalar:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class _FakeSession:
    """Minimal stand-in for AsyncSession: phase 1 yields rows, phase 2 the account."""

    def __init__(self, account, results):
        self._account = account
        self._results = list(results)
        self.commits = 0

    async def execute(self, _stmt):
        return self._results.pop(0) if self._results else _Scalar(None)

    async def commit(self):
        self.commits += 1

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_exc):
        return False


def _account() -> TelegramAccount:
    return TelegramAccount(
        id=uuid.uuid4(),
        phone=PHONE,
        is_active=True,
        for_sale=False,
        spam_last_checked_at=None,
    )


@pytest.fixture
def sweep(monkeypatch):
    """A SessionManager whose sweep sees exactly one never-checked account."""
    manager = SessionManager()
    manager._running = True
    account = _account()

    results = [_Rows([account]), _Scalar(account)]
    # A fresh session per `async with`, but both must share the same account
    # object so assertions can see the fields the sweep mutated.
    sessions = [_FakeSession(account, [results[0]]), _FakeSession(account, [results[1]])]
    factory = MagicMock(side_effect=sessions)
    monkeypatch.setattr("app.database.async_session_factory", factory)

    manager.is_account_in_active_job = AsyncMock(return_value=False)
    return manager, account


# ── the exception type itself ───────────────────────────────────────────────


def test_account_disconnected_error_stays_a_runtime_error():
    """API handlers map RuntimeError to HTTP 400; the subclass must keep that."""
    assert issubclass(AccountDisconnectedError, RuntimeError)
    assert str(AccountDisconnectedError("Account is disconnected. Please re-login.")) == (
        "Account is disconnected. Please re-login."
    )


# ── the regression: a dead session must not become a recurring ERROR ─────────


async def test_dead_session_is_recorded_so_the_sweep_backs_off(sweep, caplog):
    manager, account = sweep

    with caplog.at_level(logging.INFO):
        with (
            patch(
                "app.services.account_service.check_spam_status",
                AsyncMock(side_effect=AccountDisconnectedError("Account is disconnected. Please re-login.")),
            ),
            patch("app.services.session_manager.client_pool") as pool,
            patch("asyncio.sleep", new=AsyncMock()),
        ):
            await manager._check_all_accounts_spam()

    # This is the load-bearing assertion: without a timestamp the next sweep
    # selects the account again and logs another Sentry event.
    assert account.spam_last_checked_at is not None, (
        "a disconnected account must still record that it was checked, "
        "otherwise the 12h backoff never engages and it is retried forever"
    )

    errors = [r for r in caplog.records if r.levelno >= logging.ERROR]
    assert not errors, f"disconnected session logged as ERROR: {[r.getMessage() for r in errors]}"

    # The client must not be left behind in the pool either.
    pool.remove.assert_called_once()


async def test_unexpected_errors_are_still_logged_as_error(sweep, caplog):
    """Guard against the fix swallowing genuine faults."""
    manager, _account = sweep

    with caplog.at_level(logging.INFO):
        with (
            patch(
                "app.services.account_service.check_spam_status",
                AsyncMock(side_effect=RuntimeError("Telethon exploded")),
            ),
            patch("app.services.session_manager.client_pool"),
            patch("asyncio.sleep", new=AsyncMock()),
        ):
            await manager._check_all_accounts_spam()

    errors = [r for r in caplog.records if r.levelno >= logging.ERROR]
    assert errors, "an unexpected failure must still surface at ERROR level"