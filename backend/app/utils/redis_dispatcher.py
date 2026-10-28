"""Redis inter-process communication dispatcher for TeleBos.

Handles:
- Enqueuing background jobs to Redis queue (BLPOP consumer)
- Publishing job lifecycle control signals (pause, resume, stop) via Redis Pub/Sub
- Publishing real-time WebSocket events from worker to webserver via Redis Pub/Sub
"""

import json
import logging
from typing import Any
import uuid

from app.utils.redis import redis_client

logger = logging.getLogger(__name__)

JOBS_QUEUE_KEY = "telebos:jobs:queue"
JOBS_CONTROL_CHANNEL = "telebos:jobs:control"
WS_EVENTS_CHANNEL = "telebos:ws:events"
JOBS_COMPLETED_CHANNEL = "telebos:jobs:completed"


async def enqueue_job(
    job_type: str,
    job_id: str | uuid.UUID,
    account_id: str | uuid.UUID | None = None,
    shard_index: int | None = None,
) -> bool:
    """Push a job to the Redis queue for the async worker daemon to process."""
    from app.config import get_settings
    from app.core.sharding import DEFAULT_JOBS_QUEUE, get_account_shard, get_shard_jobs_queue

    settings = get_settings()
    if shard_index is None and account_id is not None and settings.TOTAL_SHARDS > 1:
        shard_index = get_account_shard(account_id, settings.TOTAL_SHARDS)

    target_queue = get_shard_jobs_queue(shard_index) if shard_index is not None else DEFAULT_JOBS_QUEUE

    try:
        payload = json.dumps({
            "action": "start",
            "job_type": job_type,
            "job_id": str(job_id),
            "account_id": str(account_id) if account_id is not None else None,
            "shard_index": shard_index,
        })
        await redis_client.rpush(target_queue, payload)
        logger.info("Enqueued %s job %s to %s", job_type, job_id, target_queue)
        return True
    except Exception as exc:
        logger.error("Failed to enqueue %s job %s to %s: %s", job_type, job_id, target_queue, exc)
        return False


async def publish_job_control(job_type: str, job_id: str | uuid.UUID, action: str) -> bool:
    """Publish a control signal (pause, resume, stop) to the worker daemon via Pub/Sub."""
    try:
        payload = json.dumps({
            "action": action,
            "job_type": job_type,
            "job_id": str(job_id),
        })
        subscribers = await redis_client.publish(JOBS_CONTROL_CHANNEL, payload)
        logger.info(
            "Published control signal '%s' for %s job %s (delivered to %d subscribers)",
            action,
            job_type,
            job_id,
            subscribers,
        )
        return True
    except Exception as exc:
        logger.error(
            "Failed to publish control signal '%s' for %s job %s: %s",
            action,
            job_type,
            job_id,
            exc,
        )
        return False


async def publish_ws_event(channel: str, event_data: dict[str, Any]) -> bool:
    """Publish a WebSocket event to Redis Pub/Sub so webservers can broadcast it to clients."""
    try:
        payload = json.dumps({
            "channel": channel,
            "event_data": event_data,
        })
        await redis_client.publish(WS_EVENTS_CHANNEL, payload)
        return True
    except Exception as exc:
        logger.warning("Failed to publish WS event for channel %s: %s", channel, exc)
        return False


async def publish_job_completed(
    job_type: str, job_id: str | uuid.UUID, account_ids: list[str]
) -> bool:
    """Publish a completion signal to notify webservers that accounts are freed from worker job."""
    import asyncio

    payload = json.dumps({
        "action": "completed",
        "job_type": job_type,
        "job_id": str(job_id),
        "account_ids": [str(a) for a in account_ids],
    })
    for attempt in range(1, 4):
        try:
            await redis_client.publish(JOBS_COMPLETED_CHANNEL, payload)
            logger.info("Published job completed signal for %s job %s", job_type, job_id)
            return True
        except Exception as exc:
            if attempt < 3:
                await asyncio.sleep(0.2 * attempt)
                continue
            logger.warning("Failed to publish job completed signal for %s job %s: %s", job_type, job_id, exc)
            return False
    return False

