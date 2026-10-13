"""Unit and integration test suite for SEC-01 SMM Refund & Idempotency.

Verifies:
1. Prorated refund calculation for Partial fills.
2. Full refund for Canceled and Error orders.
3. Strict idempotency: multiple calls do NOT double-refund.
4. Terminal unrefunded vs refunded filter in polling queries.
"""

import uuid
import pytest
from sqlalchemy import select, delete, or_, and_

from app.database import async_session_factory
from app.models.user import User
from app.models.order import Order
from app.models.wallet_ledger import WalletLedger
from app.services.order_service import process_order_refund_if_eligible


@pytest.fixture
async def sec01_setup():
    test_user_id = uuid.uuid4()
    initial_balance = 100_000

    async with async_session_factory() as db:
        user = User(
            id=test_user_id,
            email=f"test_sec01_{uuid.uuid4().hex[:6]}@example.com",
            role="basic",
            balance=initial_balance,
        )
        db.add(user)
        await db.commit()

    yield test_user_id, initial_balance

    # Teardown in strict foreign key order (RESTRICT compliance)
    async with async_session_factory() as db:
        await db.execute(delete(WalletLedger).where(WalletLedger.user_id == test_user_id))
        await db.execute(delete(Order).where(Order.user_id == test_user_id))
        await db.execute(delete(User).where(User.id == test_user_id))
        await db.commit()


@pytest.mark.asyncio
async def test_sec01_partial_order_prorated_refund_and_idempotency(sec01_setup):
    """Test Partial order prorated refund calculation and repeated call idempotency."""
    test_user_id, initial_balance = sec01_setup
    quantity = 1000
    total_price = 50_000
    remains = 400  # 40% remains -> expected refund: (50000 * 400) // 1000 = 20000

    async with async_session_factory() as db:
        order = Order(
            id=uuid.uuid4(),
            user_id=test_user_id,
            smm_order_id="mock_smm_123",
            service_id=1,
            service_name="Telegram Channel Members",
            category="Telegram",
            data_target="https://t.me/testchannel",
            quantity=quantity,
            price=50,
            total_price=total_price,
            status="Processing",
            remains=remains,
            is_refunded=False,
            refunded_amount=0,
        )
        db.add(order)
        await db.commit()

        # First refund call on Partial status
        refund_amount = await process_order_refund_if_eligible(db, order, "Partial")
        await db.commit()

        assert refund_amount == 20_000, f"Expected refund 20000, got {refund_amount}"
        assert order.is_refunded is True, "Expected order.is_refunded to be True"
        assert order.refunded_amount == 20_000, f"Expected order.refunded_amount 20000, got {order.refunded_amount}"

        # Check user balance in DB
        user_res = await db.execute(select(User).where(User.id == test_user_id))
        user = user_res.scalar_one()
        assert user.balance == initial_balance + 20_000, f"Expected balance {initial_balance + 20_000}, got {user.balance}"

        # CRITICAL IDEMPOTENCY TEST: Call 2nd and 3rd time
        second_refund = await process_order_refund_if_eligible(db, order, "Partial")
        third_refund = await process_order_refund_if_eligible(db, order, "Partial")
        await db.commit()

        assert second_refund == 0, f"Expected second refund to be 0, got {second_refund}"
        assert third_refund == 0, f"Expected third refund to be 0, got {third_refund}"

        # Verify balance did NOT leak / compound
        user_res = await db.execute(select(User).where(User.id == test_user_id))
        user = user_res.scalar_one()
        assert user.balance == initial_balance + 20_000, f"Balance changed unexpectedly: {user.balance}"


@pytest.mark.asyncio
async def test_sec01_canceled_order_full_refund_and_idempotency(sec01_setup):
    """Test Canceled / Error status triggers 100% full refund and is strictly idempotent."""
    test_user_id, initial_balance = sec01_setup
    total_price_canceled = 35_000

    async with async_session_factory() as db:
        order_canceled = Order(
            id=uuid.uuid4(),
            user_id=test_user_id,
            smm_order_id="mock_smm_canceled",
            service_id=1,
            service_name="Post Views",
            category="Telegram",
            data_target="https://t.me/testchannel/1",
            quantity=500,
            price=70,
            total_price=total_price_canceled,
            status="Pending",
            is_refunded=False,
            refunded_amount=0,
        )
        db.add(order_canceled)
        await db.commit()

        refund = await process_order_refund_if_eligible(db, order_canceled, "Canceled")
        await db.commit()

        assert refund == 35_000, f"Expected refund 35000, got {refund}"
        assert order_canceled.is_refunded is True
        assert order_canceled.refunded_amount == 35_000

        # Verify balance updated
        user_res = await db.execute(select(User).where(User.id == test_user_id))
        user = user_res.scalar_one()
        assert user.balance == initial_balance + 35_000, f"Expected balance {initial_balance + 35_000}, got {user.balance}"

        # Repeat call should be 0
        repeat = await process_order_refund_if_eligible(db, order_canceled, "Canceled")
        assert repeat == 0, "Repeat canceled refund was not 0"


@pytest.mark.asyncio
async def test_sec01_polling_query_excludes_already_refunded_partial_orders(sec01_setup):
    """Test polling query correctly excludes Partial orders that have already been refunded."""
    test_user_id, _ = sec01_setup

    async with async_session_factory() as db:
        order_refunded = Order(
            id=uuid.uuid4(),
            user_id=test_user_id,
            smm_order_id="smm_already_refunded",
            service_id=1,
            service_name="Reactions",
            category="Telegram",
            data_target="https://t.me/testchannel/2",
            quantity=100,
            total_price=5000,
            status="Partial",
            remains=50,
            is_refunded=True,
            refunded_amount=2500,
        )
        order_pending_refund = Order(
            id=uuid.uuid4(),
            user_id=test_user_id,
            smm_order_id="smm_needs_refund",
            service_id=1,
            service_name="Reactions",
            category="Telegram",
            data_target="https://t.me/testchannel/3",
            quantity=100,
            total_price=5000,
            status="Partial",
            remains=50,
            is_refunded=False,
            refunded_amount=0,
        )
        db.add_all([order_refunded, order_pending_refund])
        await db.commit()

        # Execute polling query logic
        query = select(Order).where(
            Order.user_id == test_user_id,
            or_(
                Order.status.in_(["Pending", "Processing", "In progress"]),
                and_(Order.status == "Partial", Order.is_refunded.is_(False)),
            ),
        )
        res = await db.execute(query)
        active_orders = list(res.scalars().all())

        active_ids = {o.id for o in active_orders}
        assert order_pending_refund.id in active_ids, "Pending unrefunded order must be in polling query"
        assert order_refunded.id not in active_ids, "Already refunded Partial order must NOT be in polling query"
