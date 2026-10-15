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
