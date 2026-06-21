"""
UptimeRobot service — fetches monitor status from UptimeRobot API v2.

A background task fetches status every 10 minutes and caches it globally.
All users read the same cached value — no per-request API calls.
"""

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

# ── Types ──────────────────────────────────────────────────────────────────────

MONITOR_STATUS = {
    0: "paused",
    1: "not_checked_yet",
    2: "up",
    8: "seems_down",
    9: "down",
}

MAINTAINER_STATUS = {
    0: "not_under_maintenance",
    1: "under_maintenance",
}


@dataclass
class MonitorInfo:
    """A single monitor from UptimeRobot."""

    id: int
    friendly_name: str
    url: str
    status: str  # up / down / seems_down / paused
    under_maintenance: bool
    status_code: int  # raw UptimeRobot code


@dataclass
class UptimeStatus:
    """Overall Telegram-service status."""

    overall: str  # "up" | "down" | "degraded" | "unknown"
    monitors: list[MonitorInfo] = field(default_factory=list)
    fetched_at: str = ""  # ISO‑8601
    raw_response: dict | None = field(default=None, repr=False)


# ── Service ────────────────────────────────────────────────────────────────────


class UptimeRobotService:
    """
    Background-refreshed wrapper around UptimeRobot v2 API.

    Call ``get_status()`` to read the latest cached value (instant, no I/O).
    Call ``start_background_refresh()`` to kick off the periodic fetch loop.
    Call ``stop()`` to cancel it.
    """

    def __init__(self) -> None:
        self._cache: UptimeStatus = UptimeStatus(overall="unknown")
        self._lock = asyncio.Lock()
        self._task: asyncio.Task | None = None
        self._interval: float = 600.0  # 10 minutes

    # ── Lifecycle ──────────────────────────────────────────────────────────

    def start_background_refresh(self) -> None:
        """Start the background refresh loop (called from FastAPI lifespan)."""
        if self._task is not None:
            return
        self._task = asyncio.create_task(self._refresh_loop())
        logger.info(
            "UptimeRobot background refresh started (interval=%ss)", self._interval
        )

    async def stop(self) -> None:
        """Cancel the background refresh loop."""
        if self._task is None:
            return
        self._task.cancel()
        try:
            await self._task
        except asyncio.CancelledError:
            pass
        self._task = None
        logger.info("UptimeRobot background refresh stopped")

    # ── Public API ─────────────────────────────────────────────────────────

    async def get_status(self) -> UptimeStatus:
        """Return the latest cached status (instant, no external call)."""
        async with self._lock:
            return self._cache

    async def refresh(self) -> UptimeStatus:
        """Force a one-shot fetch and update the cache immediately."""
        fresh = await self._fetch()
        async with self._lock:
            self._cache = fresh
        return fresh

    # ── Background loop ────────────────────────────────────────────────────

    async def _refresh_loop(self) -> None:
        """Periodic background fetcher — runs forever until cancelled."""
        while True:
            try:
                fresh = await self._fetch()
                async with self._lock:
                    self._cache = fresh
                logger.debug("UptimeRobot status refreshed: %s", fresh.overall)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.error("UptimeRobot background refresh error: %s", exc)

            await asyncio.sleep(self._interval)

    # ── Fetch ──────────────────────────────────────────────────────────────

    async def _fetch(self) -> UptimeStatus:
        """Hit the UptimeRobot v2 ``getMonitors`` API."""
        settings = get_settings()

        if not settings.UPTIMEROBOT_API_KEY:
            return UptimeStatus(overall="unknown", monitors=[])

        api_url = settings.UPTIMEROBOT_API_URL.rstrip("/") + "/getMonitors"

        payload: dict = {
            "api_key": settings.UPTIMEROBOT_API_KEY,
            "format": "json",
        }

        # Filter to specific monitors when configured
        if settings.UPTIMEROBOT_MONITOR_IDS:
            try:
                ids = [
                    int(x.strip())
                    for x in settings.UPTIMEROBOT_MONITOR_IDS.split(",")
                    if x.strip()
                ]
                if ids:
                    payload["monitors"] = ",".join(str(i) for i in ids)
            except ValueError:
                logger.warning(
                    "UPTIMEROBOT_MONITOR_IDS contains non‑integer values: %s",
                    settings.UPTIMEROBOT_MONITOR_IDS,
                )

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(api_url, data=payload)
                resp.raise_for_status()
                data = resp.json()
        except httpx.RequestError as exc:
            logger.error("UptimeRobot request failed: %s", exc)
            return UptimeStatus(overall="unknown", monitors=[])
        except Exception as exc:
            logger.error("UptimeRobot unexpected error: %s", exc)
            return UptimeStatus(overall="unknown", monitors=[])

        if data.get("stat") != "ok":
            logger.warning("UptimeRobot API returned stat!=ok: %s", data)
            return UptimeStatus(overall="unknown", monitors=[])

        monitors_raw = data.get("monitors", [])
        monitors: list[MonitorInfo] = []

        for m in monitors_raw:
            status_code = m.get("status", 0)
            monitors.append(
                MonitorInfo(
                    id=m.get("id", 0),
                    friendly_name=m.get("friendly_name", ""),
                    url=m.get("url", ""),
                    status=MONITOR_STATUS.get(status_code, "unknown"),
                    under_maintenance=MAINTAINER_STATUS.get(
                        m.get("maintenance_status", 0), False
                    ),
                    status_code=status_code,
                )
            )

        overall = self._derive_overall(monitors)
        now_iso = datetime.now(timezone.utc).isoformat()

        return UptimeStatus(
            overall=overall,
            monitors=monitors,
            fetched_at=now_iso,
            raw_response=data,
        )

    @staticmethod
    def _derive_overall(monitors: list[MonitorInfo]) -> str:
        """Derive overall status from the monitor list."""
        if not monitors:
            return "unknown"

        statuses = [m.status for m in monitors]

        if all(s == "up" for s in statuses):
            return "up"
        if any(s in ("down", "seems_down") for s in statuses):
            return "down"
        if any(s == "paused" for s in statuses):
            return "degraded"
        return "unknown"


# Module‑level singleton
uptimerobot_service = UptimeRobotService()
