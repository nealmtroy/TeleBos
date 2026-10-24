"""Unit tests for schedule_helper."""

from datetime import datetime
from zoneinfo import ZoneInfo
import pytest

from app.utils.schedule_helper import is_within_schedule, is_valid_time_format, parse_time_str


def test_is_valid_time_format():
    assert is_valid_time_format("07:00") is True
    assert is_valid_time_format("17:00") is True
    assert is_valid_time_format("00:00") is True
    assert is_valid_time_format("23:59") is True
    assert is_valid_time_format("24:00") is False
    assert is_valid_time_format("07:60") is False
    assert is_valid_time_format("abc") is False
    assert is_valid_time_format("") is False
    assert is_valid_time_format(None) is False


def test_daytime_schedule_window():
    tz = ZoneInfo("Asia/Jakarta")

    # Inside window: 10:00 AM (Window 07:00 -> 17:00)
    dt_inside = datetime(2026, 10, 24, 10, 0, 0, tzinfo=tz)
    is_active, wait_sec = is_within_schedule("07:00", "17:00", now_dt=dt_inside)
    assert is_active is True
    # 7 hours remaining until 17:00 = 7 * 3600 = 25200 seconds
    assert wait_sec == 25200

    # Outside window (after end): 17:00:00 (exact boundary)
    dt_boundary = datetime(2026, 10, 24, 17, 0, 0, tzinfo=tz)
    is_active, wait_sec = is_within_schedule("07:00", "17:00", now_dt=dt_boundary)
    assert is_active is False
    # Next start is tomorrow at 07:00 = 14 hours = 14 * 3600 = 50400 seconds
    assert wait_sec == 50400

    # Outside window (night): 20:00 (Window 07:00 -> 17:00)
    dt_night = datetime(2026, 10, 24, 20, 0, 0, tzinfo=tz)
    is_active, wait_sec = is_within_schedule("07:00", "17:00", now_dt=dt_night)
    assert is_active is False
    # 11 hours until tomorrow 07:00 = 11 * 3600 = 39600 seconds
    assert wait_sec == 39600

    # Outside window (early morning): 05:00 (Window 07:00 -> 17:00)
    dt_early = datetime(2026, 10, 24, 5, 0, 0, tzinfo=tz)
    is_active, wait_sec = is_within_schedule("07:00", "17:00", now_dt=dt_early)
    assert is_active is False
    # 2 hours until today 07:00 = 2 * 3600 = 7200 seconds
    assert wait_sec == 7200

    # Inside window (exact start): 07:00:00
    dt_start = datetime(2026, 10, 24, 7, 0, 0, tzinfo=tz)
    is_active, wait_sec = is_within_schedule("07:00", "17:00", now_dt=dt_start)
    assert is_active is True
    assert wait_sec == 10 * 3600


def test_overnight_schedule_window():
    tz = ZoneInfo("Asia/Jakarta")

    # Inside window (late night): 22:00 (Window 21:00 -> 05:00)
    dt_night = datetime(2026, 10, 24, 22, 0, 0, tzinfo=tz)
    is_active, wait_sec = is_within_schedule("21:00", "05:00", now_dt=dt_night)
    assert is_active is True
    # 7 hours remaining until 05:00 tomorrow = 7 * 3600 = 25200 seconds
    assert wait_sec == 25200

    # Inside window (early morning): 03:00 (Window 21:00 -> 05:00)
    dt_morning = datetime(2026, 10, 24, 3, 0, 0, tzinfo=tz)
    is_active, wait_sec = is_within_schedule("21:00", "05:00", now_dt=dt_morning)
    assert is_active is True
    # 2 hours remaining until 05:00 today = 7200 seconds
    assert wait_sec == 7200

    # Outside window (daytime): 12:00 (Window 21:00 -> 05:00)
    dt_day = datetime(2026, 10, 24, 12, 0, 0, tzinfo=tz)
    is_active, wait_sec = is_within_schedule("21:00", "05:00", now_dt=dt_day)
    assert is_active is False
    # 9 hours until 21:00 today = 9 * 3600 = 32400 seconds
    assert wait_sec == 32400


def test_broadcast_schema_schedule_validation():
    import uuid
    from app.schemas.broadcast import BroadcastStartRequest

    # Valid schedule
    req = BroadcastStartRequest(
        account_ids=[uuid.uuid4()],
        group_list_id=uuid.uuid4(),
        mode="single_text",
        custom_text="Hello test",
        schedule_enabled=True,
        schedule_start_time="07:00",
        schedule_end_time="17:00",
    )
    assert req.schedule_enabled is True
    assert req.schedule_start_time == "07:00"
    assert req.schedule_end_time == "17:00"

    # Invalid start time
    with pytest.raises(ValueError, match="schedule_start_time"):
        BroadcastStartRequest(
            account_ids=[uuid.uuid4()],
            group_list_id=uuid.uuid4(),
            mode="single_text",
            custom_text="Hello test",
            schedule_enabled=True,
            schedule_start_time="25:00",
            schedule_end_time="17:00",
        )

    # Missing end time
    with pytest.raises(ValueError, match="schedule_end_time"):
        BroadcastStartRequest(
            account_ids=[uuid.uuid4()],
            group_list_id=uuid.uuid4(),
            mode="single_text",
            custom_text="Hello test",
            schedule_enabled=True,
            schedule_start_time="07:00",
            schedule_end_time=None,
        )
