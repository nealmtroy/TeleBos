"""Schedule helper for time-of-day window execution (e.g. Broadcast Terjadwal)."""

from datetime import datetime, time as dtime, timedelta
import logging
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)

DEFAULT_SCHEDULE_TIMEZONE = "Asia/Jakarta"  # WIB (UTC+7)


def is_valid_time_format(val: str | None) -> bool:
    """Validate that val matches HH:MM format with valid hour (0-23) and minute (0-59)."""
    if not val or not isinstance(val, str):
        return False
    parts = val.strip().split(":")
    if len(parts) != 2:
        return False
    try:
        h, m = int(parts[0]), int(parts[1])
        return 0 <= h <= 23 and 0 <= m <= 59
    except ValueError:
        return False


def parse_time_str(val: str | None) -> dtime | None:
    """Parse 'HH:MM' string into a datetime.time object."""
    if not val or not isinstance(val, str):
        return None
    parts = val.strip().split(":")
    if len(parts) != 2:
        return None
    try:
        return dtime(int(parts[0]), int(parts[1]))
    except ValueError:
        return None


def is_within_schedule(
    start_str: str | None,
    end_str: str | None,
    tz_name: str = DEFAULT_SCHEDULE_TIMEZONE,
    now_dt: datetime | None = None,
) -> tuple[bool, int]:
    """Check if current time is within [start_str, end_str] in the given timezone.

    Returns:
        tuple[bool, int]:
            - is_active (bool): True if current time is within active working hours, False otherwise.
            - seconds_until_transition (int):
                - If is_active is True: seconds remaining until window closes (time to pause).
                - If is_active is False: seconds remaining until window opens next (time to resume).
    """
    if not start_str or not end_str:
        return True, 0

    start_t = parse_time_str(start_str)
    end_t = parse_time_str(end_str)
    if not start_t or not end_t:
        return True, 0

    try:
        tz = ZoneInfo(tz_name)
    except Exception:
        tz = ZoneInfo(DEFAULT_SCHEDULE_TIMEZONE)

    now = now_dt if now_dt is not None else datetime.now(tz)
    if now.tzinfo is None:
        now = now.replace(tzinfo=tz)

    today_date = now.date()
    dt_start = datetime.combine(today_date, start_t, tzinfo=tz)
    dt_end = datetime.combine(today_date, end_t, tzinfo=tz)

    # Case 1: Same start and end (e.g. 07:00 - 07:00) -> 24h active
    if dt_start == dt_end:
        return True, 86400

    # Case 2: Standard daytime window (e.g. 07:00 to 17:00)
    if dt_start < dt_end:
        if dt_start <= now < dt_end:
            # Currently active
            seconds_left = int((dt_end - now).total_seconds())
            return True, max(1, seconds_left)
        else:
            # Outside active window
            if now < dt_start:
                # Early morning before start time -> wait until start today
                wait_sec = int((dt_start - now).total_seconds())
            else:
                # Past end time -> wait until start tomorrow
                dt_next_start = dt_start + timedelta(days=1)
                wait_sec = int((dt_next_start - now).total_seconds())
            return False, max(1, wait_sec)

    # Case 3: Overnight window (e.g. 21:00 to 05:00 next day)
    else:
        if now >= dt_start:
            # Late night after start -> closes tomorrow at end_t
            dt_next_end = dt_end + timedelta(days=1)
            seconds_left = int((dt_next_end - now).total_seconds())
            return True, max(1, seconds_left)
        elif now < dt_end:
            # Early morning before end -> closes today at end_t
            seconds_left = int((dt_end - now).total_seconds())
            return True, max(1, seconds_left)
        else:
            # Daytime between end_t and start_t (outside window) -> opens today at start_t
            wait_sec = int((dt_start - now).total_seconds())
            return False, max(1, wait_sec)
