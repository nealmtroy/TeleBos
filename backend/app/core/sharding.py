"""Deterministic sharding utilities for multi-core worker scaling in TeleBos.

Uses consistent hashing (CRC32) on account UUIDs to map each account
strictly to one runner shard [0..TOTAL_SHARDS-1].
"""

from __future__ import annotations

import logging
from uuid import UUID
import zlib

from app.config import get_settings

logger = logging.getLogger(__name__)

# Base Redis queue prefixes
CMD_QUEUE_PREFIX = "telebos:cmd:telegram:shard_"
JOBS_QUEUE_PREFIX = "telebos:jobs:queue:shard_"
DEFAULT_CMD_QUEUE = "telebos:cmd:telegram"
DEFAULT_JOBS_QUEUE = "telebos:jobs:queue"


def get_account_shard(account_id: str | UUID, total_shards: int | None = None) -> int:
    """Deterministically maps any account UUID to a shard index [0..total_shards-1].

    Args:
        account_id: The account UUID string or object.
        total_shards: Total number of active shards. Defaults to Settings.TOTAL_SHARDS.

    Returns:
        Integer shard index in range [0, total_shards - 1].
    """
    if total_shards is None:
        total_shards = get_settings().TOTAL_SHARDS

    if total_shards <= 1:
        return 0

    raw_str = str(account_id).strip()
    if not raw_str:
        return 0

    return zlib.crc32(raw_str.encode("utf-8")) % total_shards


def is_account_in_current_shard(
    account_id: str | UUID,
    current_shard: int | None = None,
    total_shards: int | None = None,
) -> bool:
    """Check if the given account belongs to the current runner's shard.

    Args:
        account_id: The account UUID string or object.
        current_shard: The current shard index. Defaults to Settings.SHARD_INDEX.
        total_shards: Total number of active shards. Defaults to Settings.TOTAL_SHARDS.

    Returns:
        True if this account should be managed by the current shard runner.
    """
    settings = get_settings()
    if total_shards is None:
        total_shards = settings.TOTAL_SHARDS

    if total_shards <= 1:
        return True

    if current_shard is None:
        current_shard = settings.SHARD_INDEX

    assigned_shard = get_account_shard(account_id, total_shards=total_shards)
    return assigned_shard == current_shard


def get_shard_command_queue(shard_index: int | None = None) -> str:
    """Return the Redis command queue key for a specific shard index.

    If total_shards <= 1 and shard_index is None, returns the legacy/default queue.
    """
    settings = get_settings()
    if shard_index is None:
        shard_index = settings.SHARD_INDEX

    if settings.TOTAL_SHARDS <= 1 and shard_index == 0:
        # Backward compatibility with single-worker setup
        return DEFAULT_CMD_QUEUE

    return f"{CMD_QUEUE_PREFIX}{shard_index}"


def get_shard_jobs_queue(shard_index: int | None = None) -> str:
    """Return the Redis background jobs queue key for a specific shard index."""
    settings = get_settings()
    if shard_index is None:
        shard_index = settings.SHARD_INDEX

    if settings.TOTAL_SHARDS <= 1 and shard_index == 0:
        return DEFAULT_JOBS_QUEUE

    return f"{JOBS_QUEUE_PREFIX}{shard_index}"


def is_leader_shard(shard_index: int | None = None) -> bool:
    """Check if the current runner is the leader/primary shard (index 0).

    Single-instance tasks (such as catalog syncs or media cleanup) only
    execute on the leader shard to prevent duplicate runs across cores.
    """
    if shard_index is None:
        shard_index = get_settings().SHARD_INDEX
    return shard_index == 0
