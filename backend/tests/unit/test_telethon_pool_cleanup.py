"""Unit tests for Telethon pool cleanup and event handler detachment (P0 fixes)."""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
import pytest

from app.services.event_relay import TelegramEventRelay
from app.services.telegram_client import TelegramClientPool


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


def test_telegram_client_pool_active_count():
    """Verify that TelegramClientPool active_count tracks clients."""
    pool = TelegramClientPool()
    assert pool.active_count == 0
    pool._clients["acc-1"] = {"client": MagicMock()}
    assert pool.active_count == 1


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


@pytest.mark.asyncio
async def test_remove_cleans_up_locks():
    """Verify that removing an account evicts its lock from _locks (MEM-02)."""
    pool = TelegramClientPool()
    account_id = "test-lock-acc"
    mock_client = MagicMock()
    mock_client.disconnect = AsyncMock()

    pool._clients[account_id] = {"client": mock_client, "last_accessed": 100.0}
    pool._locks[account_id] = asyncio.Lock()

    await pool.remove(account_id, save_state=False)

    assert account_id not in pool._clients
    assert account_id not in pool._locks
