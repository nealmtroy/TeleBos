"""System-wide endpoints: status, health, announcements."""

import logging

from fastapi import APIRouter

from app.services.uptimerobot_status import uptimerobot_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/system", tags=["system"])


@router.get("/status")
async def system_status():
    """
    Return UptimeRobot-based Telegram service status.

    The response is cached server-side for ~60 seconds.
    """
    status = await uptimerobot_service.get_status()

    return {
        "overall": status.overall,
        "monitors": [
            {
                "id": m.id,
                "name": m.friendly_name,
                "url": m.url,
                "status": m.status,
                "under_maintenance": m.under_maintenance,
            }
            for m in status.monitors
        ],
        "fetched_at": status.fetched_at,
    }
