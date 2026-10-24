"""Unit tests for Auto Leave feature — scanning, starting, smart FloodWait, PeerFlood, and fatal errors."""

import asyncio
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import telethon.errors

from app.models.auto_leave_job import AutoLeaveJob
from app.models.auto_leave_log import AutoLeaveLog
from app.models.telegram_account import TelegramAccount
from app.services import auto_leave_service


@pytest.mark.asyncio
async def test_scan_account_dialogs():
    """Verify dialog scanning correctly counts groups vs channels and creator status."""
    acc_id = uuid.uuid4()
    user_id = uuid.uuid4()

    mock_acc = TelegramAccount(
        id=acc_id,
        user_id=user_id,
        phone="+628123456789",
        session_string="encrypted_session",
        is_active=True,
    )

    # Mock dialog entities
    grp1 = MagicMock()
    grp1.is_group = True
    grp1.is_channel = False
    grp1.entity = MagicMock(creator=False)

    grp_creator = MagicMock()
    grp_creator.is_group = True
    grp_creator.is_channel = False
    grp_creator.entity = MagicMock(creator=True)

    chn1 = MagicMock()
    chn1.is_group = False
    chn1.is_channel = True
    chn1.entity = MagicMock(creator=False)

    chn_creator = MagicMock()
    chn_creator.is_group = False
    chn_creator.is_channel = True
    chn_creator.entity = MagicMock(creator=True)

    user_dialog = MagicMock()
    user_dialog.is_group = False
    user_dialog.is_channel = False
    user_dialog.entity = MagicMock(creator=False)

    async def mock_iter_dialogs():
        for d in [grp1, grp_creator, chn1, chn_creator, user_dialog]:
            yield d

    mock_client = MagicMock()
    mock_client.iter_dialogs = mock_iter_dialogs

    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [mock_acc]
    mock_db.execute.return_value = mock_result

    with patch("app.services.auto_leave_service.decrypt", return_value="decrypted"), \
         patch("app.services.auto_leave_service.client_pool.get", AsyncMock(return_value=mock_client)):
        res = await auto_leave_service.scan_account_dialogs(mock_db, str(user_id), [str(acc_id)])

    assert len(res.accounts) == 1
    acc_item = res.accounts[0]
    assert acc_item.group_count == 2
    assert acc_item.creator_group_count == 1
    assert acc_item.channel_count == 2
    assert acc_item.creator_channel_count == 1
    assert res.total_groups == 2
    assert res.total_channels == 2


@pytest.mark.asyncio
async def test_start_auto_leave_enqueues_per_account():
    """Verify start_auto_leave creates a job per account and enqueues to Redis."""
    user_id = uuid.uuid4()
    acc1 = TelegramAccount(id=uuid.uuid4(), user_id=user_id, phone="+628111")
    acc2 = TelegramAccount(id=uuid.uuid4(), user_id=user_id, phone="+628222")

    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [acc1, acc2]
    mock_db.execute.return_value = mock_result
    mock_db.add = MagicMock()

    with patch("app.services.auto_leave_service.find_busy_accounts", AsyncMock(return_value=[])), \
         patch("app.utils.redis_dispatcher.enqueue_job", AsyncMock(return_value=True)) as mock_enqueue:
        primary_job, all_job_ids = await auto_leave_service.start_auto_leave(
            mock_db,
            user_id=user_id,
            account_ids=[str(acc1.id), str(acc2.id)],
            leave_type="both",
            skip_creator=True,
            delay_per_chat=3,
            delay_randomized=False,
        )

    assert len(all_job_ids) == 2
    assert primary_job.leave_type == "both"
    assert primary_job.delay_per_chat == 3
    assert mock_enqueue.call_count == 2


@pytest.mark.asyncio
async def test_execute_auto_leave_smart_flood_wait():
    """Verify smart FloodWait handling: sleeps safe wait duration and retries same target."""
    job_id = uuid.uuid4()
    acc_id = uuid.uuid4()

    mock_job = AutoLeaveJob(
        id=job_id,
        account_ids=[str(acc_id)],
        leave_type="groups",
        skip_creator=True,
        delay_per_chat=1,
        delay_randomized=False,
        status="pending",
    )

    mock_acc = TelegramAccount(
        id=acc_id,
        phone="+628111222333",
        session_string="encrypted_session",
    )

    grp1 = MagicMock()
    grp1.is_group = True
    grp1.is_channel = False
    grp1.name = "Target Group 1"
    grp1.id = 123456
    grp1.input_entity = MagicMock()
    grp1.entity = MagicMock(creator=False, username="group1")

    async def mock_iter():
        yield grp1

    call_count = 0
    async def mock_delete_dialog(entity):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            raise telethon.errors.FloodWaitError(request=None, capture=15)
        return True

    mock_client = MagicMock()
    mock_client.iter_dialogs = mock_iter
    mock_client.delete_dialog = AsyncMock(side_effect=mock_delete_dialog)

    mock_db = AsyncMock()
    mock_res_job = MagicMock()
    mock_res_job.scalar_one_or_none.return_value = mock_job
    mock_res_acc = MagicMock()
    mock_res_acc.scalar_one_or_none.return_value = mock_acc
    mock_db.execute.side_effect = [mock_res_job, mock_res_acc]

    sleeps_called = []
    async def fake_interruptible_sleep(j_id, sec):
        sleeps_called.append(sec)
        return True

    with patch("app.database.async_session_factory") as mock_session_factory, \
         patch("app.services.auto_leave_service.acquire_lease", AsyncMock(return_value=True)), \
         patch("app.services.auto_leave_service.release_lease", AsyncMock()), \
         patch("app.services.auto_leave_service.decrypt", return_value="decrypted"), \
         patch("app.services.auto_leave_service.client_pool.borrow", AsyncMock(return_value=mock_client)), \
         patch("app.services.auto_leave_service.client_pool.release", AsyncMock()), \
         patch("app.services.auto_leave_service.interruptible_sleep", fake_interruptible_sleep), \
         patch("app.services.auto_leave_service._get_job_status", AsyncMock(return_value="running")), \
         patch("app.services.auto_leave_service._set_status", AsyncMock()), \
         patch("app.services.auto_leave_service._save_log_and_counters", AsyncMock()) as mock_save, \
         patch("app.services.auto_leave_service._push", AsyncMock()), \
         patch("app.utils.redis_dispatcher.publish_job_completed", AsyncMock()):

        mock_session_factory.return_value.__aenter__.return_value = mock_db
        await auto_leave_service._execute_auto_leave_job(str(job_id))

    assert 17 in sleeps_called
    assert call_count == 2
    assert mock_save.call_count >= 1
    last_call_kwargs = mock_save.call_args[1]
    assert last_call_kwargs["success"] == 1
    assert last_call_kwargs["failed"] == 0


@pytest.mark.asyncio
async def test_execute_auto_leave_zero_dialogs():
    """Verify when no matching dialogs found, job completes cleanly with informational log."""
    job_id = uuid.uuid4()
    acc_id = uuid.uuid4()

    mock_job = AutoLeaveJob(
        id=job_id,
        account_ids=[str(acc_id)],
        leave_type="groups",
        skip_creator=True,
        delay_per_chat=1,
        delay_randomized=False,
        status="pending",
    )

    mock_acc = TelegramAccount(
        id=acc_id,
        phone="+628111222333",
        session_string="encrypted_session",
    )

    async def mock_iter_empty():
        if False:
            yield None

    mock_client = MagicMock()
    mock_client.iter_dialogs = mock_iter_empty

    mock_db = AsyncMock()
    mock_res_job = MagicMock()
    mock_res_job.scalar_one_or_none.return_value = mock_job
    mock_res_acc = MagicMock()
    mock_res_acc.scalar_one_or_none.return_value = mock_acc
    mock_db.execute.side_effect = [mock_res_job, mock_res_acc]

    with patch("app.database.async_session_factory") as mock_session_factory, \
         patch("app.services.auto_leave_service.acquire_lease", AsyncMock(return_value=True)), \
         patch("app.services.auto_leave_service.release_lease", AsyncMock()), \
         patch("app.services.auto_leave_service.decrypt", return_value="decrypted"), \
         patch("app.services.auto_leave_service.client_pool.borrow", AsyncMock(return_value=mock_client)), \
         patch("app.services.auto_leave_service.client_pool.release", AsyncMock()), \
         patch("app.services.auto_leave_service._get_job_status", AsyncMock(return_value="running")), \
         patch("app.services.auto_leave_service._set_status", AsyncMock()) as mock_set_status, \
         patch("app.services.auto_leave_service._save_log_and_counters", AsyncMock()) as mock_save, \
         patch("app.services.auto_leave_service._push", AsyncMock()), \
         patch("app.utils.redis_dispatcher.publish_job_completed", AsyncMock()):

        mock_session_factory.return_value.__aenter__.return_value = mock_db
        await auto_leave_service._execute_auto_leave_job(str(job_id))

    assert mock_set_status.call_args_list[-1][0][1] == "completed"
    assert mock_save.call_count == 1
    log_arg = mock_save.call_args[0][1]
    assert log_arg.status == "skipped"
    assert "Tidak ditemukan grup" in log_arg.error_message


@pytest.mark.asyncio
async def test_execute_auto_leave_fatal_session():
    """Verify that fatal session revocation aborts immediately without infinite retries."""
    job_id = uuid.uuid4()
    acc_id = uuid.uuid4()

    mock_job = AutoLeaveJob(
        id=job_id,
        account_ids=[str(acc_id)],
        leave_type="groups",
        skip_creator=True,
        delay_per_chat=1,
        delay_randomized=False,
        status="pending",
    )

    mock_acc = TelegramAccount(
        id=acc_id,
        phone="+628111222333",
        session_string="encrypted_session",
        is_active=True,
    )

    grp1 = MagicMock()
    grp1.is_group = True
    grp1.is_channel = False
    grp1.name = "Target Group 1"
    grp1.id = 123456
    grp1.input_entity = MagicMock()
    grp1.entity = MagicMock(creator=False, username="group1")

    async def mock_iter():
        yield grp1

    mock_client = MagicMock()
    mock_client.iter_dialogs = mock_iter
    mock_client.delete_dialog = AsyncMock(side_effect=telethon.errors.AuthKeyUnregisteredError(request=None))

    mock_db = AsyncMock()
    mock_res_job = MagicMock()
    mock_res_job.scalar_one_or_none.return_value = mock_job
    mock_res_acc = MagicMock()
    mock_res_acc.scalar_one_or_none.return_value = mock_acc
    mock_db.execute.side_effect = [mock_res_job, mock_res_acc]
    mock_db.get.return_value = mock_acc

    with patch("app.database.async_session_factory") as mock_session_factory, \
         patch("app.services.auto_leave_service.acquire_lease", AsyncMock(return_value=True)), \
         patch("app.services.auto_leave_service.release_lease", AsyncMock()), \
         patch("app.services.auto_leave_service.decrypt", return_value="decrypted"), \
         patch("app.services.auto_leave_service.client_pool.borrow", AsyncMock(return_value=mock_client)), \
         patch("app.services.auto_leave_service.client_pool.release", AsyncMock()), \
         patch("app.services.auto_leave_service.client_pool.remove", AsyncMock()) as mock_remove, \
         patch("app.services.auto_leave_service._get_job_status", AsyncMock(return_value="running")), \
         patch("app.services.auto_leave_service._set_status", AsyncMock()) as mock_set_status, \
         patch("app.services.auto_leave_service._save_log_and_counters", AsyncMock()) as mock_save, \
         patch("app.services.auto_leave_service._push", AsyncMock()), \
         patch("app.utils.redis_dispatcher.publish_job_completed", AsyncMock()):

        mock_session_factory.return_value.__aenter__.return_value = mock_db
        await auto_leave_service._execute_auto_leave_job(str(job_id))

    assert mock_set_status.call_args_list[-1][0][1] == "failed"
    assert mock_remove.call_count == 1
    assert mock_save.call_count == 1
    last_call_kwargs = mock_save.call_args[1]
    assert last_call_kwargs["failed"] == 1
    assert mock_acc.is_active is False
