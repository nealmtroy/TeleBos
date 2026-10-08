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


@pytest.mark.asyncio
async def test_resolve_destination_entity_prefers_telethon_cache():
    """Verify that _resolve_destination_entity uses Telethon session cache without calling get_entity."""
    from telethon.tl.types import InputPeerUser
    from app.services.broadcast_log_sender import _resolve_destination_entity, _resolved_dest_cache

    _resolved_dest_cache.clear()
    cached_peer = InputPeerUser(user_id=8433414493, access_hash=123456789)

    mock_client = AsyncMock()
    mock_client.get_input_entity = AsyncMock(return_value=cached_peer)
    mock_client.get_entity = AsyncMock(side_effect=AssertionError("get_entity must not be called when cached"))

    me = SimpleNamespace(id=123, phone="123456")
    entity = await _resolve_destination_entity(mock_client, "@teleboslogging_bot", me=me)
    assert entity == cached_peer
    mock_client.get_input_entity.assert_awaited_once_with("teleboslogging_bot")
    mock_client.get_entity.assert_not_called()


@pytest.mark.asyncio
async def test_resolve_destination_entity_prefers_db_cache():
    """Verify that when Telethon input cache misses, DB cache is used without calling get_entity."""
    from telethon.tl.types import InputPeerUser
    from app.services.broadcast_log_sender import _resolve_destination_entity, _resolved_dest_cache

    _resolved_dest_cache.clear()

    mock_client = AsyncMock()
    mock_client.get_input_entity = AsyncMock(side_effect=ValueError("cache miss"))
    mock_client.get_entity = AsyncMock(side_effect=AssertionError("get_entity must not be called when DB cached"))

    db_row = (8433414493, -1132153227385084420, "bot")
    mock_session = AsyncMock()
    mock_acc_res = SimpleNamespace(scalar_one_or_none=lambda: "acc-uuid-1")
    mock_chat_res = SimpleNamespace(first=lambda: db_row)
    mock_session.execute = AsyncMock(side_effect=[mock_acc_res, mock_chat_res])

    mock_session_ctx = AsyncMock()
    mock_session_ctx.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session_ctx.__aexit__ = AsyncMock(return_value=False)

    me = SimpleNamespace(id=456, phone="628123456")
    with patch("app.database.async_session_factory", return_value=mock_session_ctx):
        entity = await _resolve_destination_entity(mock_client, "@teleboslogging_bot", me=me)
        assert isinstance(entity, InputPeerUser)
        assert entity.user_id == 8433414493
        assert entity.access_hash == -1132153227385084420
        mock_client.get_entity.assert_not_called()


@pytest.mark.asyncio
async def test_send_message_safe_recovers_from_peer_id_invalid():
    """Verify that _send_message_safe recovers and retries when an invalid peer error occurs."""
    from telethon.errors import PeerIdInvalidError
    from telethon.tl.types import InputPeerUser
    from app.services.broadcast_log_sender import _send_message_safe, _resolved_dest_cache

    _resolved_dest_cache.clear()

    stale_peer = InputPeerUser(user_id=8433414493, access_hash=999999)
    fresh_peer = InputPeerUser(user_id=8433414493, access_hash=111111)

    mock_client = AsyncMock()
    mock_client.get_me = AsyncMock(return_value=SimpleNamespace(id=789, phone="12345"))
    mock_client.get_input_entity = AsyncMock(return_value=stale_peer)
    mock_client.get_entity = AsyncMock(return_value=fresh_peer)

    # First send_message fails with PeerIdInvalidError (invalid peer), second succeeds
    mock_client.send_message = AsyncMock(side_effect=[
        PeerIdInvalidError(request=None),
        None,
    ])

    await _send_message_safe(mock_client, "@teleboslogging_bot", "Cycle summary")

    assert mock_client.send_message.await_count == 2
    mock_client.get_entity.assert_awaited_with("@teleboslogging_bot")
    assert _resolved_dest_cache[(789, "@teleboslogging_bot")] == fresh_peer


