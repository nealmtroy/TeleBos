"""Broadcast entitlements: watermark for free accounts and a daily send quota.

TeleBos watermarks messages sent by the ``basic`` (free) role so a broadcast
originates visibly from the platform, and caps how much broadcast time that
role may consume per day. Both settings are owner-configurable through the admin
SMM settings panel:

``broadcast_watermark_text``     template appended to free-tier messages.
                                ``{official}`` expands to the official channel.
``broadcast_watermark_enabled``  ``"true"`` / ``"false"``.
``broadcast_free_daily_seconds`` free-tier send-time budget per day, in seconds.

Roles above ``basic`` pay for the service and are never watermarked or capped.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.broadcast_log import BroadcastLog
from app.models.broadcast_job import BroadcastJob
from app.models.smm_setting import SmmSetting

logger = logging.getLogger(__name__)

# Roles that broadcast without a watermark and without a daily cap.
UNRESTRICTED_ROLES = frozenset({"pro", "premium", "owner"})

SETTING_WATERMARK_TEXT = "broadcast_watermark_text"
SETTING_WATERMARK_ENABLED = "broadcast_watermark_enabled"
SETTING_FREE_DAILY_SECONDS = "broadcast_free_daily_seconds"

DEFAULT_WATERMARK_TEXT = "Bot by @{official}"
DEFAULT_FREE_DAILY_SECONDS = 5 * 60 * 60  # 5 hours

OFFICIAL_CHANNEL = "telebos_official"

# A broadcast slower than this is stuck in a flood-wait backoff rather than
# genuinely sending; counting it would punish the user for Telegram's limits.
MIN_MEANINGFUL_SEND_SECONDS = 1.0


def requires_watermark(role: str) -> bool:
    """Return whether this role's outgoing messages must carry the watermark."""
    return role not in UNRESTRICTED_ROLES


async def _read_setting(db: AsyncSession, key: str, default: str) -> str:
    result = await db.execute(select(SmmSetting).where(SmmSetting.key == key))
    row = result.scalar_one_or_none()
    if row is None or row.value is None or row.value == "":
        return default
    return row.value


async def get_watermark_config(db: AsyncSession) -> tuple[bool, str]:
    """Return ``(enabled, template)`` for the free-tier watermark."""
    enabled_raw = (await _read_setting(db, SETTING_WATERMARK_ENABLED, "true")).strip().lower()
    template = await _read_setting(db, SETTING_WATERMARK_TEXT, DEFAULT_WATERMARK_TEXT)
    return enabled_raw == "true", template


def render_watermark(template: str) -> str:
    """Expand placeholders in the owner-supplied watermark template."""
    return template.replace("{official}", OFFICIAL_CHANNEL).replace("{username}", "").strip()


def _day_bounds(now: datetime) -> tuple[datetime, datetime]:
    """Return the UTC day window that ``now`` falls in."""
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return start, start + timedelta(days=1)


async def get_free_daily_limit(db: AsyncSession) -> int:
    """Read the free-tier daily broadcast budget, in seconds."""
    raw = await _read_setting(db, SETTING_FREE_DAILY_SECONDS, str(DEFAULT_FREE_DAILY_SECONDS))
    try:
        value = int(float(raw))
    except (TypeError, ValueError):
        logger.warning("Setting %s is not a number (%r); using the default", SETTING_FREE_DAILY_SECONDS, raw)
        return DEFAULT_FREE_DAILY_SECONDS
    return max(0, value)


async def get_remaining_broadcast_seconds(db: AsyncSession, user_id: str) -> int:
    """Seconds of broadcast send-time the user may still consume today.

    Consuming a message counts only the time actually spent sending, recorded
    in ``BroadcastLog.details[].send_ms``. The per-group ``duration_ms`` is not
    usable here: it also covers the configured delay and any flood-wait sleep,
    so summing it would charge the user for the throttle the product asked for.
    """
    limit = await get_free_daily_limit(db)
    if limit <= 0:
        return 0

    now = datetime.now(timezone.utc)
    day_start, day_end = _day_bounds(now)

    result = await db.execute(
        select(BroadcastLog.details).where(
            BroadcastLog.job_id.in_(
                select(BroadcastJob.id).where(
                    BroadcastJob.user_id == user_id,
                    BroadcastJob.created_at >= day_start,
                    BroadcastJob.created_at < day_end,
                )
            )
        )
    )

    used_ms = 0
    for details in result.scalars().all():
        for entry in details or []:
            if not isinstance(entry, dict) or entry.get("status") != "success":
                continue
            send_ms = entry.get("send_ms")
            if isinstance(send_ms, (int, float)):
                used_ms += int(send_ms)

    return max(0, limit - int(used_ms / 1000))


async def has_broadcast_allowance(db: AsyncSession, user_id: str, role: str) -> bool:
    """Whether this user may start another broadcast right now."""
    if role in UNRESTRICTED_ROLES:
        return True
    return await get_remaining_broadcast_seconds(db, user_id) > 0


async def enforce_broadcast_allowance(db: AsyncSession, user: "object") -> None:
    """Raise a user-facing error when a free account is out of daily send time."""
    role = getattr(user, "role", "basic")
    if role in UNRESTRICTED_ROLES:
        return
    remaining = await get_remaining_broadcast_seconds(db, str(user.id))
    if remaining <= 0:
        raise ValueError(
            "Your free daily broadcast time is used up. It resets at 00:00 UTC, "
            "or upgrade your plan for unlimited broadcast time."
        )
