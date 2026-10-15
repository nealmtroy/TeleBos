"""Telegram Command Bus — Redis RPC client for dispatching Telegram operations to worker runner.

Allows the stateless FastAPI web server to execute Telegram MTProto operations
without opening any direct MTProto connections or loading Telethon clients into memory.
"""

import asyncio
import json
import logging
import time
import uuid
from typing import Any

from app.config import get_settings
from app.core.sharding import DEFAULT_CMD_QUEUE, get_account_shard, get_shard_command_queue
from app.utils.redis import redis_client

logger = logging.getLogger(__name__)

TELEGRAM_COMMANDS_QUEUE = DEFAULT_CMD_QUEUE
TELEGRAM_RESPONSE_PREFIX = "telebos:res:"
DEFAULT_TIMEOUT_SECONDS = 15.0


class TelegramCommandError(Exception):
    """Raised when the Telegram runner returns an error response."""

    def __init__(self, message: str, code: str | None = None, details: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.code = code or "UNKNOWN_ERROR"
        self.details = details or {}


class TelegramCommandTimeoutError(TelegramCommandError):
    """Raised when no worker runner response was received before the timeout expired."""

    def __init__(self, message: str, action: str, timeout: float) -> None:
        super().__init__(message, code="TIMEOUT")
        self.action = action
        self.timeout = timeout


async def execute_telegram_command(
    account_id: str | uuid.UUID | None,
    action: str,
    params: dict[str, Any] | None = None,
    timeout: float = DEFAULT_TIMEOUT_SECONDS,
) -> Any:
    """Send a command to the Telegram runner cluster and await its result via Redis RPC.

    Args:
        account_id: Target Telegram account ID (optional for unauthenticated actions).
        action: Name of the action (e.g. 'send_message', 'edit_message', 'get_dialogs').
        params: Action-specific parameter payload.
        timeout: Maximum seconds to wait for worker response.

    Returns:
        The 'data' field returned by the worker runner.

    Raises:
        TelegramCommandTimeoutError: If the runner daemon does not respond in time.
        TelegramCommandError: If the runner daemon encounters an RPC error or MTProto failure.
    """
    request_id = str(uuid.uuid4())
    res_key = f"{TELEGRAM_RESPONSE_PREFIX}{request_id}"

    payload = {
        "request_id": request_id,
        "account_id": str(account_id) if account_id is not None else None,
        "action": action,
        "params": params or {},
        "timeout": timeout,
        "created_at": time.time(),
    }

    settings = get_settings()
    if account_id is not None and settings.TOTAL_SHARDS > 1:
        target_shard = get_account_shard(account_id, settings.TOTAL_SHARDS)
        target_queue = get_shard_command_queue(target_shard)
    else:
        target_queue = TELEGRAM_COMMANDS_QUEUE

    try:
        raw_payload = json.dumps(payload)
        await redis_client.rpush(target_queue, raw_payload)
    except Exception as push_exc:
        logger.error("Failed to enqueue command '%s' to %s: %s", action, target_queue, push_exc)
        raise TelegramCommandError(
            f"Failed to dispatch Telegram command '{action}' to runner: {push_exc}",
            code="DISPATCH_FAILED",
        ) from push_exc

    # Await response from worker runner
    wait_timeout = max(1, int(timeout) + 1)
    try:
        result_tuple = await redis_client.blpop(res_key, timeout=wait_timeout)
    except Exception as pop_exc:
        logger.error("Error awaiting response on %s for action '%s': %s", res_key, action, pop_exc)
        raise TelegramCommandError(
            f"Error awaiting runner response for '{action}': {pop_exc}",
            code="NETWORK_ERROR",
        ) from pop_exc

    if not result_tuple:
        logger.warning(
            "Telegram command '%s' (req=%s, account=%s) timed out after %ds",
            action,
            request_id,
            account_id,
            wait_timeout,
        )
        raise TelegramCommandTimeoutError(
            f"Telegram operation '{action}' timed out after {wait_timeout}s waiting for runner daemon.",
            action=action,
            timeout=timeout,
        )

    _, raw_res = result_tuple
    try:
        res = json.loads(raw_res)
    except Exception as parse_exc:
        logger.error("Failed to parse runner JSON response for req %s: %s", request_id, parse_exc)
        raise TelegramCommandError("Corrupted response from Telegram runner.", code="INVALID_RESPONSE") from parse_exc

    status = res.get("status")
    if status == "success":
        return res.get("data")

    err = res.get("error") or {}
    err_msg = err.get("message") or f"Telegram operation '{action}' failed on runner."
    err_code = err.get("code") or "OPERATION_FAILED"
    logger.info("Telegram command '%s' failed on runner: %s (code=%s)", action, err_msg, err_code)
    raise TelegramCommandError(err_msg, code=err_code, details=err.get("details"))
