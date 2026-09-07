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


def test_telegram_client_pool_is_client_idle():
    """Verify that is_client_idle correctly evaluates idle status based on last_accessed."""
    import time
    pool = TelegramClientPool()
    account_id = "idle-acc-1"

    # Non-existent account is considered idle
    assert pool.is_client_idle(account_id, max_idle_seconds=300.0) is True

    # Recently accessed account is NOT idle
    now = time.time()
    pool._clients[account_id] = {"client": MagicMock(), "last_accessed": now}
    assert pool.is_client_idle(account_id, max_idle_seconds=300.0) is False

    # Account accessed 400s ago is idle (> 300s TTL)
    pool._clients[account_id]["last_accessed"] = now - 400.0
    assert pool.is_client_idle(account_id, max_idle_seconds=300.0) is True

    # touch_client updates last_accessed so it becomes non-idle
    pool.touch_client(account_id)
    assert pool.is_client_idle(account_id, max_idle_seconds=300.0) is False


@pytest.mark.asyncio
async def test_on_demand_dialog_lock_serialization():
    """Verify that _get_account_dialog_lock returns the same lock for identical account IDs."""
    from app.services.chat_service import _get_account_dialog_lock
    lock1 = await _get_account_dialog_lock("acc-concurrent-1")
    lock2 = await _get_account_dialog_lock("acc-concurrent-1")
    lock3 = await _get_account_dialog_lock("acc-different-2")

    assert lock1 is lock2
    assert lock1 is not lock3


@pytest.mark.asyncio
async def test_check_connections_protects_syncing_and_non_idle_accounts():
    """Verify that _check_connections does NOT disconnect clients that are non-idle or actively syncing."""
    from app.services.session_manager import session_manager, _sync_tasks
    from app.services.telegram_client import client_pool

    mock_client = MagicMock()
    mock_client.is_connected.return_value = True

    # Setup 2 accounts: acc-syncing (active sync task) and acc-recent (recently accessed)
    acc_syncing = "acc-syncing-123"
    acc_recent = "acc-recent-456"

    client_pool._clients[acc_syncing] = {"client": mock_client, "last_accessed": 100.0}
    client_pool._clients[acc_recent] = {"client": mock_client, "last_accessed": 100.0}

    # Simulate active sync task for acc_syncing
    future = asyncio.get_running_loop().create_future()
    _sync_tasks[acc_syncing] = future

    # acc_recent is NOT idle
    with patch.object(client_pool, "is_client_idle", side_effect=lambda acc, **kw: False if acc == acc_recent else True):
        with patch.object(client_pool, "remove", new_callable=AsyncMock) as mock_remove:
            with patch("app.database.async_session_factory") as mock_db_factory:
                # Mock DB query
                mock_db = AsyncMock()
                mock_db_factory.return_value.__aenter__.return_value = mock_db
                mock_acc = MagicMock()
                mock_acc.auto_reply_enabled = False
                mock_db.execute.return_value.scalar_one_or_none.return_value = mock_acc

                with patch.object(session_manager, "is_account_in_active_job", return_value=False):
                    with patch("app.api.ws.manager.has_channel", return_value=False):
                        await session_manager._check_connections()

            # Neither acc_syncing (sync in progress) nor acc_recent (not idle) should be removed!
            mock_remove.assert_not_called()

    # Cleanup
    future.cancel()
    _sync_tasks.pop(acc_syncing, None)
    client_pool._clients.pop(acc_syncing, None)
    client_pool._clients.pop(acc_recent, None)


