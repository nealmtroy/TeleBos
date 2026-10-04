"""Regression test for PYTHON-FASTAPI-1M.

An owner deleted a running broadcast job from the admin panel while the worker
task was still unwinding and holding buffered cycle details. The job row was
gone, so flushing the buffer into broadcast_logs hit the FK constraint
`broadcast_logs_job_id_fkey` (the column is ON DELETE CASCADE) and the whole
graceful-exit flush died.

Two guarantees are pinned here:

1. A flush for a job that no longer exists is a no-op, not an exception -- the
   job counters are not updated and no BroadcastLog row is inserted.
2. The job row is read FOR UPDATE so a concurrent DELETE cannot land between
   that read and the log INSERT, which would reintroduce the FK violation.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from app.models.broadcast_log import BroadcastLog
from app.services.broadcast_service import _flush_cycle_logs


def _make_db(job_row):
    """Mock session whose first SELECT (the job lookup) returns ``job_row``.

    The second SELECT (existing cycle-log lookup) is only reached when the job
    row exists, so it is wired to the same mock rather than left exhausted.
    """
    mock_db = AsyncMock()
    mock_db.add = MagicMock()

    job_result = MagicMock()
    job_result.scalar_one_or_none.return_value = job_row
    mock_db.execute.side_effect = [job_result, job_result]

    mock_factory = MagicMock()
    mock_factory.return_value.__aenter__.return_value = mock_db
    mock_factory.return_value.__aexit__.return_value = None
    return mock_db, mock_factory


@pytest.mark.asyncio
async def test_flush_skipped_when_job_row_is_gone():
    """Deleting a job mid-broadcast must not turn its log flush into an error."""
    job_uuid = uuid4()
    mock_db, mock_factory = _make_db(job_row=None)

    details = [
        {"group_identifier": f"@group_{i}", "status": "success"} for i in range(3)
    ]

    with patch("app.database.async_session_factory", mock_factory):
        # Must not raise -- this is the exact call that produced the Sentry event.
        await _flush_cycle_logs(
            job_uuid=job_uuid,
            cycle_number=73,
            details=details,
            total_groups=112,
            sent=0,
            failed=16,
            progress=3,
        )

    # No orphaned log row inserted against a job that no longer exists.
    mock_db.add.assert_not_called()
    mock_db.commit.assert_not_awaited()

    # The job lookup is the only query -- we bail before the log lookup.
    assert mock_db.execute.await_count == 1

    # The in-memory buffer is still drained so the caller does not retry forever.
    assert len(details) == 0


@pytest.mark.asyncio
async def test_flush_locks_job_row_before_writing_log():
    """The job row is read FOR UPDATE so a concurrent DELETE cannot interleave."""
    job_uuid = uuid4()
    mock_db, mock_factory = _make_db(job_row=MagicMock())

    details = [{"group_identifier": "@g1", "status": "success"}]

    with patch("app.database.async_session_factory", mock_factory):
        await _flush_cycle_logs(job_uuid=job_uuid, cycle_number=1, details=details)

    # FOR UPDATE is what closes the read-then-insert race against ON DELETE CASCADE.
    statement = mock_db.execute.await_args_list[0].args[0]
    assert statement._for_update_arg is not None