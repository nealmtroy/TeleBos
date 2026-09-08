"""Unit tests for broadcast_log_sender."""

from datetime import datetime, timezone
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
import pytest

from app.services.broadcast_log_sender import (
    _format_cycle_summary,
    _get_val,
    send_cycle_summary,
)


def test_get_val_with_dict_and_object():
    """Verify _get_val extracts values correctly from both dicts and objects."""
    d = {"status": "success", "group_identifier": "@testgroup"}
    obj = SimpleNamespace(status="error", group_identifier="@failgroup")

    assert _get_val(d, "status") == "success"
    assert _get_val(d, "group_identifier") == "@testgroup"
    assert _get_val(d, "missing", "default") == "default"

    assert _get_val(obj, "status") == "error"
    assert _get_val(obj, "group_identifier") == "@failgroup"
    assert _get_val(obj, "missing", "default") == "default"


def test_format_cycle_summary():
    """Verify formatting cycle summary with both dict and model logs."""
    start_time = datetime.now(timezone.utc)
    end_time = datetime.now(timezone.utc)

    cycle_logs = [
        {"status": "success", "group_identifier": "@successgroup", "sent_at": start_time.isoformat()},
        {"status": "error", "group_identifier": "@errorgroup", "error_type": "flood", "sent_at": end_time.isoformat()},
    ]

    summary = _format_cycle_summary(
        job_name="Test Job",
        cycle_number=1,
        start_time=start_time,
        end_time=end_time,
        text_list_name="Default Text",
        group_list_name="Default Groups",
        total_groups=2,
        active_this_round=2,
        cycle_logs=cycle_logs,
        accounts_by_id={},
        item_type_by_identifier={},
    )

    assert "Broadcast Cycle #1" in summary
    assert "Test Job" in summary
    assert "Sent</b>: ✅ 1" in summary
    assert "Failed</b>: ❌ 1" in summary
    assert "@successgroup" in summary
    assert "@errorgroup" in summary


@pytest.mark.asyncio
async def test_send_cycle_summary_does_not_fail():
    """Verify send_cycle_summary completes and handles _get_val without NameError."""
    mock_client = AsyncMock()
    mock_client.get_me = AsyncMock(return_value=SimpleNamespace(id=123456))
    mock_client.send_message = AsyncMock()

    job = SimpleNamespace(
        id=uuid.uuid4(),
        log_destination="@teleboslogging_bot",
        created_at=datetime.now(timezone.utc),
    )

    cycle_logs = [
        {"status": "success", "group_identifier": "@successgroup", "sent_at": datetime.now(timezone.utc).isoformat()},
    ]

    with patch("app.services.broadcast_log_sender._send_message_safe", new_callable=AsyncMock) as mock_send:
        await send_cycle_summary(
            client=mock_client,
            job=job,
            cycle_number=33,
            group_list_name="My Groups",
            total_groups=10,
            active_this_round=5,
            cycle_logs=cycle_logs,
            accounts_by_id={},
            item_type_by_identifier={},
            text_list_name="Promo Text",
        )
        mock_send.assert_awaited_once()


def test_format_cycle_summary_truncates_large_lists():
    """Verify that cycle summary caps display to prevent exceeding Telegram 4096 character limit."""
    start_time = datetime.now(timezone.utc)
    end_time = datetime.now(timezone.utc)

    # 100 successful targets and 100 error targets
    cycle_logs = [
        {"status": "success", "group_identifier": f"@success_group_{i}", "sent_at": start_time.isoformat()}
        for i in range(100)
    ] + [
        {"status": "error", "group_identifier": f"@error_group_{i}", "error_type": "FloodWait", "sent_at": end_time.isoformat()}
        for i in range(100)
    ]

    summary = _format_cycle_summary(
        job_name="Huge Job",
        cycle_number=4,
        start_time=start_time,
        end_time=end_time,
        text_list_name="Promo",
        group_list_name="Many Groups",
        total_groups=200,
        active_this_round=200,
        cycle_logs=cycle_logs,
        accounts_by_id={},
        item_type_by_identifier={},
    )

    assert len(summary) <= 4000
    assert "dan 75 grup lainnya" in summary
    assert "dan 75 target gagal lainnya" in summary


@pytest.mark.asyncio
async def test_send_message_safe_handles_flood_wait():
    """Verify that _send_message_safe catches FloodWaitError without propagating."""
    from telethon.errors import FloodWaitError
    from app.services.broadcast_log_sender import _send_message_safe

    mock_client = AsyncMock()
    mock_client.get_me = AsyncMock(return_value=SimpleNamespace(id=999))
    mock_client.get_entity = AsyncMock(side_effect=FloodWaitError(request=None, capture=8676))

    # Should not raise exception
    await _send_message_safe(mock_client, "@teleboslogging_bot", "Test log message")

