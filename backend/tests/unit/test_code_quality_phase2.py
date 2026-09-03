"""Unit tests for Code Quality Fase 2 (Phone utilities and SpamBot unblocking helper)."""

from unittest.mock import AsyncMock, MagicMock
import pytest
from telethon.errors import YouBlockedUserError

from app.utils.phone import (
    clean_phone_number,
    get_country_from_phone,
    get_locale_from_phone,
)
from app.utils.spambot_helper import start_spambot_conversation


def test_phone_utils_country_and_locale_resolution():
    """Verify phone normalization, country extraction and locale mapping."""
    assert clean_phone_number("0812-3456-7890") == "+081234567890"
    assert clean_phone_number("+62 812-3456-7890") == "+6281234567890"

    # Countries
    assert get_country_from_phone("+628123456789") == "Indonesia"
    assert get_country_from_phone("+14155552671") == "United States/Canada"
    assert get_country_from_phone("+380991234567") == "Ukraine"
    assert get_country_from_phone("+999123456") == "Unknown"
    assert get_country_from_phone("") == "Unknown"

    # Locales
    assert get_locale_from_phone("+628123456789") == ("id", "id-ID")
    assert get_locale_from_phone("+79123456789") == ("ru", "ru-RU")
    assert get_locale_from_phone("+60123456789") == ("ms", "ms-MY")
    assert get_locale_from_phone("+551199999999") == ("pt", "pt-BR")
    assert get_locale_from_phone(None) == ("en", "en")
    assert get_locale_from_phone("+999123456") == ("en", "en")


@pytest.mark.asyncio
async def test_start_spambot_conversation_normal():
    """Verify standard /start message is sent when not blocked."""
    client = AsyncMock()
    conv = AsyncMock()

    await start_spambot_conversation(client, conv, "+628123456789")
    conv.send_message.assert_awaited_once_with("/start")
    client.assert_not_called()


@pytest.mark.asyncio
async def test_start_spambot_conversation_unblocks_when_blocked():
    """Verify automatic UnblockRequest is dispatched when SpamBot is blocked."""
    client = AsyncMock()
    conv = AsyncMock()

    # First send_message raises YouBlockedUserError, second succeeds
    conv.send_message.side_effect = [YouBlockedUserError(request=MagicMock()), None]

    await start_spambot_conversation(client, conv, "+628123456789")

    # Should have called client(...) to unblock, and send_message twice
    assert client.call_count == 1
    assert conv.send_message.await_count == 2
