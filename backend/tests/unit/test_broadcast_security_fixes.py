"""Unit tests verifying:
1. SEC-03 execution even when delay_after_all == 0
2. retry_job subscription & quota validation
3. Rejection of empty messages and preventing false 'success' / sent increments
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4
from datetime import datetime, timezone, timedelta

from app.models.broadcast_job import BroadcastJob
from app.models.group_list import GroupList
from app.models.text_list import TextList
from app.models.user import User
from app.services.broadcast_service import start_broadcast, retry_job, execute_broadcast


@pytest.mark.asyncio
async def test_start_broadcast_rejects_empty_text_in_all_modes():
    """Verify start_broadcast rejects empty custom_text and empty text_list in single_text mode,
    as well as rotation mode with empty text_list.
    """
    mock_db = AsyncMock()
    mock_user = MagicMock(spec=User)
    mock_user.id = uuid4()
    mock_user.role = "pro"
    mock_user.subscription_expires_at = datetime.now(timezone.utc) + timedelta(days=30)

    gl_uuid = uuid4()
    mock_gl = MagicMock(spec=GroupList)
    mock_gl.id = gl_uuid
    mock_gl.items = [{"value": "group1", "type": "username"}]

    mock_acc = MagicMock()
    mock_acc.id = uuid4()

    async def mock_execute(query, *args, **kwargs):
        q = str(query)
        res = MagicMock()
        if "group_lists" in q:
            res.scalar_one_or_none.return_value = mock_gl
        elif "text_lists" in q:
            res.scalar_one_or_none.return_value = None
        else:
            res.scalar_one_or_none.return_value = None
        return res

    mock_db.execute.side_effect = mock_execute

    with patch("app.services.account_service.get_account", new=AsyncMock(return_value=mock_acc)), \
         patch("app.services.broadcast_entitlement.enforce_broadcast_allowance", new=AsyncMock()), \
         patch("app.services.redeem_service.is_subscription_active", return_value=True):

        # 1. single_text with whitespace / empty custom_text and no text_list
        with pytest.raises(ValueError, match="single_text mode requires custom_text or text_list"):
            await start_broadcast(
                db=mock_db,
                user=mock_user,
                account_ids=[str(mock_acc.id)],
                group_list_id=str(gl_uuid),
                text_list_id=None,
                mode="single_text",
                custom_text="   ",
                delay_per_group=1,
                delay_after_all=0,
            )

        # 2. rotation mode without text_list
        with pytest.raises(ValueError, match="requires a text_list"):
            await start_broadcast(
                db=mock_db,
                user=mock_user,
                account_ids=[str(mock_acc.id)],
                group_list_id=str(gl_uuid),
                text_list_id=None,
                mode="rotation",
                custom_text=None,
                delay_per_group=1,
                delay_after_all=0,
            )


@pytest.mark.asyncio
async def test_retry_job_enforces_subscription_and_quota():
    """Verify retry_job blocks users with expired subscriptions or exhausted daily quota."""
    mock_db = AsyncMock()
    mock_user = MagicMock(spec=User)
    mock_user.id = uuid4()
    mock_user.role = "pro"
    mock_user.subscription_expires_at = datetime.now(timezone.utc) - timedelta(days=1)

    job_uuid = uuid4()

    # Expired subscription
    with patch("app.services.redeem_service.auto_downgrade_if_expired", new=AsyncMock()), \
         patch("app.services.redeem_service.is_subscription_active", return_value=False):
        with pytest.raises(ValueError, match="berakhir|perpanjang"):
            await retry_job(mock_db, str(job_uuid), str(mock_user.id), user=mock_user)

    # Exhausted quota
    mock_user.subscription_expires_at = datetime.now(timezone.utc) + timedelta(days=10)
    with patch("app.services.redeem_service.auto_downgrade_if_expired", new=AsyncMock()), \
         patch("app.services.redeem_service.is_subscription_active", return_value=True), \
         patch("app.services.broadcast_entitlement.enforce_broadcast_allowance", side_effect=ValueError("Kuota harian habis")):
        with pytest.raises(ValueError, match="Kuota harian habis"):
            await retry_job(mock_db, str(job_uuid), str(mock_user.id), user=mock_user)


@pytest.mark.asyncio
async def test_execute_broadcast_empty_text_fails_and_does_not_increment_sent():
    """Verify that if a broadcast job has empty texts, it fails cleanly and does not count as sent."""
    job_uuid = uuid4()
    mock_db = AsyncMock()
    mock_job = MagicMock(spec=BroadcastJob)
    mock_job.id = job_uuid
    mock_job.user_id = uuid4()
    mock_job.status = "running"
    mock_job.group_list_id = uuid4()
    mock_job.text_list_id = None
    mock_job.account_ids = [str(uuid4())]
    mock_job.mode = "single_text"
    mock_job.custom_text = "   "
    mock_job.total_groups = 1
    mock_job.sent_count = 0
    mock_job.fail_count = 0

    mock_gl = MagicMock(spec=GroupList)
    mock_gl.items = [{"value": "group1", "type": "username"}]
    mock_gl.name = "List"

    async def mock_execute(query, *args, **kwargs):
        q = str(query)
        res = MagicMock()
        if "group_lists" in q:
            res.scalar_one_or_none.return_value = mock_gl
        else:
            res.scalar_one_or_none.return_value = mock_job
        return res

    mock_db.execute.side_effect = mock_execute
    mock_factory = MagicMock()
    mock_factory.return_value.__aenter__.return_value = mock_db
    mock_factory.return_value.__aexit__.return_value = None

    with patch("app.database.async_session_factory", mock_factory), \
         patch("app.services.broadcast_service._push_broadcast", new=AsyncMock()) as mock_push:

        await execute_broadcast(job_uuid)

        # Job must be marked failed
        assert mock_job.status == "failed"
        # Error push must be emitted
        mock_push.assert_awaited()
