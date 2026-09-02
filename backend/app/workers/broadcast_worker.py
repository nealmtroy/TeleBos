"""Celery task that executes a broadcast job."""

import asyncio
import logging

from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(bind=True, max_retries=0)
def run_broadcast_job(self, job_id: str):
    """Run a broadcast job in a Celery worker."""
    logger.info("Starting broadcast job %s", job_id)
    try:
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None

        if loop and loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                pool.submit(asyncio.run, _execute(job_id)).result()
        else:
            asyncio.run(_execute(job_id))
    except Exception as exc:
        logger.exception("Broadcast job %s crashed: %s", job_id, exc)
        raise


async def _execute(job_id: str):
    """Async entry point that imports and calls the broadcast service."""
    from app.services.broadcast_service import execute_broadcast
    await execute_broadcast(job_id)
