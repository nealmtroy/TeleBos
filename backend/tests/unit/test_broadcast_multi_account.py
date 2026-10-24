"""Unit tests verifying that multi-account broadcast creates independent jobs per account."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4
from datetime import datetime, timezone, timedelta

from app.models.broadcast_job import BroadcastJob
from app.models.group_list import GroupList
from app.models.text_list import TextList
from app.models.user import User
from app.services.broadcast_service import start_broadcast


@pytest.mark.asyncio
async def test_start_broadcast_creates_separate_jobs_for_multiple_accounts():
    """Verify that when a user selects multiple accounts, start_broadcast creates
    a separate BroadcastJob for each account (each broadcasting independently to
    the full group list), enqueues each to Redis, and attaches related_job_ids.
    """
    added_jobs: list[BroadcastJob] = []

    mock_db = AsyncMock()
    mock_db.add = MagicMock()
    def mock_add(instance):
        if isinstance(instance, BroadcastJob):
            if not instance.id:
                instance.id = uuid4()
            added_jobs.append(instance)

    mock_db.add.side_effect = mock_add

    mock_user = MagicMock(spec=User)
    mock_user.id = uuid4()
    mock_user.role = "pro"  # pro allows up to 3 accounts
    mock_user.subscription_expires_at = datetime.now(timezone.utc) + timedelta(days=30)

    gl_uuid = uuid4()
    mock_gl = MagicMock(spec=GroupList)
    mock_gl.id = gl_uuid
    mock_gl.items = [
        {"value": "group1", "type": "username"},
        {"value": "group2", "type": "username"},
    ]

    tl_uuid = uuid4()
    mock_tl = MagicMock(spec=TextList)
    mock_tl.id = tl_uuid
    mock_tl.texts = ["Message 1", "Message 2"]

    acc1 = MagicMock()
    acc1.id = uuid4()
    acc1.is_active = True
    acc1.for_sale = False
    acc1.restriction_status = None
    acc1.spam_status = None

    acc2 = MagicMock()
    acc2.id = uuid4()
    acc2.is_active = True
    acc2.for_sale = False
    acc2.restriction_status = None
    acc2.spam_status = None

    acc3 = MagicMock()
    acc3.id = uuid4()
    acc3.is_active = True
    acc3.for_sale = False
    acc3.restriction_status = None
    acc3.spam_status = None

    account_map = {
        str(acc1.id): acc1,
        str(acc2.id): acc2,
        str(acc3.id): acc3,
    }

    async def mock_get_account(db, acc_id, user_id):
        return account_map.get(str(acc_id))

    async def mock_execute(query, *args, **kwargs):
        q = str(query)
        res = MagicMock()
        if "group_lists" in q:
            res.scalar_one_or_none.return_value = mock_gl
        elif "text_lists" in q:
            res.scalar_one_or_none.return_value = mock_tl
        else:
            res.scalar_one_or_none.return_value = None
        return res

    mock_db.execute.side_effect = mock_execute

    with patch("app.services.account_service.get_account", side_effect=mock_get_account), \
         patch("app.utils.account_ownership.find_busy_accounts", new=AsyncMock(return_value=[])), \
         patch("app.services.broadcast_entitlement.enforce_broadcast_allowance", new=AsyncMock()), \
         patch("app.services.redeem_service.is_subscription_active", return_value=True), \
         patch("app.services.broadcast_service._dispatch_broadcast", new=AsyncMock()) as mock_dispatch:

        primary_job = await start_broadcast(
            db=mock_db,
            user=mock_user,
            account_ids=[str(acc1.id), str(acc2.id), str(acc3.id)],
            group_list_id=str(gl_uuid),
            text_list_id=str(tl_uuid),
            mode="multi_random",
            custom_text=None,
            delay_per_group=5,
            delay_after_all=60,
        )

        # 1. Exactly 3 jobs were created and added to DB
        assert len(added_jobs) == 3

        # 2. Each job belongs to exactly 1 account
        assert added_jobs[0].account_ids == [str(acc1.id)]
        assert added_jobs[1].account_ids == [str(acc2.id)]
        assert added_jobs[2].account_ids == [str(acc3.id)]

        # 3. Each job targets the full list of groups (total_groups == 2)
        for job in added_jobs:
            assert job.total_groups == 2
            assert job.group_list_id == str(gl_uuid)
            assert job.text_list_id == str(tl_uuid)
            assert job.status == "running"

        # 4. Each job was dispatched to Redis worker
        assert mock_dispatch.call_count == 3

        # 5. Primary job returned is the first job with related_job_ids attached
        assert primary_job.id == added_jobs[0].id
        assert getattr(primary_job, "related_job_ids", None) == [j.id for j in added_jobs]


@pytest.mark.asyncio
async def test_start_broadcast_single_account():
    """Verify that single account broadcast creates exactly 1 job."""
    added_jobs: list[BroadcastJob] = []

    mock_db = AsyncMock()
    mock_db.add = MagicMock()
    def mock_add(instance):
        if isinstance(instance, BroadcastJob):
            if not instance.id:
                instance.id = uuid4()
            added_jobs.append(instance)

    mock_db.add.side_effect = mock_add

    mock_user = MagicMock(spec=User)
    mock_user.id = uuid4()
    mock_user.role = "basic"
    mock_user.subscription_expires_at = datetime.now(timezone.utc) + timedelta(days=30)

    gl_uuid = uuid4()
    mock_gl = MagicMock(spec=GroupList)
    mock_gl.id = gl_uuid
    mock_gl.items = [{"value": "group1", "type": "username"}]

    acc1 = MagicMock()
    acc1.id = uuid4()
    acc1.is_active = True
    acc1.for_sale = False
    acc1.restriction_status = None
    acc1.spam_status = None

    async def mock_execute(query, *args, **kwargs):
        res = MagicMock()
        res.scalar_one_or_none.return_value = mock_gl
        return res

    mock_db.execute.side_effect = mock_execute

    with patch("app.services.account_service.get_account", new=AsyncMock(return_value=acc1)), \
         patch("app.utils.account_ownership.find_busy_accounts", new=AsyncMock(return_value=[])), \
         patch("app.services.broadcast_entitlement.enforce_broadcast_allowance", new=AsyncMock()), \
         patch("app.services.redeem_service.is_subscription_active", return_value=True), \
         patch("app.services.broadcast_service._dispatch_broadcast", new=AsyncMock()) as mock_dispatch:

        job = await start_broadcast(
            db=mock_db,
            user=mock_user,
            account_ids=[str(acc1.id)],
            group_list_id=str(gl_uuid),
            text_list_id=None,
            mode="single_text",
            custom_text="Hello world",
            delay_per_group=5,
            delay_after_all=0,
        )

        assert len(added_jobs) == 1
        assert added_jobs[0].account_ids == [str(acc1.id)]
        assert mock_dispatch.call_count == 1
        assert job.id == added_jobs[0].id
        assert getattr(job, "related_job_ids", None) == [added_jobs[0].id]

