"""Unit tests for Telegram OTP fetching from user 777000."""

import uuid
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from telethon.errors import FloodWaitError
from app.models.telegram_account import TelegramAccount
from app.services.account_service import extract_telegram_otp, get_account_otp


def test_extract_telegram_otp_english():
    text = "Login code: 48291. Do not give this code to anyone, even if they say they are from Telegram!"
    assert extract_telegram_otp(text) == "48291"


def test_extract_telegram_otp_indonesian():
    text = "Kode masuk: 73910. Jangan berikan kode ini kepada siapa pun..."
    assert extract_telegram_otp(text) == "73910"


def test_extract_telegram_otp_multiline_and_formatting():
    assert extract_telegram_otp("Web login code\n\n58201") == "58201"
    assert extract_telegram_otp("Login code: 582-01") == "58201"
    assert extract_telegram_otp("Login code: 582 01") == "58201"
    assert extract_telegram_otp("54321 is your login code") == "54321"
    assert extract_telegram_otp("54321 adalah kode masuk Anda") == "54321"
    assert extract_telegram_otp("Код: 91823") == "91823"
    assert extract_telegram_otp("Código: 81726") == "81726"


def test_extract_telegram_otp_no_code():
    assert extract_telegram_otp(None) is None
    assert extract_telegram_otp("") is None
    assert extract_telegram_otp("We noticed a login from a new device on 2026-10-26 with ID 777000") is None
    assert extract_telegram_otp("Your session was terminated from Desktop") is None


@pytest.mark.asyncio
async def test_get_account_otp_inactive_account():
    db = AsyncMock()
    account = TelegramAccount(
        id=uuid.uuid4(),
        phone="+628123456789",
        is_active=False,
        for_sale=False,
    )
    with pytest.raises(ValueError, match="tidak aktif"):
        await get_account_otp(db, account)


@pytest.mark.asyncio
async def test_get_account_otp_for_sale_account():
    db = AsyncMock()
    account = TelegramAccount(
        id=uuid.uuid4(),
        phone="+628123456789",
        is_active=True,
        for_sale=True,
    )
    with pytest.raises(ValueError, match="marketplace"):
        await get_account_otp(db, account)


@pytest.mark.asyncio
async def test_get_account_otp_success_recent():
    db = AsyncMock()
    account = TelegramAccount(
        id=uuid.uuid4(),
        phone="+628123456789",
        telegram_id=12345678,
        is_active=True,
        for_sale=False,
        session_string="mock_session",
    )

    mock_client = AsyncMock()
    now = datetime.now(timezone.utc)
    
    msg1 = MagicMock()
    msg1.id = 101
    msg1.date = now - timedelta(minutes=2)
    msg1.text = "Login code: 49201. Do not give this code to anyone."
    msg1.message = msg1.text

    msg2 = MagicMock()
    msg2.id = 100
    msg2.date = now - timedelta(hours=5)
    msg2.text = "Dear user, you logged in from Windows..."
    msg2.message = msg2.text

    mock_client.get_input_entity = AsyncMock(return_value=MagicMock())
    mock_client.get_messages = AsyncMock(return_value=[msg1, msg2])

    with patch("app.utils.telethon_helpers.get_active_client", return_value=mock_client):
        result = await get_account_otp(db, account)

    assert result["account_id"] == account.id
    assert result["phone"] == "+628123456789"
    assert result["otp_code"] == "49201"
    assert result["is_recent"] is True
    assert len(result["messages"]) == 2
    assert result["messages"][0]["otp_code"] == "49201"
    assert result["messages"][1]["otp_code"] is None


@pytest.mark.asyncio
async def test_get_account_otp_clock_drift_future():
    db = AsyncMock()
    account = TelegramAccount(
        id=uuid.uuid4(),
        phone="+628123456789",
        telegram_id=12345678,
        is_active=True,
        for_sale=False,
        session_string="mock_session",
    )

    mock_client = AsyncMock()
    now = datetime.now(timezone.utc)
    
    # Message timestamp is 5s ahead of local clock (NTP skew)
    msg = MagicMock()
    msg.id = 101
    msg.date = now + timedelta(seconds=5)
    msg.text = "Login code: 38192."
    msg.message = msg.text

    mock_client.get_input_entity = AsyncMock(return_value=MagicMock())
    mock_client.get_messages = AsyncMock(return_value=[msg])

    with patch("app.utils.telethon_helpers.get_active_client", return_value=mock_client):
        result = await get_account_otp(db, account)

    assert result["otp_code"] == "38192"
    assert result["is_recent"] is True


@pytest.mark.asyncio
async def test_get_account_otp_flood_wait():
    db = AsyncMock()
    account = TelegramAccount(
        id=uuid.uuid4(),
        phone="+628123456789",
        telegram_id=12345678,
        is_active=True,
        for_sale=False,
        session_string="mock_session",
    )

    mock_client = AsyncMock()
    flood_exc = FloodWaitError(None)
    flood_exc.seconds = 45
    mock_client.get_input_entity = AsyncMock(side_effect=flood_exc)

    with patch("app.utils.telethon_helpers.get_active_client", return_value=mock_client):
        with pytest.raises(RuntimeError, match="45 detik"):
            await get_account_otp(db, account)
