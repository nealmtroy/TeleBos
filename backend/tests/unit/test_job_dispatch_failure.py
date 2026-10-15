"""A job must fail cleanly when the worker dispatch (Redis enqueue) fails.

The job row is committed as "running" before dispatch; a dropped enqueue would
otherwise leave it hung forever and keep its accounts marked busy.
"""

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services import broadcast_service as bs
from app.services import invite_service as inv


@pytest.mark.asyncio
async def test_dispatch_broadcast_marks_failed_on_enqueue_failure():
    job = MagicMock()
    job.id = uuid.uuid4()
    job.account_ids = ["acc-1"]
    db = AsyncMock()

    with patch("app.utils.redis_dispatcher.enqueue_job", AsyncMock(return_value=False)):
        with pytest.raises(ValueError):
            await bs._dispatch_broadcast(db, job)

    assert job.status == "failed"
    db.commit.assert_awaited()


@pytest.mark.asyncio
async def test_dispatch_broadcast_succeeds_when_enqueued():
    job = MagicMock()
    job.id = uuid.uuid4()
    job.account_ids = ["acc-1"]
    db = AsyncMock()

    with patch("app.utils.redis_dispatcher.enqueue_job", AsyncMock(return_value=True)):
        await bs._dispatch_broadcast(db, job)

    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_dispatch_invite_marks_failed_on_enqueue_failure():
    job = MagicMock()
    job.id = uuid.uuid4()
    job.account_ids = ["acc-1"]
    db = AsyncMock()

    with patch("app.utils.redis_dispatcher.enqueue_job", AsyncMock(return_value=False)):
        with pytest.raises(ValueError):
            await inv._dispatch_invite(db, job)

    assert job.status == "failed"
    db.commit.assert_awaited()
