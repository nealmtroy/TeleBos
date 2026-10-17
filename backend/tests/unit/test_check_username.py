import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from app.services import account_service


def _account(username=None):
    acc = MagicMock()
    acc.id = uuid4()
    acc.session_string = "encrypted"
    acc.first_name = "Ujang"
    acc.last_name = None
    acc.username = username
    acc.bio = None
    return acc


@pytest.mark.asyncio
async def test_check_username_current_username():
    db = MagicMock()
    acc = _account(username="myhandle")
    res = await account_service.check_username_availability(db, acc, "myhandle")
    assert res["available"] is True
    assert res["reason"] == "current"


@pytest.mark.asyncio
async def test_check_username_syntax_validations():
    db = MagicMock()
    acc = _account(username="myhandle")

    # Empty
    res = await account_service.check_username_availability(db, acc, "")
    assert res["available"] is False
    assert res["reason"] == "empty"

    # Too short (< 5)
    res = await account_service.check_username_availability(db, acc, "abcd")
    assert res["available"] is False
    assert res["reason"] == "too_short"

    # Too long (> 32)
    res = await account_service.check_username_availability(db, acc, "a" * 33)
    assert res["available"] is False
    assert res["reason"] == "too_long"

    # Starts with digit
    res = await account_service.check_username_availability(db, acc, "123handle")
    assert res["available"] is False
    assert res["reason"] == "starts_with_digit"

    # Invalid characters
    res = await account_service.check_username_availability(db, acc, "bad-handle!")
    assert res["available"] is False
    assert res["reason"] == "invalid_characters"

    # Ending with underscore or double underscore
    res = await account_service.check_username_availability(db, acc, "bad_handle_")
    assert res["available"] is False
    assert res["reason"] == "invalid_format"

    res = await account_service.check_username_availability(db, acc, "bad__handle")
    assert res["available"] is False
    assert res["reason"] == "invalid_format"


@pytest.mark.asyncio
async def test_check_username_available_direct_client():
    from telethon.tl.functions.account import CheckUsernameRequest

    db = MagicMock()
    acc = _account(username=None)

    client = AsyncMock()
    client.side_effect = lambda req: True if isinstance(req, CheckUsernameRequest) else False

    pool = MagicMock()
    pool.get = AsyncMock(return_value=client)

    with patch.object(account_service, "client_pool", pool), \
         patch("app.services.account_service.decrypt", lambda s: "sess"), \
         patch("app.config.get_settings") as mock_settings:
        mock_settings.return_value.ENABLE_TELEGRAM_COMMAND_BUS = False
        res = await account_service.check_username_availability(db, acc, "newvaliduser")

    assert res["available"] is True
    assert res["reason"] == "available"


@pytest.mark.asyncio
async def test_check_username_occupied_direct_client():
    from telethon.errors import UsernameOccupiedError

    db = MagicMock()
    acc = _account(username=None)

    client = AsyncMock()
    client.side_effect = UsernameOccupiedError(request=None)

    pool = MagicMock()
    pool.get = AsyncMock(return_value=client)

    with patch.object(account_service, "client_pool", pool), \
         patch("app.services.account_service.decrypt", lambda s: "sess"), \
         patch("app.config.get_settings") as mock_settings:
        mock_settings.return_value.ENABLE_TELEGRAM_COMMAND_BUS = False
        res = await account_service.check_username_availability(db, acc, "occupieduser")

    assert res["available"] is False
    assert res["reason"] == "occupied"


@pytest.mark.asyncio
async def test_check_username_via_command_bus():
    db = MagicMock()
    acc = _account(username=None)

    with patch("app.config.get_settings") as mock_settings, \
         patch("app.services.telegram_command_bus.execute_telegram_command", new_callable=AsyncMock) as mock_exec:
        mock_settings.return_value.ENABLE_TELEGRAM_COMMAND_BUS = True
        mock_exec.return_value = {"available": True, "reason": "available", "message": "Username tersedia."}

        res = await account_service.check_username_availability(db, acc, "testuser123")

    mock_exec.assert_awaited_once_with(
        account_id=str(acc.id),
        action="check_username",
        params={"username": "testuser123"},
    )
    assert res["available"] is True


@pytest.mark.asyncio
async def test_update_profile_pushes_username_to_command_bus():
    db = MagicMock()
    db.flush = AsyncMock()
    acc = _account(username="oldhandle")

    with patch("app.config.get_settings") as mock_settings, \
         patch("app.services.telegram_command_bus.execute_telegram_command", new_callable=AsyncMock) as mock_exec:
        mock_settings.return_value.ENABLE_TELEGRAM_COMMAND_BUS = True
        mock_exec.return_value = {"success": True, "username": "newhandle"}

        await account_service.update_profile(db, acc, "Ujang", None, "newhandle", None)

    mock_exec.assert_awaited_once_with(
        account_id=str(acc.id),
        action="update_profile",
        params={
            "first_name": "Ujang",
            "last_name": "",
            "about": "",
            "username": "newhandle",
        },
    )
    assert acc.username == "newhandle"
