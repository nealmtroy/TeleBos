"""Unit tests validating Fase 2 batch estimation and index configurations."""

import datetime
import pytest
from unittest.mock import AsyncMock, MagicMock
from sqlalchemy import Index

from app.models.broadcast_job import BroadcastJob
from app.models.invite_log import InviteLog
from app.models.order import Order
from app.models.telegram_registration_datapoint import TelegramRegistrationDatapoint
from app.services.telegram_reg_date_service import reg_date_service


def test_order_indexes_configured():
    """Verify that Order model declares required indexes."""
    index_names = [arg.name for arg in Order.__table_args__ if isinstance(arg, Index)]
    assert "ix_orders_user_id_status" in index_names
    assert Order.smm_order_id.index is True
    assert Order.status.index is True


def test_broadcast_job_indexes_configured():
    """Verify that BroadcastJob model declares required indexes."""
    index_names = [arg.name for arg in BroadcastJob.__table_args__ if isinstance(arg, Index)]
    assert "ix_broadcast_jobs_user_id_status" in index_names
    assert BroadcastJob.status.index is True


def test_invite_log_indexes_configured():
    """Verify that InviteLog model declares ix_invite_logs_job_user."""
    index_names = [arg.name for arg in InviteLog.__table_args__ if isinstance(arg, Index)]
    assert "ix_invite_logs_job_user" in index_names


@pytest.mark.asyncio
async def test_estimate_registration_dates_batch():
    """Verify batch estimation resolves exact, older, newer, and approx dates in 1 call."""
    db = AsyncMock()

    dp1 = TelegramRegistrationDatapoint(
        telegram_id=1000,
        registered_at=datetime.datetime(2020, 1, 1, 0, 0, 0, tzinfo=datetime.timezone.utc),
        source="seeded",
    )
    dp2 = TelegramRegistrationDatapoint(
        telegram_id=2000,
        registered_at=datetime.datetime(2020, 1, 3, 0, 0, 0, tzinfo=datetime.timezone.utc),
        source="seeded",
    )

    mock_res = MagicMock()
    mock_res.scalars.return_value.all.return_value = [dp1, dp2]
    db.execute.return_value = mock_res

    # Test batch with:
    # 500  -> older_than dp1
    # 1000 -> exact dp1
    # 1500 -> approx midway between dp1 and dp2 (2020-01-02)
    # 2000 -> exact dp2
    # 3000 -> newer_than dp2
    results = await reg_date_service.estimate_registration_dates_batch(
        db, [500, 1000, 1500, 2000, 3000]
    )

    assert len(results) == 5

    # 1. Below min
    assert results[500]["status"] == "older_than"
    assert results[500]["date"] == dp1.registered_at

    # 2. Exact match 1
    assert results[1000]["status"] == "exact"
    assert results[1000]["date"] == dp1.registered_at

    # 3. Midway approx
    assert results[1500]["status"] == "approx"
    assert results[1500]["date"] == datetime.datetime(2020, 1, 2, 0, 0, 0, tzinfo=datetime.timezone.utc)

    # 4. Exact match 2
    assert results[2000]["status"] == "exact"
    assert results[2000]["date"] == dp2.registered_at

    # 5. Above max
    assert results[3000]["status"] == "newer_than"
    assert results[3000]["date"] == dp2.registered_at
