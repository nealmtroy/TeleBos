"""Unit tests for multi-core sharding and queue routing in TeleBos."""

import json
import uuid
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from app.core.sharding import (
    get_account_shard,
    is_account_in_current_shard,
    get_shard_command_queue,
    get_shard_jobs_queue,
    is_leader_shard,
    DEFAULT_CMD_QUEUE,
    DEFAULT_JOBS_QUEUE,
)
from app.services.telegram_command_bus import execute_telegram_command


def test_sharding_determinism():
    """Verify that the same account UUID always maps to the exact same shard."""
    acc_id = uuid.uuid4()
    shard_a = get_account_shard(acc_id, total_shards=4)
    shard_b = get_account_shard(acc_id, total_shards=4)
    shard_c = get_account_shard(str(acc_id), total_shards=4)

    assert shard_a == shard_b == shard_c
    assert 0 <= shard_a < 4


def test_sharding_distribution_uniformity():
    """Verify that CRC32 hashing distributes accounts uniformly across shards."""
    total_shards = 4
    counts = {i: 0 for i in range(total_shards)}
    sample_size = 2000

    for _ in range(sample_size):
        shard = get_account_shard(uuid.uuid4(), total_shards=total_shards)
        counts[shard] += 1

    expected_per_shard = sample_size / total_shards  # 500
    # Every shard should receive within 20% of expected distribution
    for shard_idx, count in counts.items():
        assert 400 <= count <= 600, f"Shard {shard_idx} received skewed count {count}"


def test_single_shard_fallback():
    """Verify that when total_shards <= 1, all accounts map to shard 0."""
    acc_id = uuid.uuid4()
    assert get_account_shard(acc_id, total_shards=1) == 0
    assert get_account_shard(acc_id, total_shards=0) == 0
    assert is_account_in_current_shard(acc_id, current_shard=0, total_shards=1) is True


def test_is_account_in_current_shard():
    """Verify shard membership matching."""
    acc_id = uuid.uuid4()
    actual_shard = get_account_shard(acc_id, total_shards=4)
    other_shard = (actual_shard + 1) % 4

    assert is_account_in_current_shard(acc_id, current_shard=actual_shard, total_shards=4) is True
    assert is_account_in_current_shard(acc_id, current_shard=other_shard, total_shards=4) is False


def test_queue_naming():
    """Verify queue naming conventions for single-worker vs multi-shard setups."""
    with patch("app.core.sharding.get_settings") as mock_settings:
        # Single shard mode
        mock_settings.return_value.TOTAL_SHARDS = 1
        mock_settings.return_value.SHARD_INDEX = 0
        assert get_shard_command_queue(0) == DEFAULT_CMD_QUEUE
        assert get_shard_jobs_queue(0) == DEFAULT_JOBS_QUEUE

        # Multi-shard mode
        mock_settings.return_value.TOTAL_SHARDS = 4
        mock_settings.return_value.SHARD_INDEX = 2
        assert get_shard_command_queue(2) == "telebos:cmd:telegram:shard_2"
        assert get_shard_jobs_queue(2) == "telebos:jobs:queue:shard_2"


def test_is_leader_shard():
    """Verify leader shard detection."""
    assert is_leader_shard(0) is True
    assert is_leader_shard(1) is False
    assert is_leader_shard(2) is False


@pytest.mark.asyncio
async def test_command_bus_routes_to_correct_shard():
    """Verify that execute_telegram_command routes to the calculated shard queue in multi-shard mode."""
    acc_id = uuid.uuid4()

    with patch("app.services.telegram_command_bus.get_settings") as mock_settings, \
         patch("app.core.sharding.get_settings") as mock_core_settings, \
         patch("app.services.telegram_command_bus.redis_client") as mock_redis:

        mock_settings.return_value.TOTAL_SHARDS = 4
        mock_settings.return_value.SHARD_INDEX = 0
        mock_core_settings.return_value.TOTAL_SHARDS = 4
        mock_core_settings.return_value.SHARD_INDEX = 0

        expected_shard = get_account_shard(acc_id, total_shards=4)
        expected_queue = f"telebos:cmd:telegram:shard_{expected_shard}"

        mock_redis.rpush = AsyncMock()
        mock_redis.blpop = AsyncMock(return_value=(
            "res_key",
            json.dumps({"status": "success", "data": {"sent": True}}),
        ))

        res = await execute_telegram_command(
            account_id=acc_id,
            action="send_message",
            params={"chat_id": 12345, "text": "Hello Shard"},
            timeout=5.0,
        )

        assert res == {"sent": True}
        assert mock_redis.rpush.called
        # Check that target queue was the calculated shard queue
        called_queue, called_payload_raw = mock_redis.rpush.call_args[0]
        assert called_queue == expected_queue

        payload = json.loads(called_payload_raw)
        assert payload["account_id"] == str(acc_id)
        assert payload["action"] == "send_message"


@pytest.mark.asyncio
async def test_session_manager_worker_retains_active_jobs_and_evicts_other_shards():
    """Verify that in worker mode, session_manager retains accounts in active jobs and disconnects other shards."""
    from app.services.session_manager import session_manager
    from app.services.telegram_client import client_pool

    acc_our_shard = str(uuid.uuid4())
    acc_other_shard = str(uuid.uuid4())

    with patch("app.core.sharding.get_settings") as mock_settings:
        mock_settings.return_value.TOTAL_SHARDS = 4
        mock_settings.return_value.SHARD_INDEX = 1

        # Force shard mapping in session_manager module namespace
        with patch("app.services.session_manager.is_account_in_current_shard", side_effect=lambda a: str(a) == acc_our_shard):
            client_pool.is_worker = True

            mock_c1 = MagicMock()
            mock_c1.is_connected.return_value = True
            mock_c2 = MagicMock()
            mock_c2.is_connected.return_value = True

            client_pool._clients[acc_our_shard] = {"client": mock_c1, "last_accessed": 100.0}
            client_pool._clients[acc_other_shard] = {"client": mock_c2, "last_accessed": 100.0}

            with patch.object(client_pool, "remove", new_callable=AsyncMock) as mock_remove:
                with patch("app.database.async_session_factory") as mock_db_factory:
                    mock_db = AsyncMock()
                    mock_db_factory.return_value.__aenter__.return_value = mock_db
                    mock_acc = MagicMock()
                    mock_acc.auto_reply_enabled = False
                    mock_res = MagicMock()
                    mock_res.scalar_one_or_none.return_value = mock_acc
                    mock_db.execute.return_value = mock_res

                    # Account in our shard is in an active job!
                    with patch.object(session_manager, "is_account_in_active_job", return_value=True):
                        with patch("app.api.ws.manager.has_channel", return_value=False):
                            await session_manager._check_connections()

                    # acc_other_shard should be removed because it's not in our shard
                    mock_remove.assert_called_once_with(acc_other_shard)
                    # acc_our_shard must NOT be removed because it's in an active worker job in this worker!
                    assert acc_our_shard in client_pool._clients

            client_pool._clients.clear()
            client_pool.is_worker = False
