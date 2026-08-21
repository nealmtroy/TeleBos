"""Unit tests for the Telegram Registration Date Estimator Service."""

import datetime
import pytest
from unittest.mock import AsyncMock, MagicMock

from app.models.telegram_registration_datapoint import TelegramRegistrationDatapoint
from app.services.telegram_reg_date_service import reg_date_service


def test_format_age():
    """Verify age formatting logic yields expected human-readable text."""
    now = datetime.datetime.now(datetime.timezone.utc)

    # 1. Less than a month (0 months)
    assert reg_date_service.format_age(now) == "0 months"

    # 2. 5 months ago
    five_months_ago = now - datetime.timedelta(days=150)
    assert "months" in reg_date_service.format_age(five_months_ago)

    # 3. 2 years exactly (24 months)
    two_years_ago = now.replace(year=now.year - 2)
    assert reg_date_service.format_age(two_years_ago) == "2 years"

    # 4. 2 years and 3 months (27 months)
    two_years_three_months_ago = now.replace(year=now.year - 2)
    # Subtract 3 months
    month = two_years_three_months_ago.month - 3
    year = two_years_three_months_ago.year
    if month <= 0:
        month += 12
        year -= 1
    two_years_three_months_ago = two_years_three_months_ago.replace(year=year, month=month)
    assert reg_date_service.format_age(two_years_three_months_ago) == "2 years, 3 months"


@pytest.mark.asyncio
async def test_estimate_registration_date_exact():
    """Verify exact match checks return correct date directly."""
    db = AsyncMock()

    mock_exact = TelegramRegistrationDatapoint(
        telegram_id=5000,
        registered_at=datetime.datetime(2020, 6, 15, tzinfo=datetime.timezone.utc),
        source="seeded",
    )

    # First call to db.execute finds exact match
    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = mock_exact
    db.execute.return_value = mock_res

    res = await reg_date_service.get_estimated_registration_date(db, 5000)

    assert res is not None
    assert res["status"] == "exact"
    assert res["date"] == mock_exact.registered_at
    assert "years" in res["age"]


@pytest.mark.asyncio
async def test_estimate_registration_date_older_boundary():
    """Verify boundary checks resolve to older_than when target ID is less than min ID."""
    db = AsyncMock()

    # Exact match is None
    # Lower bound is None
    # Upper bound is the min ID in database (e.g. ID = 2000)
    mock_upper = TelegramRegistrationDatapoint(
        telegram_id=2000,
        registered_at=datetime.datetime(2013, 11, 1, tzinfo=datetime.timezone.utc),
        source="seeded",
    )

    mock_res_exact = MagicMock()
    mock_res_exact.scalar_one_or_none.return_value = None

    mock_res_lower = MagicMock()
    mock_res_lower.scalar_one_or_none.return_value = None

    mock_res_upper = MagicMock()
    mock_res_upper.scalar_one_or_none.return_value = mock_upper

    db.execute.side_effect = [mock_res_exact, mock_res_lower, mock_res_upper]

    res = await reg_date_service.get_estimated_registration_date(db, 1000)

    assert res is not None
    assert res["status"] == "older_than"
    assert res["date"] == mock_upper.registered_at


@pytest.mark.asyncio
async def test_estimate_registration_date_newer_boundary():
    """Verify boundary checks resolve to newer_than when target ID exceeds max ID."""
    db = AsyncMock()

    # Exact match is None
    # Lower bound is max ID in database (e.g. ID = 90000)
    mock_lower = TelegramRegistrationDatapoint(
        telegram_id=90000,
        registered_at=datetime.datetime(2025, 11, 11, tzinfo=datetime.timezone.utc),
        source="seeded",
    )

    mock_res_exact = MagicMock()
    mock_res_exact.scalar_one_or_none.return_value = None

    mock_res_lower = MagicMock()
    mock_res_lower.scalar_one_or_none.return_value = mock_lower

    mock_res_upper = MagicMock()
    mock_res_upper.scalar_one_or_none.return_value = None

    db.execute.side_effect = [mock_res_exact, mock_res_lower, mock_res_upper]

    res = await reg_date_service.get_estimated_registration_date(db, 100000)

    assert res is not None
    assert res["status"] == "newer_than"
    assert res["date"] == mock_lower.registered_at


@pytest.mark.asyncio
async def test_estimate_registration_date_interpolation():
    """Verify linear interpolation math correctly approximates date between two bounds."""
    db = AsyncMock()

    # Lower bound: ID = 1000, Date = 2020-01-01 00:00:00 (ts = 1577836800)
    mock_lower = TelegramRegistrationDatapoint(
        telegram_id=1000,
        registered_at=datetime.datetime(2020, 1, 1, 0, 0, 0, tzinfo=datetime.timezone.utc),
        source="seeded",
    )

    # Upper bound: ID = 2000, Date = 2020-01-03 00:00:00 (ts = 1578009600)
    # Difference: 1000 IDs, 172800 seconds (2 days)
    mock_upper = TelegramRegistrationDatapoint(
        telegram_id=2000,
        registered_at=datetime.datetime(2020, 1, 3, 0, 0, 0, tzinfo=datetime.timezone.utc),
        source="seeded",
    )

    mock_res_exact = MagicMock()
    mock_res_exact.scalar_one_or_none.return_value = None

    mock_res_lower = MagicMock()
    mock_res_lower.scalar_one_or_none.return_value = mock_lower

    mock_res_upper = MagicMock()
    mock_res_upper.scalar_one_or_none.return_value = mock_upper

    db.execute.side_effect = [mock_res_exact, mock_res_lower, mock_res_upper]

    # Target ID is exactly in the middle: ID = 1500
    # Expected estimated date should be exactly in the middle: 2020-01-02 00:00:00 (ts = 1577923200)
    res = await reg_date_service.get_estimated_registration_date(db, 1500)

    assert res is not None
    assert res["status"] == "approx"
    assert res["date"] == datetime.datetime(2020, 1, 2, 0, 0, 0, tzinfo=datetime.timezone.utc)
