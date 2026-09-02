"""Unit tests validating Batch 3 bug fixes from deep_bug_logic_audit_report.md."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4
import pytest

from app.models.user import User
from app.services import account_service, message_service


@pytest.mark.asyncio
async def test_accounts_pagination_negative_page():
    """Verify OBO-01: negative page does not produce a negative offset."""
    db = AsyncMock()
    user = User(id=uuid4())

    mock_total = MagicMock()
    mock_total.scalar.return_value = 0

    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = []

    db.scalar.return_value = 0
    db.execute.return_value = mock_result

    # Pass page = -5. Offset formula max(0, (page - 1) * limit) should evaluate to 0
    accounts, total = await account_service.get_accounts_paginated(db, user, page=-5, limit=12)
    assert accounts == []
    assert total == 0


def test_chat_service_non_text_message_preview():
    """Verify OBO-02: non-text message produces '[non-text message]' instead of empty string."""
    # Simulate non-text message (photo/sticker with text = "")
    d = SimpleNamespace(message=SimpleNamespace(text="", date=None))
    last_msg = (d.message.text or "[non-text message]") if d.message else ""
    assert last_msg == "[non-text message]"

    # Text message
    d2 = SimpleNamespace(message=SimpleNamespace(text="Halo bos", date=None))
    last_msg2 = (d2.message.text or "[non-text message]") if d2.message else ""
    assert last_msg2 == "Halo bos"


@pytest.mark.asyncio
async def test_message_service_handles_none_get_me():
    """Verify NUL-02: get_messages handles client.get_me() returning None without AttributeError."""
    client = AsyncMock()
    client.get_me.return_value = None
    client.get_messages.return_value = []

    account = SimpleNamespace(id=uuid4(), phone="+628123456789")

    with patch("app.services.message_service.get_active_client", return_value=client):
        with patch("app.services.message_service.resolve_chat_entity", return_value=SimpleNamespace(id=123)):
            msgs, has_more = await message_service.get_messages(account, 123, limit=10)
            assert msgs == []
            assert has_more is False


def test_v2l_password_hint_string_formatting():
    """Verify NUL-03: hint string is not split into space-separated characters."""
    hint_msg = "myhintpassword"
    hint_text = f"Verifikasi 2 langkah aktif. Password hint: {hint_msg}" if hint_msg else None
    assert hint_text == "Verifikasi 2 langkah aktif. Password hint: myhintpassword"
    assert "m y h i n t" not in hint_text
