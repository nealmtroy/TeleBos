from types import SimpleNamespace
from unittest.mock import AsyncMock

from app.services import settings_service, twofa_service


async def test_get_live_2fa_status_maps_telegram_password_details():
    client = AsyncMock()
    client.return_value = SimpleNamespace(
        has_password=True,
        has_recovery=True,
        hint="safe hint",
        login_email_pattern="sa***@example.com",
        email_unconfirmed_pattern=None,
    )

    status = await twofa_service.get_live_2fa_status(client)

    assert status == {
        "enabled": True,
        "has_recovery": True,
        "hint": "safe hint",
        "login_email_pattern": "sa***@example.com",
        "unconfirmed_email_pattern": None,
    }


async def test_get_live_2fa_status_returns_unknown_when_telegram_check_fails():
    client = AsyncMock(side_effect=RuntimeError("connection lost"))

    assert await twofa_service.get_live_2fa_status(client) is None


async def test_settings_status_preserves_cached_value_when_live_check_is_unknown(monkeypatch):
    account = SimpleNamespace(twofa_enabled=True)
    monkeypatch.setattr(twofa_service, "get_account_live_2fa_status", AsyncMock(return_value=None))

    status = await settings_service.get_2fa_status(account)

    assert status == {
        "enabled": True,
        "has_recovery": None,
        "hint": None,
        "login_email_pattern": None,
        "unconfirmed_email_pattern": None,
        "live_checked": False,
    }


async def test_settings_status_marks_successful_telegram_check_as_live(monkeypatch):
    account = SimpleNamespace(twofa_enabled=False)
    monkeypatch.setattr(
        twofa_service,
        "get_account_live_2fa_status",
        AsyncMock(
            return_value={
                "enabled": True,
                "has_recovery": False,
                "hint": None,
                "login_email_pattern": None,
                "unconfirmed_email_pattern": None,
            }
        ),
    )

    status = await settings_service.get_2fa_status(account)

    assert status["enabled"] is True
    assert status["live_checked"] is True
