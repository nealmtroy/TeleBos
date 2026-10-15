"""Unit tests for TelegramCommandBus and CommandConsumer RPC."""

import asyncio
import json
import uuid
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from app.services.telegram_command_bus import (
    execute_telegram_command,
    TelegramCommandError,
    TelegramCommandTimeoutError,
    TELEGRAM_COMMANDS_QUEUE,
    TELEGRAM_RESPONSE_PREFIX,
)
from app.workers.command_consumer import process_single_command
from app.workers import command_consumer as cc


@pytest.mark.asyncio
async def test_telegram_command_bus_timeout():
    """Verify that command bus raises TelegramCommandTimeoutError when no worker responds."""
    fake_redis = AsyncMock()
    fake_redis.rpush = AsyncMock()
    fake_redis.blpop = AsyncMock(return_value=None)

    with patch("app.services.telegram_command_bus.redis_client", fake_redis):
        with pytest.raises(TelegramCommandTimeoutError) as exc_info:
            await execute_telegram_command(
                account_id=str(uuid.uuid4()),
                action="send_message",
                params={"chat_id": 123, "text": "Test"},
                timeout=0.1,
            )
        assert "timed out" in str(exc_info.value)
        assert exc_info.value.code == "TIMEOUT"


@pytest.mark.asyncio
async def test_telegram_command_bus_success():
    """Verify that command bus parses successful response from runner."""
    fake_redis = AsyncMock()
    fake_redis.rpush = AsyncMock()

    async def mock_blpop(key, timeout=1):
        # Return valid success JSON
        return ("queue", json.dumps({
            "status": "success",
            "data": {"id": 1001, "text": "Hello world"},
            "error": None,
        }))

    fake_redis.blpop = AsyncMock(side_effect=mock_blpop)

    with patch("app.services.telegram_command_bus.redis_client", fake_redis):
        result = await execute_telegram_command(
            account_id=str(uuid.uuid4()),
            action="send_message",
            params={"chat_id": 123, "text": "Hello world"},
            timeout=2.0,
        )
        assert result == {"id": 1001, "text": "Hello world"}


@pytest.mark.asyncio
async def test_telegram_command_bus_error():
    """Verify that command bus raises TelegramCommandError when runner returns error."""
    fake_redis = AsyncMock()
    fake_redis.rpush = AsyncMock()

    async def mock_blpop(key, timeout=1):
        return ("queue", json.dumps({
            "status": "error",
            "data": None,
            "error": {"code": "FLOOD_WAIT", "message": "Flood wait of 30 seconds"},
        }))

    fake_redis.blpop = AsyncMock(side_effect=mock_blpop)

    with patch("app.services.telegram_command_bus.redis_client", fake_redis):
        with pytest.raises(TelegramCommandError) as exc_info:
            await execute_telegram_command(
                account_id=str(uuid.uuid4()),
                action="send_message",
                params={"chat_id": 123, "text": "Hello"},
                timeout=2.0,
            )
        assert exc_info.value.code == "FLOOD_WAIT"
        assert "Flood wait" in str(exc_info.value)


@pytest.mark.asyncio
async def test_command_consumer_ping():
    """Verify that process_single_command handles ping action without account_id."""
    fake_redis = AsyncMock()
    fake_redis.rpush = AsyncMock()
    fake_redis.expire = AsyncMock()

    req_id = str(uuid.uuid4())
    raw_cmd = json.dumps({
        "request_id": req_id,
        "account_id": None,
        "action": "ping",
        "params": {},
    })

    with patch("app.workers.command_consumer.redis_client", fake_redis):
        await process_single_command(raw_cmd)

        fake_redis.rpush.assert_called_once()
        called_key, called_val = fake_redis.rpush.call_args[0]
        assert called_key == f"{TELEGRAM_RESPONSE_PREFIX}{req_id}"

        res = json.loads(called_val)
        assert res["status"] == "success"
        assert res["data"]["pong"] is True


# ── W2: owner-aware command routing (multi-runner) ───────────────────────────


class _FakeResult:
    def __init__(self, rows):
        self._rows = rows

    def scalars(self):
        return iter(self._rows)


class _FakeSessionFactory:
    def __init__(self, rows):
        self._rows = rows

    def __call__(self):
        rows = self._rows

        class _Ctx:
            async def __aenter__(self_inner):
                class _DB:
                    async def execute(self_db, stmt):
                        return _FakeResult(rows)

                return _DB()

            async def __aexit__(self_inner, *exc):
                return False

        return _Ctx()


@pytest.mark.asyncio
async def test_active_job_owner_shard_returns_job_primary_shard(monkeypatch):
    """A claimed account maps to the shard of its job's primary account."""
    account_id = str(uuid.uuid4())
    # job.account_ids has this account first, so the job runs on its shard
    monkeypatch.setattr(
        cc, "async_session_factory", _FakeSessionFactory([[account_id, str(uuid.uuid4())]])
    )
    monkeypatch.setattr(cc, "get_account_shard", lambda aid, *a, **k: 2)

    assert await cc._active_job_owner_shard(account_id) == 2


@pytest.mark.asyncio
async def test_active_job_owner_shard_none_when_not_claimed(monkeypatch):
    account_id = str(uuid.uuid4())
    monkeypatch.setattr(cc, "async_session_factory", _FakeSessionFactory([]))

    assert await cc._active_job_owner_shard(account_id) is None


@pytest.mark.asyncio
async def test_command_forwarded_to_job_owner_shard(monkeypatch):
    """A command for an account held by another shard is re-queued to that shard."""
    account_id = str(uuid.uuid4())
    request_id = str(uuid.uuid4())
    raw_cmd = json.dumps({
        "request_id": request_id,
        "account_id": account_id,
        "action": "send_message",
        "params": {"chat_id": 1, "text": "hi"},
    })

    class _Settings:
        TOTAL_SHARDS = 4
        SHARD_INDEX = 1

    monkeypatch.setattr(cc, "get_settings", lambda: _Settings())
    monkeypatch.setattr("app.core.sharding.get_settings", lambda: _Settings())
    monkeypatch.setattr(cc, "_active_job_owner_shard", AsyncMock(return_value=2))
    monkeypatch.setattr(
        cc.client_pool, "get_connected_clients", AsyncMock(return_value={})
    )

    fake_redis = AsyncMock()
    fake_redis.rpush = AsyncMock()
    monkeypatch.setattr(cc, "redis_client", fake_redis)

    await cc.process_single_command(raw_cmd)

    # Forwarded exactly once to the owner shard queue, with no local response.
    fake_redis.rpush.assert_called_once()
    key, val = fake_redis.rpush.call_args[0]
    assert key.endswith("shard_2")
    assert val == raw_cmd


@pytest.mark.asyncio
async def test_drain_command_tasks_waits_for_inflight(monkeypatch):
    """drain_command_tasks blocks until in-flight command tasks finish."""
    finished = asyncio.Event()

    async def _slow():
        await asyncio.sleep(0.05)
        finished.set()

    task = asyncio.create_task(_slow())
    cc._command_tasks.add(task)
    task.add_done_callback(cc._command_tasks.discard)

    await cc.drain_command_tasks(timeout=2.0)

    assert finished.is_set()
