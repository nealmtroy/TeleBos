"""Unit tests for Code Quality Fase 1 (Enums and Timezone utilities)."""

from datetime import datetime, timezone, timedelta
from app.models.enums import JobStatus, UserRole, SMMStatus, MarketplaceDefaults
from app.utils.timezone import ensure_utc


def test_enums_str_compatibility():
    """Verify that StrEnum values serialize and compare transparently with strings."""
    assert JobStatus.RUNNING == "running"
    assert JobStatus.PAUSED == "paused"
    assert JobStatus.COMPLETED == "completed"
    assert JobStatus.CANCELLED == "cancelled"

    assert UserRole.BASIC == "basic"
    assert UserRole.PRO == "pro"
    assert UserRole.PREMIUM == "premium"
    assert UserRole.OWNER == "owner"

    assert SMMStatus.COMPLETED == "Completed"
    assert SMMStatus.PENDING == "Pending"

    assert MarketplaceDefaults.DEFAULT_ACCOUNT_PRICE == 5500


def test_ensure_utc_behavior():
    """Verify ensure_utc handles None, naive datetime, and aware datetimes correctly."""
    # None
    assert ensure_utc(None) is None

    # Naive
    naive = datetime(2026, 9, 3, 12, 0, 0)
    aware = ensure_utc(naive)
    assert aware.tzinfo == timezone.utc
    assert aware.year == 2026
    assert aware.hour == 12

    # Aware with offset
    plus_7 = timezone(timedelta(hours=7))
    dt_wib = datetime(2026, 9, 3, 19, 0, 0, tzinfo=plus_7)
    converted = ensure_utc(dt_wib)
    assert converted.tzinfo == timezone.utc
    assert converted.hour == 12  # 19:00 WIB == 12:00 UTC
