"""Concurrency Stress-Test Suite for Wallet Ledger, Row Locks, and Double-Refund Mutex.

Addresses TEST-03 (TASK-18 in REMEDIATION_ROADMAP.md):
- Validates row-level write locking (SELECT ... FOR UPDATE / with_for_update())
  under high-concurrency race condition scenarios (30-40 simultaneous async tasks).
- Proves overdraft is strictly impossible (balance never drops below 0).
- Proves exact quota fulfillment: with Rp 100.000 starting balance and 30 parallel
  requests of Rp 5.000 each, exactly 20 succeed and 10 fail cleanly with insufficient balance.
- Proves double-entry ledger invariant: total debits and credits reconcile 100% (zero-sum).
- Proves concurrent order refund mutex: exactly 1 refund executes, preventing double-refund.
- Proves SQL database check constraints prevent negative balance even at the storage layer.
"""

import asyncio
from datetime import datetime, timezone
import uuid
import pytest
from sqlalchemy import delete, select, text
from sqlalchemy.exc import IntegrityError

from app.database import async_session_factory
from app.models.order import Order
from app.models.user import User
from app.models.wallet_ledger import WalletLedger
from app.services.ledger_service import (
    record_ledger_entry,
    reconcile_user_balance,
)
from app.services.order_service import process_order_refund_if_eligible


@pytest.fixture
async def cleanup_concurrency_data():
    """Tracks created user and order IDs and cleans them up in strictly safe foreign key order."""
    user_ids: list[uuid.UUID] = []
    order_ids: list[uuid.UUID] = []

    yield user_ids, order_ids

    # Teardown: delete children (WalletLedger, Order) before parent (User)
    async with async_session_factory() as session:
        if order_ids:
            await session.execute(delete(Order).where(Order.id.in_(order_ids)))
        if user_ids:
            await session.execute(delete(WalletLedger).where(WalletLedger.user_id.in_(user_ids)))
            await session.execute(delete(User).where(User.id.in_(user_ids)))
        await session.commit()


@pytest.mark.asyncio
async def test_concurrency_30_simultaneous_debits_prevents_overdraft_and_balances_ledger(
    cleanup_concurrency_data,
):
    """TEST-03 Acceptance Criteria 1, 2, 3:

    - 30 parallel debit requests of Rp 5.000 each on a user with Rp 100.000 initial balance.
    - Exactly 20 requests succeed (total debited = Rp 100.000).
    - Exactly 10 requests are rejected due to insufficient balance.
    - Final balance is exactly Rp 0 and NEVER negative.
    - Total credits (100.000) and debits (100.000) match 100% in reconcile_user_balance.
    """
    user_ids, _ = cleanup_concurrency_data
    user_id = uuid.uuid4()
    user_ids.append(user_id)
    email = f"stress_user_{user_id.hex[:8]}@example.com"
    initial_balance = 100_000
    debit_amount = 5_000
    num_requests = 30
    expected_success = 20  # 100_000 // 5_000 = 20
    expected_failures = 10

    # 1. Setup user with initial balance and matching baseline CREDIT ledger entry
    async with async_session_factory() as session:
        user = User(
            id=user_id,
            email=email,
            balance=initial_balance,
            role="basic",
            is_active=True,
        )
        session.add(user)
        # Record initial funding in ledger for zero-sum accounting baseline
        init_ledger = WalletLedger(
            id=uuid.uuid4(),
            user_id=user_id,
            entry_type="CREDIT",
            amount=initial_balance,
            balance_before=0,
            balance_after=initial_balance,
            category="topup",
            description="Initial stress test funding",
            created_at=datetime.now(timezone.utc),
        )
        session.add(init_ledger)
        await session.commit()

    # 2. Worker coroutine simulating an atomic debit endpoint under row-level lock
    async def debit_worker(worker_idx: int) -> dict:
        async with async_session_factory() as worker_session:
            try:
                # Lock user row with SELECT ... FOR UPDATE
                stmt = select(User).where(User.id == user_id).with_for_update()
                result = await worker_session.execute(stmt)
                locked_user = result.scalar_one()

                if locked_user.balance < debit_amount:
                    await worker_session.rollback()
                    return {"status": "INSUFFICIENT_FUNDS", "worker_idx": worker_idx}

                # Record double-entry ledger debit
                await record_ledger_entry(
                    db=worker_session,
                    user=locked_user,
                    amount=debit_amount,
                    entry_type="DEBIT",
                    category="order_smm",
                    reference_id=f"stress-debit-{worker_idx}",
                    description=f"Concurrent order debit #{worker_idx}",
                )
                await worker_session.commit()
                return {"status": "SUCCESS", "worker_idx": worker_idx}
            except Exception as exc:
                await worker_session.rollback()
                return {"status": "ERROR", "worker_idx": worker_idx, "error": str(exc)}

    # 3. Launch 30 concurrent coroutines simultaneously
    tasks = [debit_worker(i) for i in range(num_requests)]
    results = await asyncio.gather(*tasks)

    # 4. Tally outcomes
    successes = [r for r in results if r["status"] == "SUCCESS"]
    insufficient = [r for r in results if r["status"] == "INSUFFICIENT_FUNDS"]
    errors = [r for r in results if r["status"] == "ERROR"]

    assert len(errors) == 0, f"Unexpected errors during stress run: {errors}"
    assert len(successes) == expected_success, (
        f"Expected exactly {expected_success} successes, got {len(successes)}"
    )
    assert len(insufficient) == expected_failures, (
        f"Expected exactly {expected_failures} rejected requests, got {len(insufficient)}"
    )

    # 5. Verify final database state directly from database engine
    async with async_session_factory() as verify_session:
        user_in_db = await verify_session.get(User, user_id)
        assert user_in_db is not None
        assert user_in_db.balance == 0, f"Expected final balance 0, got {user_in_db.balance}"
        assert user_in_db.balance >= 0, "Overdraft detected! Balance dropped below zero!"

        # 6. Verify ledger reconciliation (sum(CREDIT) - sum(DEBIT) == current_balance)
        recon = await reconcile_user_balance(verify_session, user_id)
        assert recon["is_reconciled"] is True
        assert recon["discrepancy"] == 0
        assert recon["actual_balance"] == 0
        assert recon["computed_balance"] == 0
        assert recon["total_credits"] == initial_balance
        assert recon["total_debits"] == expected_success * debit_amount  # 100_000


@pytest.mark.asyncio
async def test_concurrency_interleaved_parallel_credits_and_debits(
    cleanup_concurrency_data,
):
    """Stress-test mixed parallel CREDIT and DEBIT operations on the same user.

    - Initial balance: Rp 50.000.
    - 15 concurrent CREDIT workers: each adds Rp 10.000 (+150.000 total).
    - 25 concurrent DEBIT workers: each attempts to deduct Rp 8.000 (-200.000 requested).
    - Ensures that regardless of scheduling order:
      * User balance never drops below 0.
      * All successful credits and debits accurately update user.balance.
      * Ledger reconciliation is 100% consistent with zero discrepancy.
    """
    user_ids, _ = cleanup_concurrency_data
    user_id = uuid.uuid4()
    user_ids.append(user_id)
    email = f"mixed_stress_{user_id.hex[:8]}@example.com"
    initial_balance = 50_000
    credit_amount = 10_000
    debit_amount = 8_000
    num_credits = 15
    num_debits = 25

    # 1. Setup user
    async with async_session_factory() as session:
        user = User(
            id=user_id,
            email=email,
            balance=initial_balance,
            role="basic",
            is_active=True,
        )
        session.add(user)
        init_ledger = WalletLedger(
            id=uuid.uuid4(),
            user_id=user_id,
            entry_type="CREDIT",
            amount=initial_balance,
            balance_before=0,
            balance_after=initial_balance,
            category="topup",
            description="Initial baseline funding",
            created_at=datetime.now(timezone.utc),
        )
        session.add(init_ledger)
        await session.commit()

    # 2. Credit worker
    async def credit_worker(idx: int) -> dict:
        async with async_session_factory() as worker_session:
            stmt = select(User).where(User.id == user_id).with_for_update()
            result = await worker_session.execute(stmt)
            locked_user = result.scalar_one()

            await record_ledger_entry(
                db=worker_session,
                user=locked_user,
                amount=credit_amount,
                entry_type="CREDIT",
                category="topup",
                reference_id=f"credit-{idx}",
                description=f"Interleaved credit #{idx}",
            )
            await worker_session.commit()
            return {"type": "CREDIT", "status": "SUCCESS", "idx": idx}

    # 3. Debit worker
    async def debit_worker(idx: int) -> dict:
        async with async_session_factory() as worker_session:
            stmt = select(User).where(User.id == user_id).with_for_update()
            result = await worker_session.execute(stmt)
            locked_user = result.scalar_one()

            if locked_user.balance < debit_amount:
                await worker_session.rollback()
                return {"type": "DEBIT", "status": "INSUFFICIENT", "idx": idx}

            await record_ledger_entry(
                db=worker_session,
                user=locked_user,
                amount=debit_amount,
                entry_type="DEBIT",
                category="order_smm",
                reference_id=f"debit-{idx}",
                description=f"Interleaved debit #{idx}",
            )
            await worker_session.commit()
            return {"type": "DEBIT", "status": "SUCCESS", "idx": idx}

    # 4. Launch all 40 operations interleaved
    tasks = [credit_worker(i) for i in range(num_credits)] + [
        debit_worker(i) for i in range(num_debits)
    ]
    results = await asyncio.gather(*tasks)

    # 5. Verify outcomes
    credit_successes = [r for r in results if r["type"] == "CREDIT" and r["status"] == "SUCCESS"]
    debit_successes = [r for r in results if r["type"] == "DEBIT" and r["status"] == "SUCCESS"]

    assert len(credit_successes) == num_credits, "All 15 credit workers must succeed"
    num_debit_ok = len(debit_successes)

    # 6. Verify ledger mathematics
    async with async_session_factory() as verify_session:
        user_in_db = await verify_session.get(User, user_id)
        assert user_in_db is not None
        expected_balance = initial_balance + (num_credits * credit_amount) - (num_debit_ok * debit_amount)
        assert user_in_db.balance == expected_balance
        assert user_in_db.balance >= 0, "Balance must never be negative!"

        recon = await reconcile_user_balance(verify_session, user_id)
        assert recon["is_reconciled"] is True
        assert recon["discrepancy"] == 0
        assert recon["actual_balance"] == expected_balance
        assert recon["computed_balance"] == expected_balance


@pytest.mark.asyncio
async def test_concurrency_order_service_double_refund_mutex(
    cleanup_concurrency_data,
):
    """Verify CONS-02 / TASK-03 under real concurrent race conditions:

    - When 10 concurrent tasks attempt to refund the EXACT SAME order simultaneously,
      row-level lock on the Order prevents double-refund.
    - Exactly ONE task executes the refund and credits balance.
    - The remaining 9 tasks return 0.
    - The user balance receives exactly 1 refund, and ledger contains exactly 1 refund record.
    """
    user_ids, order_ids = cleanup_concurrency_data
    user_id = uuid.uuid4()
    order_id = uuid.uuid4()
    user_ids.append(user_id)
    order_ids.append(order_id)

    email = f"refund_race_{user_id.hex[:8]}@example.com"
    total_price = 50_000
    quantity = 1000
    remains = 400
    # Prorated refund = (50000 * 400) // 1000 = 20000
    expected_refund = 20_000

    # 1. Create user with 0 balance and Order in Processing status
    async with async_session_factory() as session:
        user = User(
            id=user_id,
            email=email,
            balance=0,
            role="basic",
            is_active=True,
        )
        session.add(user)

        order = Order(
            id=order_id,
            user_id=user_id,
            service_id=101,
            service_name="Telegram Post Views",
            category="Telegram",
            data_target="https://t.me/channel/1",
            quantity=quantity,
            price=50,
            total_price=total_price,
            status="Processing",
            remains=remains,
            is_refunded=False,
            refunded_amount=0,
        )
        session.add(order)
        await session.commit()

    # 2. Worker coroutine attempting refund on the order
    async def refund_worker(idx: int) -> int:
        async with async_session_factory() as worker_session:
            # Query order instance in this session
            order_res = await worker_session.execute(select(Order).where(Order.id == order_id))
            caller_order = order_res.scalar_one()

            # Process refund under order row lock
            refund_amount = await process_order_refund_if_eligible(
                db=worker_session,
                order=caller_order,
                new_status="Partial",
            )
            await worker_session.commit()
            return refund_amount

    # 3. Launch 10 concurrent refund attempts
    tasks = [refund_worker(i) for i in range(10)]
    refund_results = await asyncio.gather(*tasks)

    # 4. Verify outcomes: exactly ONE task got expected_refund, the other 9 got 0
    non_zero_refunds = [r for r in refund_results if r > 0]
    zero_refunds = [r for r in refund_results if r == 0]

    assert len(non_zero_refunds) == 1, (
        f"Expected exactly 1 successful refund, got {len(non_zero_refunds)}: {non_zero_refunds}"
    )
    assert non_zero_refunds[0] == expected_refund
    assert len(zero_refunds) == 9

    # 5. Verify database state
    async with async_session_factory() as verify_session:
        user_in_db = await verify_session.get(User, user_id)
        assert user_in_db is not None
        assert user_in_db.balance == expected_refund

        order_in_db = await verify_session.get(Order, order_id)
        assert order_in_db is not None
        assert order_in_db.is_refunded is True
        assert order_in_db.refunded_amount == expected_refund

        # Check ledger entries for this user: exactly 1 credit entry
        ledgers = (
            await verify_session.execute(
                select(WalletLedger).where(
                    WalletLedger.user_id == user_id,
                    WalletLedger.entry_type == "CREDIT",
                )
            )
        ).scalars().all()
        assert len(ledgers) == 1
        assert ledgers[0].amount == expected_refund
        assert ledgers[0].category == "order_smm_refund"
        assert ledgers[0].reference_id == str(order_id)

        # Reconcile user balance
        recon = await reconcile_user_balance(verify_session, user_id)
        assert recon["is_reconciled"] is True
        assert recon["discrepancy"] == 0
        assert recon["actual_balance"] == expected_refund


@pytest.mark.asyncio
async def test_concurrency_sql_check_constraint_defense_in_depth(
    cleanup_concurrency_data,
):
    """Verify storage-layer Defense-in-Depth:

    Even if application-level locking were somehow bypassed and a raw query attempted
    to set balance < 0 or insert a negative ledger amount, the PostgreSQL check constraints
    (users_balance_check and chk_ledger_amount_positive) reject the operation immediately.
    """
    user_ids, _ = cleanup_concurrency_data
    user_id = uuid.uuid4()
    user_ids.append(user_id)
    email = f"chk_user_{user_id.hex[:8]}@example.com"

    async with async_session_factory() as session:
        user = User(
            id=user_id,
            email=email,
            balance=10_000,
            role="basic",
            is_active=True,
        )
        session.add(user)
        await session.commit()

    # 1. Attempt raw negative balance update
    async with async_session_factory() as session:
        with pytest.raises(IntegrityError):
            await session.execute(
                text("UPDATE users SET balance = -500 WHERE id = :uid"),
                {"uid": user_id},
            )
            await session.commit()
        await session.rollback()

    # 2. Attempt negative amount ledger insert
    async with async_session_factory() as session:
        bad_ledger = WalletLedger(
            id=uuid.uuid4(),
            user_id=user_id,
            entry_type="DEBIT",
            amount=-5_000,  # Negative!
            balance_before=10_000,
            balance_after=5_000,
            category="test",
            description="Bad negative ledger",
        )
        session.add(bad_ledger)
        with pytest.raises(IntegrityError):
            await session.commit()
        await session.rollback()


@pytest.mark.asyncio
async def test_concurrency_deterministic_lock_ordering_prevents_circular_deadlock(
    cleanup_concurrency_data,
):
    """Verify that bilateral concurrent transactions between two users (User A and User B)

    use sorted UUID lock ordering (min(A, B) then max(A, B)) to prevent circular deadlocks
    (PostgreSQL error 40P01 deadlock_detected).
    - User A transfers Rp 5.000 to User B in Transaction 1.
    - User B transfers Rp 5.000 to User A in Transaction 2.
    - Both run simultaneously in parallel.
    - Without sorted locks, T1 locks A and waits for B, while T2 locks B and waits for A (deadlock).
    - With deterministic lock ordering, both acquire locks in the exact same order and complete with 0 deadlocks.
    """
    user_ids, _ = cleanup_concurrency_data
    user_a_id = uuid.uuid4()
    user_b_id = uuid.uuid4()
    user_ids.extend([user_a_id, user_b_id])

    # Initial balance: Rp 20.000 each
    async with async_session_factory() as session:
        user_a = User(
            id=user_a_id,
            email=f"user_a_{user_a_id.hex[:8]}@example.com",
            balance=20_000,
            role="basic",
            is_active=True,
        )
        user_b = User(
            id=user_b_id,
            email=f"user_b_{user_b_id.hex[:8]}@example.com",
            balance=20_000,
            role="basic",
            is_active=True,
        )
        session.add_all([user_a, user_b])
        # Record baseline ledger
        session.add_all([
            WalletLedger(
                id=uuid.uuid4(),
                user_id=user_a_id,
                entry_type="CREDIT",
                amount=20_000,
                balance_before=0,
                balance_after=20_000,
                category="topup",
                description="Baseline A",
            ),
            WalletLedger(
                id=uuid.uuid4(),
                user_id=user_b_id,
                entry_type="CREDIT",
                amount=20_000,
                balance_before=0,
                balance_after=20_000,
                category="topup",
                description="Baseline B",
            ),
        ])
        await session.commit()

    async def transfer_bilateral(sender_id: uuid.UUID, recipient_id: uuid.UUID, amount: int):
        async with async_session_factory() as session:
            # Deterministic sorted lock acquisition
            first_id, second_id = (sender_id, recipient_id) if sender_id < recipient_id else (recipient_id, sender_id)
            res_first = await session.execute(select(User).where(User.id == first_id).with_for_update())
            res_second = await session.execute(select(User).where(User.id == second_id).with_for_update())
            u_first = res_first.scalar_one()
            u_second = res_second.scalar_one()

            sender = u_first if first_id == sender_id else u_second
            recipient = u_second if first_id == sender_id else u_first

            if sender.balance < amount:
                await session.rollback()
                return False

            await record_ledger_entry(
                db=session,
                user=sender,
                amount=amount,
                entry_type="DEBIT",
                category="transfer_out",
                reference_id=str(recipient_id),
                description=f"Transfer to {recipient_id}",
            )
            await record_ledger_entry(
                db=session,
                user=recipient,
                amount=amount,
                entry_type="CREDIT",
                category="transfer_in",
                reference_id=str(sender_id),
                description=f"Transfer from {sender_id}",
            )
            await session.commit()
            return True

    # Run 10 parallel cross-transfers (A -> B and B -> A simultaneously)
    tasks = []
    for i in range(5):
        tasks.append(transfer_bilateral(user_a_id, user_b_id, 2_000))
        tasks.append(transfer_bilateral(user_b_id, user_a_id, 2_000))

    results = await asyncio.gather(*tasks, return_exceptions=False)
    assert all(results), f"Expected all transfers to succeed without deadlock, got: {results}"

    # Verify both users still reconcile perfectly
    async with async_session_factory() as session:
        recon_a = await reconcile_user_balance(session, user_a_id)
        recon_b = await reconcile_user_balance(session, user_b_id)
        assert recon_a["is_reconciled"] is True and recon_a["discrepancy"] == 0
        assert recon_b["is_reconciled"] is True and recon_b["discrepancy"] == 0
        assert recon_a["actual_balance"] == 20_000
        assert recon_b["actual_balance"] == 20_000

