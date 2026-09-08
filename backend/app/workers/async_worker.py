"""Dedicated Async Worker Daemon for TeleBos.

Runs background tasks (Broadcast Jobs and Invite Jobs) independently from the FastAPI webserver.
Listens to:
1. Redis Queue (`telebos:jobs:queue`) for new job dispatches.
2. Redis Pub/Sub (`telebos:jobs:control`) for real-time control signals (pause, resume, stop).
"""

import asyncio
import json
import logging
import signal
import sys

from app.database import async_session_factory, engine
from app.utils.redis import redis_client
from app.utils.redis_dispatcher import JOBS_QUEUE_KEY, JOBS_CONTROL_CHANNEL
from app.services import broadcast_service, invite_service
from app.utils.async_helpers import wake_job

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("telebos.async_worker")

shutdown_event = asyncio.Event()


def _handle_exit_signal(sig, frame):
    logger.info("Received exit signal (%s), initiating graceful shutdown...", sig)
    shutdown_event.set()


async def queue_consumer_loop() -> None:
    """Continuously consume new job dispatches from Redis queue."""
    logger.info("Worker queue consumer loop started (listening on %s)", JOBS_QUEUE_KEY)
    while not shutdown_event.is_set():
        try:
            item = await redis_client.blpop(JOBS_QUEUE_KEY, timeout=2)
            if not item:
                continue

            _, data_raw = item
            try:
                payload = json.loads(data_raw)
                job_type = payload.get("job_type")
                job_id = payload.get("job_id")
                action = payload.get("action", "start")

                if action == "start" and job_id:
                    if job_type == "broadcast":
                        logger.info("Spawning broadcast job %s in async worker", job_id)
                        broadcast_service.start_broadcast_task(job_id)
                    elif job_type == "invite":
                        logger.info("Spawning invite job %s in async worker", job_id)
                        invite_service.start_invite_task(job_id)
                    else:
                        logger.warning("Unknown job type received in queue: %s", job_type)
            except Exception as parse_exc:
                logger.error("Failed to parse queue item '%s': %s", data_raw, parse_exc)

        except asyncio.CancelledError:
            break
        except Exception as exc:
            if not shutdown_event.is_set():
                logger.error("Error in queue consumer loop: %s. Retrying in 2s...", exc)
                await asyncio.sleep(2.0)


async def control_subscriber_loop() -> None:
    """Subscribe to Redis Pub/Sub control channel to handle pause, resume, and stop signals."""
    logger.info("Worker control subscriber loop started (listening on %s)", JOBS_CONTROL_CHANNEL)
    while not shutdown_event.is_set():
        pubsub = None
        try:
            pubsub = redis_client.pubsub()
            await pubsub.subscribe(JOBS_CONTROL_CHANNEL)

            while not shutdown_event.is_set():
                message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=2.0)
                if not message or message.get("type") != "message":
                    await asyncio.sleep(0.1)
                    continue

                data_raw = message.get("data")
                if not data_raw:
                    continue

                try:
                    payload = json.loads(data_raw)
                    action = payload.get("action")
                    job_type = payload.get("job_type")
                    job_id = str(payload.get("job_id"))

                    logger.info("Worker received control signal: %s for %s job %s", action, job_type, job_id)

                    if action == "pause":
                        # Wakes up sleeping loop so it detects 'paused' status immediately
                        wake_job(job_id)
                    elif action == "resume":
                        wake_job(job_id)
                        if job_type == "broadcast":
                            broadcast_service.start_broadcast_task(job_id)
                        elif job_type == "invite":
                            invite_service.start_invite_task(job_id)
                    elif action == "stop":
                        wake_job(job_id)
                        if job_type == "broadcast":
                            task = broadcast_service._running_tasks.get(job_id)
                            if task and not task.done():
                                task.cancel()
                        elif job_type == "invite":
                            task = invite_service._running_invite_tasks.get(job_id)
                            if task and not task.done():
                                task.cancel()
                except Exception as proc_exc:
                    logger.error("Failed to process control signal '%s': %s", data_raw, proc_exc)

        except asyncio.CancelledError:
            break
        except Exception as exc:
            if not shutdown_event.is_set():
                logger.warning("Control subscriber disconnected: %s. Reconnecting in 3s...", exc)
                await asyncio.sleep(3.0)
        finally:
            if pubsub:
                try:
                    await pubsub.unsubscribe(JOBS_CONTROL_CHANNEL)
                    await pubsub.close()
                except Exception:
                    pass


async def main() -> None:
    logger.info("Initializing TeleBos Dedicated Async Worker Daemon...")

    # 1. Verify encryption key
    from app.utils.encryption import _get_cipher
    try:
        _get_cipher()
    except Exception as exc:
        logger.critical("Encryption key verification failed: %s", exc)
        sys.exit(1)

    # 2. Auto-resume running jobs on worker startup
    async with async_session_factory() as db:
        resumed_b = await broadcast_service.resume_running_broadcasts_on_startup(db)
        resumed_i = await invite_service.resume_running_invites_on_startup(db)
        logger.info("Startup complete: Auto-resumed %d broadcast jobs and %d invite jobs", resumed_b, resumed_i)

    # 3. Start background loops
    consumer_task = asyncio.create_task(queue_consumer_loop())
    control_task = asyncio.create_task(control_subscriber_loop())

    # Wait until shutdown signal
    await shutdown_event.wait()

    # 4. Graceful shutdown
    logger.info("Shutting down worker tasks...")
    consumer_task.cancel()
    control_task.cancel()
    await asyncio.gather(consumer_task, control_task, return_exceptions=True)

    cancelled_b = await broadcast_service.cancel_all_broadcast_tasks()
    cancelled_i = await invite_service.cancel_all_invite_tasks()
    logger.info("Gracefully cancelled %d broadcast tasks and %d invite tasks", cancelled_b, cancelled_i)

    await engine.dispose()
    logger.info("Worker shutdown complete.")


if __name__ == "__main__":
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            signal.signal(sig, _handle_exit_signal)
        except (ValueError, AttributeError):
            pass

    asyncio.run(main())
