"""Unit tests for Bounded TelegramClientPool, Borrow/Release mechanics, and LRU eviction."""

import asyncio
import time
from unittest.mock import AsyncMock, MagicMock, patch
import pytest

from app.services.telegram_client import TelegramClientPool
from app.utils.telethon_helpers import borrow_client, release_client


@pytest.mark.asyncio
async def test_pool_borrow_and_release_tracking():
    """Verify that borrow() increments in-use tracking and release() decrements it."""
    pool = TelegramClientPool()
    acc_id = "acc-test-123"

    mock_client = MagicMock()
    mock_client.is_connected.return_value = True

    # Pre-populate pool with mock client
    pool._clients[acc_id] = {"client": mock_client, "last_accessed": time.time()}

    assert pool.borrowed_count == 0
    assert not pool.is_borrowed(acc_id)

    # Borrow client
    client = await pool.borrow(acc_id, "mock_session")
    assert client is mock_client
    assert pool.borrowed_count == 1
    assert pool.is_borrowed(acc_id)

    # Borrow again (nested or concurrent operation on same account)
    client2 = await pool.borrow(acc_id, "mock_session")
    assert client2 is mock_client
    assert pool.borrowed_count == 1  # 1 distinct account borrowed
    assert pool._borrow_counts[acc_id] == 2

    # Release once
    await pool.release(acc_id)
    assert pool.is_borrowed(acc_id)
    assert pool._borrow_counts[acc_id] == 1

    # Release second time
    await pool.release(acc_id)
    assert not pool.is_borrowed(acc_id)
    assert pool.borrowed_count == 0

    await pool.stop()


@pytest.mark.asyncio
async def test_pool_lru_eviction_when_capacity_reached():
    """Verify that when pool exceeds max_connected, the oldest unborrowed client is evicted."""
    pool = TelegramClientPool()
    pool.max_connected = 3

    # Add 3 clients with different access times
    mock_client_old = MagicMock()
    mock_client_old.is_connected.return_value = True

    mock_client_mid = MagicMock()
    mock_client_mid.is_connected.return_value = True

    mock_client_new = MagicMock()
    mock_client_new.is_connected.return_value = True

    pool._clients["acc-old"] = {"client": mock_client_old, "last_accessed": 100.0}
    pool._clients["acc-mid"] = {"client": mock_client_mid, "last_accessed": 200.0}
    pool._clients["acc-new"] = {"client": mock_client_new, "last_accessed": 300.0}

    # Evict LRU client
    with patch.object(pool, "remove", new_callable=AsyncMock) as mock_remove:
        evicted = await pool._evict_lru_client()
        assert evicted is True
        # acc-old should be the one evicted
        mock_remove.assert_called_once_with("acc-old", save_state=True)


@pytest.mark.asyncio
async def test_pool_lru_eviction_skips_borrowed_clients():
    """Verify that actively borrowed clients are NEVER evicted by LRU eviction."""
    pool = TelegramClientPool()
    pool.max_connected = 3

    mock_client_old = MagicMock()
    mock_client_old.is_connected.return_value = True

    mock_client_mid = MagicMock()
    mock_client_mid.is_connected.return_value = True

    mock_client_new = MagicMock()
    mock_client_new.is_connected.return_value = True

    pool._clients["acc-old"] = {"client": mock_client_old, "last_accessed": 100.0}
    pool._clients["acc-mid"] = {"client": mock_client_mid, "last_accessed": 200.0}
    pool._clients["acc-new"] = {"client": mock_client_new, "last_accessed": 300.0}

    # Borrow acc-old so it's actively in-flight
    pool._borrow_counts["acc-old"] = 1

    with patch.object(pool, "remove", new_callable=AsyncMock) as mock_remove:
        evicted = await pool._evict_lru_client()
        assert evicted is True
        # acc-old was skipped because it is borrowed; acc-mid is next oldest!
        mock_remove.assert_called_once_with("acc-mid", save_state=True)


@pytest.mark.asyncio
async def test_cleanup_stale_clients_skips_borrowed_clients():
    """Verify that idle cleanup ignores clients that are actively borrowed."""
    pool = TelegramClientPool()
    acc_id = "acc-borrowed-old"

    mock_client = MagicMock()
    mock_client.is_connected.return_value = True

    # Account was accessed 600 seconds ago (> 300s TTL), but is actively borrowed
    pool._clients[acc_id] = {"client": mock_client, "last_accessed": time.time() - 600}
    pool._borrow_counts[acc_id] = 1

    with patch.object(pool, "remove", new_callable=AsyncMock) as mock_remove:
        await pool._cleanup_stale_clients()
        mock_remove.assert_not_called()


@pytest.mark.asyncio
async def test_borrow_and_release_client_helpers():
    """Verify telethon_helpers borrow_client and release_client functions."""
    from app.services.telegram_client import client_pool

    mock_client = MagicMock()
    mock_client.is_connected.return_value = True

    account_dict = {
        "account_id": "acc-helper-1",
        "session_string": "encrypted-dummy-string",
    }

    with patch("app.utils.telethon_helpers.decrypt", return_value="decrypted-session"):
        with patch.object(client_pool, "borrow", new_callable=AsyncMock, return_value=mock_client) as mock_borrow:
            with patch.object(client_pool, "release", new_callable=AsyncMock) as mock_release:
                borrowed = await borrow_client(account_dict, receive_updates=True)
                assert borrowed is mock_client
                mock_borrow.assert_called_once_with("acc-helper-1", "decrypted-session", receive_updates=True)

                await release_client(account_dict)
                mock_release.assert_called_once_with("acc-helper-1")


def test_shared_entity_cache():
    """Verify bounded entity cache on TelegramClientPool."""
    pool = TelegramClientPool()
    pool._max_entity_cache = 3

    pool.cache_entity("target-1", "entity-1")
    pool.cache_entity("target-2", "entity-2")
    pool.cache_entity("target-3", "entity-3")

    assert pool.get_cached_entity("target-1") == "entity-1"
    assert pool.get_cached_entity("target-2") == "entity-2"
    assert pool.get_cached_entity("target-3") == "entity-3"

    # Adding a 4th item evicts the LRU item
    # Since target-1, target-2, target-3 were accessed, inserting target-4 will evict oldest
    pool.cache_entity("target-4", "entity-4")
    assert len(pool._entity_cache) == 3
    assert pool.get_cached_entity("target-4") == "entity-4"
