"""Async helper utilities — job event registries and interruptible sleep."""

import asyncio
import logging
from typing import Dict

logger = logging.getLogger(__name__)

# Shared registry of events to wake up sleeping tasks/jobs
_job_events: Dict[str, asyncio.Event] = {}


def get_job_event(job_id: str) -> asyncio.Event:
    """Get or create an asyncio.Event for the given job ID."""
    if job_id not in _job_events:
        _job_events[job_id] = asyncio.Event()
    return _job_events[job_id]


def wake_job(job_id: str) -> None:
    """Set the event for the given job ID to wake it up if it is sleeping."""
    ev = _job_events.get(job_id)
    if ev:
        ev.set()


def clear_job_event(job_id: str) -> None:
    """Remove the event from the registry."""
    _job_events.pop(job_id, None)


async def interruptible_sleep(job_id: str, seconds: float) -> bool:
    """Sleep for the specified seconds, or until the job event is set.
    
    Returns True if the sleep completed fully (timeout), False if it was interrupted.
    """
    if seconds <= 0:
        return True

    ev = get_job_event(job_id)
    ev.clear()
    try:
        await asyncio.wait_for(ev.wait(), timeout=seconds)
        # If we get here, the event was set (interrupted)
        return False
    except asyncio.TimeoutError:
        # If we get TimeoutError, it means the event was NOT set and time expired (natural completion)
        return True
