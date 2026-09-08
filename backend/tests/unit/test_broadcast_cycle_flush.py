"""Unit tests for per-cycle broadcast log buffering, batch flushing, and graceful restart/exit (Option 2: 1 Row Per Cycle)."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4
from datetime import datetime, timezone

from app.models.broadcast_log import BroadcastLog
from app.models.broadcast_job import BroadcastJob
from app.services.broadcast_service import _flush_cycle_logs


@pytest.mark.asyncio
async def test_flush_cycle_logs_creates_single_cycle_row():
    """Verify that _flush_cycle_logs creates 1 BroadcastLog row with JSONB details and updates job counters."""
    job_uuid = uuid4()
    mock_db = AsyncMock()
    mock_db.add = MagicMock()
    mock_job = MagicMock(spec=BroadcastJob)
    mock_job.sent_count = 0
    mock_job.fail_count = 0
    mock_job.progress = 0

    # First query for BroadcastJob returns mock_job
    job_result = MagicMock()
    job_result.scalar_one_or_none.return_value = mock_job

    # Second query for existing BroadcastLog returns None (fresh cycle)
    log_result = MagicMock()
    log_result.scalar_one_or_none.return_value = None

    mock_db.execute.side_effect = [job_result, log_result]

    # Mock async_session_factory context manager
    mock_factory = MagicMock()
    mock_factory.return_value.__aenter__.return_value = mock_db
    mock_factory.return_value.__aexit__.return_value = None

    details = [
        {
            "group_identifier": f"@group_{i}",
            "group_id": -100100 + i,
            "account_id_used": "acc-1",
            "account_name": "Account 1",
            "status": "success" if i < 4 else "error",
            "error_type": None if i < 4 else "banned",
            "error_message": None if i < 4 else "User was banned",
            "sent_text": "Hello",
            "duration_ms": 150,
            "sent_at": datetime.now(timezone.utc).isoformat(),
        }
        for i in range(5)
    ]

    with patch("app.database.async_session_factory", mock_factory):
        await _flush_cycle_logs(
            job_uuid=job_uuid,
            cycle_number=1,
            details=details,
            total_groups=5,
            sent=4,
            failed=1,
            progress=100,
            duration_ms=1200,
        )

    # Exactly 1 BroadcastLog added via db.add (Option 2: 1 row per cycle)
    mock_db.add.assert_called_once()
    added_log: BroadcastLog = mock_db.add.call_args[0][0]
    assert isinstance(added_log, BroadcastLog)
    assert added_log.job_id == job_uuid
    assert added_log.cycle_number == 1
    assert added_log.total_groups == 5
    assert added_log.sent_count == 4
    assert added_log.fail_count == 1
    assert added_log.duration_ms == 1200
    assert len(added_log.details) == 5
    assert added_log.details[0]["group_identifier"] == "@group_0"
    assert added_log.details[4]["error_type"] == "banned"

    # Job counters updated in the same commit
    assert mock_job.sent_count == 4
    assert mock_job.fail_count == 1
    assert mock_job.progress == 100

    # Single commit
    mock_db.commit.assert_awaited_once()

    # In-memory buffer cleared to prevent duplicate writes
    assert len(details) == 0


@pytest.mark.asyncio
async def test_flush_cycle_logs_appends_to_existing_cycle():
    """Verify that _flush_cycle_logs appends to an existing cycle row on incremental flushes."""
    job_uuid = uuid4()
    mock_db = AsyncMock()

    existing_log = BroadcastLog(
        job_id=job_uuid,
        cycle_number=2,
        total_groups=10,
        sent_count=2,
        fail_count=0,
        details=[{"group_identifier": "@g1", "status": "success"}],
    )

    log_result = MagicMock()
    log_result.scalar_one_or_none.return_value = existing_log
    mock_db.execute.return_value = log_result

    mock_factory = MagicMock()
    mock_factory.return_value.__aenter__.return_value = mock_db
    mock_factory.return_value.__aexit__.return_value = None

    new_details = [
        {"group_identifier": "@g2", "status": "error", "error_type": "admin_only"},
    ]

    with patch("app.database.async_session_factory", mock_factory):
        await _flush_cycle_logs(
            job_uuid=job_uuid,
            cycle_number=2,
            details=new_details,
            total_groups=10,
        )

    # Should NOT add a new row, but update existing_log.details
    mock_db.add.assert_not_called()
    assert len(existing_log.details) == 2
    assert existing_log.details[1]["group_identifier"] == "@g2"
    assert existing_log.sent_count == 1
    assert existing_log.fail_count == 1
    mock_db.commit.assert_awaited_once()
    assert len(new_details) == 0


@pytest.mark.asyncio
async def test_flush_cycle_logs_empty_list_no_db_ops():
    """Verify that calling _flush_cycle_logs with empty details and None counters does nothing."""
    mock_factory = MagicMock()
    with patch("app.database.async_session_factory", mock_factory):
        await _flush_cycle_logs(uuid4(), cycle_number=1, details=[])
        mock_factory.assert_not_called()
