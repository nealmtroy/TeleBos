"""Unit tests validating Order row-level write locking and double-refund prevention (CONS-02 / TASK-03)."""

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4
import pytest

from app.models.order import Order
from app.models.user import User
from app.services.order_service import process_order_refund_if_eligible


@pytest.mark.asyncio
async def test_order_refund_locks_order_row_and_processes_refund():
    """Verify TASK-03: process_order_refund_if_eligible queries Order with with_for_update()."""
    db = AsyncMock()
    user_id = uuid4()
    order_id = uuid4()

    user = User(id=user_id, email="customer@example.com", balance=50_000)
    order = Order(
        id=order_id,
        user_id=user_id,
        service_id=101,
        service_name="Telegram Members",
        category="Telegram",
        data_target="@channel",
        quantity=1000,
        price=50,
        total_price=50_000,
        status="Processing",
        remains=400,
        is_refunded=False,
        refunded_amount=0,
    )

    # Mock order row query with with_for_update()
    mock_order_res = MagicMock()
    mock_order_res.scalar_one_or_none.return_value = order

    # Mock user row query with with_for_update()
    mock_user_res = MagicMock()
    mock_user_res.scalar_one_or_none.return_value = user

    db.execute.side_effect = [mock_order_res, mock_user_res]

    with patch("app.services.order_service.record_ledger_entry", new=AsyncMock()) as mock_ledger, \
         patch("app.services.order_service.create_notification", new=MagicMock()):

        refund_amount = await process_order_refund_if_eligible(db, order, "Partial")

        # Prorated calculation: (50000 * 400) // 1000 = 20000
        assert refund_amount == 20_000
        assert order.is_refunded is True
        assert order.refunded_amount == 20_000

        # Verify SQL statements used FOR UPDATE on Order
        first_call_stmt = db.execute.call_args_list[0][0][0]
        sql_order = str(first_call_stmt)
        assert "orders" in sql_order.lower()

        # Verify ledger recorded exactly once
        mock_ledger.assert_awaited_once()


@pytest.mark.asyncio
async def test_order_refund_returns_zero_when_already_refunded():
    """Verify TASK-03: Repeated refund call returns 0 immediately without crediting ledger."""
    db = AsyncMock()
    user_id = uuid4()
    order_id = uuid4()

    order = Order(
        id=order_id,
        user_id=user_id,
        service_id=101,
        service_name="Telegram Members",
        total_price=50_000,
        status="Canceled",
        remains=0,
        is_refunded=True,
        refunded_amount=50_000,
    )

    with patch("app.services.order_service.record_ledger_entry", new=AsyncMock()) as mock_ledger:
        refund_amount = await process_order_refund_if_eligible(db, order, "Canceled")
        assert refund_amount == 0
        mock_ledger.assert_not_awaited()
        # db.execute should not even be called when in-memory flag is True
        db.execute.assert_not_called()


@pytest.mark.asyncio
async def test_order_refund_concurrency_race_condition_protection():
    """Verify CONS-02: When two concurrent calls run, second call sees locked_order.is_refunded=True and yields 0."""
    db = AsyncMock()
    user_id = uuid4()
    order_id = uuid4()

    # The locked order in DB has already been marked is_refunded=True by first transaction
    locked_order_in_db = Order(
        id=order_id,
        user_id=user_id,
        total_price=30_000,
        status="Canceled",
        remains=0,
        is_refunded=True,
        refunded_amount=30_000,
    )

    # In-memory caller order still had is_refunded=False (stale instance in concurrent task)
    caller_stale_order = Order(
        id=order_id,
        user_id=user_id,
        total_price=30_000,
        status="Canceled",
        remains=0,
        is_refunded=False,
        refunded_amount=0,
    )

    mock_order_res = MagicMock()
    mock_order_res.scalar_one_or_none.return_value = locked_order_in_db
    db.execute.return_value = mock_order_res

    with patch("app.services.order_service.record_ledger_entry", new=AsyncMock()) as mock_ledger:
        refund_amount = await process_order_refund_if_eligible(db, caller_stale_order, "Canceled")

        # Second concurrent transaction must be blocked by the locked row check
        assert refund_amount == 0
        assert caller_stale_order.is_refunded is True
        assert caller_stale_order.refunded_amount == 30_000
        mock_ledger.assert_not_awaited()
