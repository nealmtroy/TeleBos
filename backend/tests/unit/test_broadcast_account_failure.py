"""Unit tests verifying account failure handling on borrow_client and prevention of ZeroDivisionError."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from app.models.broadcast_job import BroadcastJob
from app.models.group_list import GroupList
from app.models.telegram_account import TelegramAccount
from app.services.broadcast_service import execute_broadcast


@pytest.mark.asyncio
async def test_borrow_client_failure_removes_account_and_no_zero_division():
    """Verify that when borrow_client fails with session_revoked on the only active account,
    event_relay.detach is called, client_pool.remove is called, DB sets is_active=False,
    and no ZeroDivisionError is raised.
    """
    job_uuid = uuid4()
    acc_uuid = uuid4()
    gl_uuid = uuid4()
    acc_id_str = str(acc_uuid)

    mock_db = AsyncMock()
    mock_job = MagicMock(spec=BroadcastJob)
    mock_job.id = job_uuid
    mock_job.user_id = uuid4()
    mock_job.status = "running"
    mock_job.progress = 0
    mock_job.sent_count = 0
    mock_job.fail_count = 0
    mock_job.mode = "single_text"
    mock_job.custom_text = "Test message"
    mock_job.group_list_id = gl_uuid
    mock_job.text_list_id = None
    mock_job.account_ids = [acc_id_str]
    mock_job.delay_per_group = 1
    mock_job.delay_randomized = False
    mock_job.delay_after_all = 0
    mock_job.loop_enabled = False
    mock_job.group_list_name = "Test List"
    mock_job.total_groups = 1
    mock_job.log_destination = None

    mock_group_list = MagicMock(spec=GroupList)
    mock_group_list.id = gl_uuid
    mock_group_list.name = "Test List"
    mock_group_list.items = [{"value": "https://t.me/test_group", "type": "username"}]

    mock_acc = MagicMock(spec=TelegramAccount)
    mock_acc.id = acc_uuid
    mock_acc.is_active = True
    mock_acc.for_sale = False
    mock_acc.first_name = "Test"
    mock_acc.phone = "12345678"
    mock_acc.session_string = "fake_encrypted_session"
    mock_acc.auto_reply_enabled = False

    async def mock_execute(query, *args, **kwargs):
        query_str = str(query)
        res = MagicMock()
        if "telegram_accounts" in query_str:
            res.scalar_one_or_none.return_value = mock_acc
        elif "group_lists" in query_str:
            res.scalar_one_or_none.return_value = mock_group_list
        elif "max(" in query_str:
            res.scalar.return_value = 0
        else:
            res.scalar_one_or_none.return_value = mock_job
            res.scalar.return_value = "running"
        return res

    mock_db.execute.side_effect = mock_execute

    mock_factory = MagicMock()
    mock_factory.return_value.__aenter__.return_value = mock_db
    mock_factory.return_value.__aexit__.return_value = None

    class UserDeactivatedError(Exception):
        pass

    with patch("app.database.async_session_factory", mock_factory), \
         patch("app.services.broadcast_service.decrypt", return_value="fake_decrypted_session"), \
         patch("app.services.broadcast_service._resolve_job_watermark", return_value=""), \
         patch("app.services.broadcast_service._push_broadcast", new=AsyncMock()), \
         patch("app.services.broadcast_service._flush_cycle_logs", new=AsyncMock()), \
         patch("app.services.broadcast_service._get_broadcast_job_status", new=AsyncMock(return_value="running")), \
         patch("app.services.broadcast_service.event_relay.detach", new=AsyncMock()) as mock_detach, \
         patch("app.services.broadcast_service.client_pool.remove", new=AsyncMock()) as mock_pool_remove, \
         patch("app.services.broadcast_service.acquire_lease", new=AsyncMock(return_value=True)), \
         patch("app.services.broadcast_service.release_lease", new=AsyncMock(return_value=True)), \
         patch("app.services.broadcast_service.borrow_client", side_effect=UserDeactivatedError("The user has been deactivated (caused by ResolveUsernameRequest)")), \
         patch("app.utils.redis_dispatcher.publish_job_completed", new=AsyncMock()):

        # Execute execute_broadcast
        await execute_broadcast(job_uuid)

        # Assert event_relay and client_pool were called to detach and remove the deactivated account
        mock_detach.assert_awaited_with(acc_id_str)
        mock_pool_remove.assert_awaited_with(acc_id_str)

        # Assert account is_active was marked False
        assert mock_acc.is_active is False

        # Assert job was marked failed
        assert mock_job.status == "failed"
