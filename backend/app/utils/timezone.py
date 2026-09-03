"""Timezone normalization utilities."""

from datetime import datetime, timezone


def ensure_utc(dt: datetime | None) -> datetime | None:
    """Ensure a datetime object is timezone-aware and normalized to UTC.
    
    If dt is None, returns None.
    If dt is naive (no tzinfo), assigns timezone.utc.
    If dt is already timezone-aware, converts it to timezone.utc.
    """
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)
