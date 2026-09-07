"""Unit tests validating Batch 1 bug fixes from deep_bug_logic_audit_report.md."""

import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from app.models.enums import JobStatus
from app.services import broadcast_service
from app.services.smm_service import call_smm_api
from app.services.order_service import place_mass_orders
from app.models.user import User
from types import SimpleNamespace


@pytest.mark.asyncio
async def test_broadcast_service_update_job_status():
    """Verify LOG-05: broadcast_service properly updates status and records completion timestamp."""
    db = AsyncMock()
    job = SimpleNamespace(id=uuid4(), status=JobStatus.RUNNING, completed_at=None)

    with patch("app.services.broadcast_service._wake_job") as mock_wake:
        await broadcast_service.update_job_status(db, job, JobStatus.PAUSED)
        assert job.status == JobStatus.PAUSED
        assert job.completed_at is None
        mock_wake.assert_called_once_with(str(job.id))
        db.flush.assert_awaited_once()

    with patch("app.services.broadcast_service._wake_job"):
        await broadcast_service.update_job_status(db, job, JobStatus.COMPLETED)
        assert job.status == JobStatus.COMPLETED
        assert job.completed_at is not None


@pytest.mark.asyncio
async def test_smm_api_catches_json_decode_error():
    """Verify EDG-01: call_smm_api safely handles HTML 502/504 error responses."""
    with patch("httpx.AsyncClient.post") as mock_post:
        mock_resp = MagicMock()
        mock_resp.raise_for_status.return_value = None
        mock_resp.json.side_effect = ValueError("Invalid JSON (e.g. 502 Bad Gateway HTML)")
        mock_post.return_value = mock_resp

        result = await call_smm_api("services2")
        assert result["status"] is False
        assert "API request failed" in result["data"]["msg"]


@pytest.mark.asyncio
async def test_mass_order_quantity_validation():
    """Verify EDG-02: place_mass_orders rejects quantities below min_qty or <= 0."""
    db = AsyncMock()
    user = User(id=uuid4(), balance=100000)

    # Mock effective price returning min_qty = 10, max_qty = 1000
    with patch("app.services.order_service._get_effective_price") as mock_price:
        mock_price.return_value = (10, "Telegram Views", "Views", 10, 1000, 0, 0)

        # 1. Test quantity <= 0
        with pytest.raises(ValueError, match="Quantity must be greater than 0"):
            await place_mass_orders(db, user, [{"service_id": 1, "quantity": 0, "data_target": "https://t.me/post"}])

        # 2. Test quantity < min_qty
        with pytest.raises(ValueError, match="below minimum"):
            await place_mass_orders(db, user, [{"service_id": 1, "quantity": 5, "data_target": "https://t.me/post"}])

        # 3. Test quantity > max_qty
        with pytest.raises(ValueError, match="exceeds maximum"):
            await place_mass_orders(db, user, [{"service_id": 1, "quantity": 5000, "data_target": "https://t.me/post"}])


@pytest.mark.asyncio
async def test_start_broadcast_task_and_startup_resume():
    """Verify broadcast task lifecycle: start_broadcast_task and startup auto-resume."""
    job_id = uuid4()
    job_id_str = str(job_id)

    with patch("app.services.broadcast_service.execute_broadcast", new_callable=AsyncMock) as mock_exec:
        # 1. Spawning a new task
        spawned = broadcast_service.start_broadcast_task(job_id)
        assert spawned is True
        assert job_id_str in broadcast_service._running_tasks

        # 2. Re-spawning while running should return False (no duplicate task)
        spawned_again = broadcast_service.start_broadcast_task(job_id)
        assert spawned_again is False

        # Clean up task
        task = broadcast_service._running_tasks.pop(job_id_str, None)
        if task:
            task.cancel()

        # 3. Test resume_running_broadcasts_on_startup
        db = AsyncMock()
        mock_job = SimpleNamespace(id=job_id, status="running")
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [mock_job]
        db.execute.return_value = mock_result

        resumed_count = await broadcast_service.resume_running_broadcasts_on_startup(db)
        assert resumed_count == 1
        assert job_id_str in broadcast_service._running_tasks

        # Clean up
        task = broadcast_service._running_tasks.pop(job_id_str, None)
        if task:
            task.cancel()
