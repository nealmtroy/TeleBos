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
async def test_session_manager_worker_keeps_own_job_accounts_and_evicts_foreign_claims():
    """Worker health pass keeps the accounts THIS runner's job holds, releases the rest.

    A job is executed on the shard of its first account and holds every one of
    its accounts there — even accounts whose own shard differs. Another runner
    must release those, and any account not in this shard and not in this
    runner's job is released too.
    """
    from app.services.session_manager import session_manager
    from app.services.telegram_client import client_pool

    acc_job_here = str(uuid.uuid4())       # this runner's job holds it
    acc_job_elsewhere = str(uuid.uuid4())  # a job on another shard holds it
    acc_local = str(uuid.uuid4())          # no job, in our shard
    acc_foreign = str(uuid.uuid4())        # no job, not in our shard

    def _conn():
        c = MagicMock()
        c.is_connected.return_value = True
        return c

    with patch("app.core.sharding.get_settings") as mock_settings:
        mock_settings.return_value.TOTAL_SHARDS = 4
        mock_settings.return_value.SHARD_INDEX = 1

        with patch(
            "app.services.session_manager.is_account_in_current_shard",
            side_effect=lambda a: str(a) in (acc_local,),
        ):
            client_pool.is_worker = True
            for aid in (acc_job_here, acc_job_elsewhere, acc_local, acc_foreign):
                client_pool._clients[aid] = {"client": _conn(), "last_accessed": 100.0}

            with patch.object(client_pool, "remove", new_callable=AsyncMock) as mock_remove:
                with patch("app.database.async_session_factory") as mock_db_factory:
                    mock_db = AsyncMock()
                    mock_db_factory.return_value.__aenter__.return_value = mock_db
                    mock_acc = MagicMock()
                    mock_acc.auto_reply_enabled = True  # keeps a no-job local account
                    mock_res = MagicMock()
                    mock_res.scalar_one_or_none.return_value = mock_acc
                    mock_db.execute.return_value = mock_res

                    with patch.object(
                        session_manager,
                        "is_account_in_active_job",
                        side_effect=lambda db, aid: str(aid) in (acc_job_here, acc_job_elsewhere),
                    ):
                        with patch.object(
                            session_manager,
                            "_active_job_in_current_shard",
                            side_effect=lambda db, aid: str(aid) == acc_job_here,
                        ):
                            with patch("app.api.ws.manager.has_channel", return_value=False):
                                await session_manager._check_connections()

                removed = {c.args[0] for c in mock_remove.call_args_list}
                assert acc_job_here not in removed, "this runner's own job account must be kept"
                assert acc_local not in removed, "local no-job account must be kept"
                assert acc_job_elsewhere in removed, "account held by another shard's job must be released"
                assert acc_foreign in removed, "account not in this shard must be released"

            client_pool._clients.clear()
            client_pool.is_worker = False


@pytest.mark.asyncio
async def test_session_manager_auto_reply_watchdog_reconnects_missing_accounts():
    """Verify that worker runner watchdog re-ensures connection and handlers for auto-reply accounts."""
    from app.services.session_manager import session_manager
    from app.services.telegram_client import client_pool

    auto_acc_id = str(uuid.uuid4())

    with patch("app.core.sharding.get_settings") as mock_settings:
        mock_settings.return_value.TOTAL_SHARDS = 4
        mock_settings.return_value.SHARD_INDEX = 0

        with patch("app.services.session_manager.is_account_in_current_shard", side_effect=lambda a: str(a) == auto_acc_id):
            client_pool.is_worker = True
            client_pool._clients.clear()

            with patch("app.database.async_session_factory") as mock_db_factory:
                mock_db = AsyncMock()
                mock_db_factory.return_value.__aenter__.return_value = mock_db
                mock_res = MagicMock()
                mock_res.scalars.return_value.all.return_value = [auto_acc_id]
                mock_db.execute.return_value = mock_res

                with patch.object(session_manager, "ensure_connected_on_demand", new_callable=AsyncMock) as mock_ensure:
                    with patch("app.api.ws.manager.has_channel", return_value=False):
                        session_manager._running = True
                        try:
                            await session_manager._check_connections()
                        finally:
                            session_manager._running = False

                    mock_ensure.assert_called_once_with(auto_acc_id)

            client_pool.is_worker = False


# ── _active_job_in_current_shard (Design B: cross-shard job ownership) ───────


class _ScalarResult:
    def __init__(self, rows):
        self._rows = rows

    def scalars(self):
        return iter(self._rows)


class _JobDB:
    """Returns account_ids rows per model table name found in the statement."""

    def __init__(self, rows_by_table):
        self.rows_by_table = rows_by_table

    async def execute(self, stmt):
        text = str(stmt)
        for table, rows in self.rows_by_table.items():
            if table in text:
                return _ScalarResult(rows)
        return _ScalarResult([])


@pytest.mark.asyncio
async def test_active_job_in_current_shard_true_when_primary_is_local():
    from app.services.session_manager import session_manager

    primary = str(uuid.uuid4())
    other = str(uuid.uuid4())
    db = _JobDB({"broadcast_jobs": [[primary, other]]})

    with patch(
        "app.services.session_manager.is_account_in_current_shard",
        side_effect=lambda a: str(a) == primary,
    ):
        # `other` is claimed by a job whose first account runs on this shard.
        assert await session_manager._active_job_in_current_shard(db, other) is True


@pytest.mark.asyncio
async def test_active_job_in_current_shard_false_when_primary_is_remote():
    from app.services.session_manager import session_manager

    primary = str(uuid.uuid4())  # on another shard
    account = str(uuid.uuid4())
    db = _JobDB({"invite_jobs": [[primary, account]]})

    with patch(
        "app.services.session_manager.is_account_in_current_shard",
        side_effect=lambda a: False,
    ):
        assert await session_manager._active_job_in_current_shard(db, account) is False


@pytest.mark.asyncio
async def test_active_job_in_current_shard_defaults_true_without_a_job():
    from app.services.session_manager import session_manager

    account = str(uuid.uuid4())
    db = _JobDB({})

    with patch(
        "app.services.session_manager.is_account_in_current_shard",
        side_effect=lambda a: False,
    ):
        # No job claims the account → callers must not treat it as a foreign claim.
        assert await session_manager._active_job_in_current_shard(db, account) is True


