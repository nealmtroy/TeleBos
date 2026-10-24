"""Unit tests verifying smart FloodWait handling in auto-join service."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from app.services.auto_join_service import (
    _extract_flood_seconds,
    execute_auto_join,
)
from app.utils.telegram_errors import TelegramRateLimitError


def test_extract_flood_seconds():
    # 1. From exc.seconds
    err1 = TelegramRateLimitError("flood", seconds=60)
    assert _extract_flood_seconds(err1, "Flood wait: 60 seconds") == 60

    # 2. From exc.__cause__.seconds
    inner = TelegramRateLimitError("flood", seconds=45)
    err2 = RuntimeError("Failed to join via invite link")
    err2.__cause__ = inner
    assert _extract_flood_seconds(err2, "Some error") == 45

    # 3. From error message text fallback
    err3 = RuntimeError("Failed to join via invite link: A wait of 75 seconds is required")
    assert _extract_flood_seconds(err3, "Flood wait: 75 seconds") == 75

    # 4. From raw regex match
    err4 = Exception("FLOOD_WAIT_120")
    assert _extract_flood_seconds(err4, "FLOOD_WAIT_120") == 120


@pytest.mark.asyncio
async def test_auto_join_waits_and_retries_same_group_on_flood():
    """Verify that when a group hits FloodWait, auto-join waits the duration,
    retries the SAME group, and does not advance to the next group until cleared.
    """
    job_uuid = uuid4()
    job_id_str = str(job_uuid)

    mock_job = MagicMock()
    mock_job.id = job_uuid
    mock_job.user_id = uuid4()
    mock_job.status = "running"
    mock_job.account_ids = [str(uuid4())]
    mock_job.targets = [
        {"value": "group1", "type": "username"},
        {"value": "group2", "type": "username"},
        {"value": "group3", "type": "username"},
    ]
    mock_job.distribution_mode = "all"
    mock_job.delay_per_group = 1
    mock_job.delay_randomized = False

    mock_account = MagicMock()
    mock_account.id = mock_job.account_ids[0]
    mock_account.first_name = "BotUser"
    mock_account.phone = "+62812345"
    mock_account.session_string = "encrypted_session"

    mock_client = MagicMock()

    # Track calls to join_chat to verify ordering and retries
    join_calls = []
    attempt_for_group2 = 0

    async def mock_join_chat(acc, target):
        nonlocal attempt_for_group2
        join_calls.append(target)
        if target == "group2":
            attempt_for_group2 += 1
            if attempt_for_group2 == 1:
                # First attempt at group2 raises FloodWait 60s
                raise TelegramRateLimitError("flood", seconds=60)
            # Second attempt at group2 succeeds!
            return {"title": "Group 2", "chat_id": 200, "username": "group2"}
        return {"title": target, "chat_id": 100, "username": target}

    slept_durations = []
    async def mock_interruptible_sleep(job_id, seconds):
        slept_durations.append(seconds)
        return True

    mock_db = AsyncMock()
    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = mock_job
    mock_db.execute = AsyncMock(return_value=mock_res)
    mock_session_factory = MagicMock()
    mock_session_factory.return_value.__aenter__.return_value = mock_db
    mock_session_factory.return_value.__aexit__.return_value = None

    with patch("app.services.auto_join_service._session_factory", mock_session_factory), \
         patch("app.services.auto_join_service._get_job_status", new=AsyncMock(return_value="running")), \
         patch("app.utils.account_ownership.acquire_lease", new=AsyncMock(return_value=True)), \
         patch("app.utils.account_ownership.release_lease", new=AsyncMock(return_value=True)), \
         patch("app.services.account_service.get_account", new=AsyncMock(return_value=mock_account)), \
         patch("app.utils.encryption.decrypt", return_value="decrypted_session"), \
         patch("app.services.telegram_client.client_pool.borrow", new=AsyncMock(return_value=mock_client)), \
         patch("app.services.telegram_client.client_pool.release", new=AsyncMock()), \
         patch("app.services.telegram_client.client_pool.remove", new=AsyncMock()), \
         patch("app.services.group_admin_service.join_chat", side_effect=mock_join_chat), \
         patch("app.services.auto_join_service.interruptible_sleep", side_effect=mock_interruptible_sleep), \
         patch("app.services.auto_join_service._save_log_and_counters", new=AsyncMock()), \
         patch("app.services.auto_join_service._set_status", new=AsyncMock()), \
         patch("app.services.auto_join_service._push", new=AsyncMock()) as mock_push:

        await execute_auto_join(job_id_str)

        # 1. Verify sequence of join attempts:
        # group1 -> group2 (attempt 1: flood) -> group2 (attempt 2: retry after sleep) -> group3
        assert join_calls == ["group1", "group2", "group2", "group3"]

        # 2. Verify that sleep was called with flood wait seconds (60 + 2s buffer = 62s)
        # Note: also regular delay_per_group sleeps occurred
        assert any(d >= 60 for d in slept_durations)

        # 3. Verify flood_wait WebSocket push was sent
        flood_pushes = [c for c in mock_push.call_args_list if c[0][1] == "flood_wait"]
        assert len(flood_pushes) == 1
        assert flood_pushes[0][0][2]["wait_seconds"] == 62
        assert flood_pushes[0][0][2]["target"] == "group2"
