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


async def enqueue_job(job_type: str, job_id: str | uuid.UUID) -> bool:
    """Push a job to the Redis queue for the async worker daemon to process."""
    try:
        payload = json.dumps({
            "action": "start",
            "job_type": job_type,
            "job_id": str(job_id),
        })
        await redis_client.rpush(JOBS_QUEUE_KEY, payload)
        logger.info("Enqueued %s job %s to %s", job_type, job_id, JOBS_QUEUE_KEY)
        return True
    except Exception as exc:
        logger.error("Failed to enqueue %s job %s: %s", job_type, job_id, exc)
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
