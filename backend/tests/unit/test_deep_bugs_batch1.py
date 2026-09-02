"""Unit tests validating Batch 1 bug fixes from deep_bug_logic_audit_report.md."""

import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from app.services.broadcast_worker import BroadcastWorkerManager
from app.services.smm_service import call_smm_api
from app.services.order_service import place_mass_orders
from app.models.user import User


@pytest.mark.asyncio
async def test_broadcast_worker_pause_logic():
    """Verify LOG-05: broadcast worker pause properly pauses active jobs."""
    worker = BroadcastWorkerManager()
    job_id = str(uuid4())

    # Simulate start
    worker._pause_events[job_id] = asyncio.Event()
    worker._pause_events[job_id].set()  # running state

    with patch.object(worker, "_update_job_status", new_callable=AsyncMock) as mock_update:
        # First pause should succeed
        paused = await worker.pause(job_id)
        assert paused is True
        assert not worker._pause_events[job_id].is_set()
        mock_update.assert_called_once_with(job_id, "paused")

        # Second pause on already-paused job should return False
        paused_again = await worker.pause(job_id)
        assert paused_again is False

        # Resume should succeed
        resumed = await worker.resume(job_id)
        assert resumed is True
        assert worker._pause_events[job_id].is_set()


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
