"""Unit tests for Telethon pool cleanup and event handler detachment (P0 fixes)."""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
import pytest

from app.services.event_relay import TelegramEventRelay
from app.services.telegram_client import TelegramClientPool
from app.utils.telethon_pool import TelethonPool


@pytest.mark.asyncio
async def test_event_relay_detach_client_removes_all_handlers():
    """Verify that detach_client removes registered handlers from the client."""
    relay = TelegramEventRelay()
    mock_client = MagicMock()
    account_id = "test-account-123"

    handler_1 = MagicMock()
    handler_2 = MagicMock()
    relay._handlers[account_id] = [handler_1, handler_2]
    relay._tg_id_map[account_id] = 99999

    relay.detach_client(account_id, mock_client)

    # Handlers should be removed from client
    mock_client.remove_event_handler.assert_any_call(handler_1)
    mock_client.remove_event_handler.assert_any_call(handler_2)
    assert mock_client.remove_event_handler.call_count == 2

    # Internal state should be cleared
    assert account_id not in relay._handlers
    assert account_id not in relay._tg_id_map


@pytest.mark.asyncio
async def test_event_relay_detach_accepts_direct_client():
    """Verify that detach accepts a direct client parameter and detaches without pool lookup."""
    relay = TelegramEventRelay()
    mock_client = MagicMock()
    account_id = "test-account-direct"

    handler_1 = MagicMock()
    relay._handlers[account_id] = [handler_1]

    await relay.detach(account_id, client=mock_client)

    mock_client.remove_event_handler.assert_called_once_with(handler_1)
    assert account_id not in relay._handlers


@pytest.mark.asyncio
async def test_cleanup_stale_clients_calls_detach_client():
    """Verify that _cleanup_stale_clients calls event_relay.detach_client with the client instance."""
    pool = TelegramClientPool()
    account_id = "stale-account-123"
    mock_client = MagicMock()
    mock_client.is_connected.return_value = True
    mock_client.disconnect = AsyncMock()

    # Place account with expired TTL
    pool._clients[account_id] = {
        "client": mock_client,
        "last_accessed": 0.0,  # long in the past
    }

    with patch("app.services.event_relay.event_relay.detach_client") as mock_detach:
        await pool._cleanup_stale_clients()

        # detach_client must have been called with account_id and mock_client
        mock_detach.assert_called_once_with(account_id, mock_client)

    # Client must have been disconnected
    mock_client.disconnect.assert_awaited_once()
    assert account_id not in pool._clients


@pytest.mark.asyncio
async def test_telethon_pool_delegates_to_client_pool():
    """Verify that legacy telethon_pool delegates get_or_create to client_pool."""
    pool = TelethonPool()
    mock_client = MagicMock()

    with patch("app.services.telegram_client.client_pool.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = mock_client
        with patch("app.utils.telethon_pool.decrypt", return_value="decrypted-session"):
            res = await pool.get_or_create("acc-123", "enc-session")

            mock_get.assert_awaited_once_with("acc-123", "decrypted-session")
            assert res is mock_client


def test_connection_manager_has_channel():
    """Verify that ConnectionManager.has_channel correctly reports subscriber presence."""
    from app.api.ws import ConnectionManager

    cm = ConnectionManager()
    channel = "chats:test-channel"

    assert cm.has_channel(channel) is False

    mock_ws = MagicMock()
    cm._connections[channel] = {mock_ws}
    assert cm.has_channel(channel) is True

    cm.disconnect(channel, mock_ws)
    assert cm.has_channel(channel) is False


@pytest.mark.asyncio
async def test_reg_date_extract_datapoints_from_dialogs():
    """Verify that reg_date_service extracts datapoints from in-memory dialogs without network calls."""
    import datetime
    from app.services.telegram_reg_date_service import reg_date_service
    from telethon.tl.types import MessageService, PeerUser, MessageActionContactSignUp

    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = None
    mock_db = MagicMock()
    mock_db.execute = AsyncMock(return_value=mock_res)
    mock_db.commit = AsyncMock()

    mock_msg = MessageService(
        id=1,
        peer_id=PeerUser(user_id=123456789),
        date=datetime.datetime(2023, 5, 10, 12, 0, 0, tzinfo=datetime.timezone.utc),
        action=MessageActionContactSignUp(),
    )

    mock_dialog = MagicMock()
    mock_dialog.is_user = True
    mock_dialog.id = 123456789
    mock_dialog.message = mock_msg

    count = await reg_date_service.extract_datapoints_from_dialogs(mock_db, [mock_dialog])

    assert count == 1
    mock_db.add.assert_called_once()
    mock_db.commit.assert_awaited_once()
