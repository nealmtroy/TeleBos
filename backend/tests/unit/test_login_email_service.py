from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from telethon.errors import BadRequestError

from app.services import settings_service


async def test_verify_login_email_maps_email_not_allowed_to_a_safe_message(monkeypatch):
    account = SimpleNamespace(id="account-id", session_string="encrypted-session")
    client = AsyncMock(side_effect=BadRequestError(None, "EMAIL_NOT_ALLOWED", 400))

    monkeypatch.setattr(settings_service, "decrypt", lambda _: "session")
    monkeypatch.setattr(settings_service.client_pool, "get", AsyncMock(return_value=client))

    with pytest.raises(ValueError, match="Telegram does not allow this email address"):
        await settings_service.verify_login_email(account, "blocked@example.com", "123456")
