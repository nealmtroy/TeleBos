"""Integration Test Suite for SEC-08 Double-Entry Wallet Ledger & Balance Reconciliation.

Verifies:
1. Direct ledger entry (CREDIT / DEBIT) updates user balance atomically and preserves invariants.
2. Negative balance / overdraft prevention on DEBIT.
3. Strict parameter validation (positive amounts, valid entry types).
4. SQL database check constraints (chk_ledger_amount_positive, chk_ledger_entry_type).
5. Balance reconciliation engine (reconcile_user_balance):
   - Computes sum(CREDIT) - sum(DEBIT) == actual_balance.
   - Detects balance discrepancies/tampering if balance is desynchronized.
6. User ledger statement query (get_my_ledger_entries) with pagination and filtering.
7. Admin reconciliation endpoint.
8. Integrated service mutations:
   - Admin adjustment balance mutations (credit and debit).
   - Marketplace account purchase (buyer debit and seller credit).
   - Voucher redemption (user credit).
"""

import asyncio
import uuid
from sqlalchemy import select, delete, text
from sqlalchemy.exc import IntegrityError

from app.database import async_session_factory
from app.models.user import User
from app.models.wallet_ledger import WalletLedger
from app.models.redeem_code import RedeemCode
from app.models.telegram_account import TelegramAccount
from app.services.ledger_service import (
    record_ledger_entry,
    get_user_ledger_entries,
    reconcile_user_balance,
)
from app.api.wallet import get_my_ledger, admin_reconcile_user_balance
from app.api.admin import update_user_balance, UpdateBalanceRequest
from app.services.marketplace_service import buy_account
from app.services.redeem_service import redeem_code


class MockClient:
    def __init__(self, host: str = "127.0.0.1"):
        self.host = host


class MockRequest:
    def __init__(self, client_host: str = "127.0.0.1"):
        self.client = MockClient(client_host)
        self.headers = {}


async def run_tests():
    print("=== STARTING SEC-08 WALLET LEDGER & RECONCILIATION INTEGRATION TESTS ===")

    test_user_id = None
    seller_user_id = None
    admin_user_id = None
    test_user_email = f"sec08_user_{uuid.uuid4().hex[:8]}@example.com"
    seller_email = f"sec08_seller_{uuid.uuid4().hex[:8]}@example.com"
    admin_email = f"sec08_admin_{uuid.uuid4().hex[:8]}@example.com"

    try:
        # ── 1. Setup: Create test users ──────────────────────────────────────────
        async with async_session_factory() as db:
            user = User(
                email=test_user_email,
                balance=0,
                role="basic",
                is_active=True,
            )
            seller = User(
                email=seller_email,
                balance=0,
                role="basic",
                is_active=True,
            )
            admin = User(
                email=admin_email,
                balance=0,
                role="owner",
                is_active=True,
            )
            db.add_all([user, seller, admin])
            await db.commit()
            await db.refresh(user)
            await db.refresh(seller)
            await db.refresh(admin)
            test_user_id = user.id
            seller_user_id = seller.id
            admin_user_id = admin.id

        print(f"[SETUP] Created test users: User={test_user_id}, Seller={seller_user_id}, Admin={admin_user_id}")

        # ── 2. Test Direct Ledger Mutations (CREDIT & DEBIT) ─────────────────────
        print("[TEST 1] Testing CREDIT and DEBIT atomic ledger mutations...")
        async with async_session_factory() as db:
            res = await db.execute(select(User).where(User.id == test_user_id).with_for_update())
            u = res.scalar_one()

            # Record CREDIT
            credit_entry = await record_ledger_entry(
                db=db,
                user=u,
                amount=100_000,
                entry_type="CREDIT",
                category="topup",
                reference_id="TX-TEST-001",
                description="Initial test deposit",
            )
            assert u.balance == 100_000, f"Expected balance 100,000, got {u.balance}"
            assert credit_entry.balance_before == 0
            assert credit_entry.balance_after == 100_000
            assert credit_entry.amount == 100_000

            # Record DEBIT
            debit_entry = await record_ledger_entry(
                db=db,
                user=u,
                amount=35_000,
                entry_type="DEBIT",
                category="order_smm",
                reference_id="ORD-SMM-001",
                description="SMM Order 1",
            )
            assert u.balance == 65_000, f"Expected balance 65,000, got {u.balance}"
            assert debit_entry.balance_before == 100_000
            assert debit_entry.balance_after == 65_000
            assert debit_entry.amount == 35_000

            await db.commit()
        print("  -> PASSED: Credit and debit mutations verified with correct before/after states.")

        # ── 3. Test Invariants & Negative Balance Protection ─────────────────────
        print("[TEST 2] Testing ledger invariants and overdraft prevention...")
        async with async_session_factory() as db:
            res = await db.execute(select(User).where(User.id == test_user_id).with_for_update())
            u = res.scalar_one()

            # Attempt overdraft
            overdraft_caught = False
            try:
                await record_ledger_entry(
                    db=db,
                    user=u,
                    amount=70_000,  # Current balance is 65_000
                    entry_type="DEBIT",
                    category="order_smm",
                )
            except ValueError as e:
                overdraft_caught = True
                assert "Saldo tidak mencukupi" in str(e)
            assert overdraft_caught, "Overdraft must raise ValueError"

            # Attempt negative/zero amount
            zero_amt_caught = False
            try:
                await record_ledger_entry(
                    db=db,
                    user=u,
                    amount=0,
                    entry_type="CREDIT",
                    category="topup",
                )
            except ValueError:
                zero_amt_caught = True
            assert zero_amt_caught, "Amount <= 0 must raise ValueError"

            # Attempt invalid entry_type
            invalid_type_caught = False
            try:
                await record_ledger_entry(
                    db=db,
                    user=u,
                    amount=10_000,
                    entry_type="INVALID_TYPE",
                    category="topup",
                )
            except ValueError:
                invalid_type_caught = True
            assert invalid_type_caught, "Invalid entry_type must raise ValueError"

            await db.rollback()
        print("  -> PASSED: Invariants and overdraft prevention fully enforced.")

        # ── 4. Test SQL Check Constraints ────────────────────────────────────────
        print("[TEST 3] Testing DB level check constraints on wallet_ledgers table...")
        async with async_session_factory() as db:
            # Test chk_ledger_amount_positive
            chk_amount_caught = False
            try:
                invalid_row = WalletLedger(
                    id=uuid.uuid4(),
                    user_id=test_user_id,
                    entry_type="CREDIT",
                    amount=-5000,
                    balance_before=0,
                    balance_after=-5000,
                    category="test",
                )
                db.add(invalid_row)
                await db.commit()
            except IntegrityError:
                await db.rollback()
                chk_amount_caught = True
            assert chk_amount_caught, "Database must reject negative amount via chk_ledger_amount_positive constraint"

            # Test chk_ledger_entry_type
            chk_type_caught = False
            try:
                invalid_type_row = WalletLedger(
                    id=uuid.uuid4(),
                    user_id=test_user_id,
                    entry_type="HACK",
                    amount=5000,
                    balance_before=0,
                    balance_after=5000,
                    category="test",
                )
                db.add(invalid_type_row)
                await db.commit()
            except IntegrityError:
                await db.rollback()
                chk_type_caught = True
            assert chk_type_caught, "Database must reject invalid entry_type via chk_ledger_entry_type constraint"
        print("  -> PASSED: Database constraints enforce amount > 0 and entry_type IN ('DEBIT', 'CREDIT').")

        # ── 5. Test Reconciliation Engine ────────────────────────────────────────
        print("[TEST 4] Testing balance reconciliation engine...")
        async with async_session_factory() as db:
            recon = await reconcile_user_balance(db, test_user_id)
            assert str(recon["user_id"]) == str(test_user_id)
            assert recon["total_credits"] == 100_000
            assert recon["total_debits"] == 35_000
            assert recon["computed_balance"] == 65_000
            assert recon["actual_balance"] == 65_000
            assert recon["is_reconciled"] is True
            assert recon["discrepancy"] == 0

            # Simulate unauthorized balance alteration directly on users table
            await db.execute(
                text("UPDATE users SET balance = 999999 WHERE id = :uid"),
                {"uid": str(test_user_id)},
            )
            await db.commit()

            # Reconciliation must detect discrepancy
            recon_tampered = await reconcile_user_balance(db, test_user_id)
            assert recon_tampered["actual_balance"] == 999999
            assert recon_tampered["computed_balance"] == 65_000
            assert recon_tampered["is_reconciled"] is False
            assert recon_tampered["discrepancy"] == 999999 - 65_000

            # Restore correct balance
            await db.execute(
                text("UPDATE users SET balance = 65000 WHERE id = :uid"),
                {"uid": str(test_user_id)},
            )
            await db.commit()
        print("  -> PASSED: Reconciliation engine correctly matches balance and detects unauthorized tampering.")

        # ── 6. Test Wallet Ledger Query & API Endpoints ──────────────────────────
        print("[TEST 5] Testing ledger statements & admin reconcile endpoints...")
        async with async_session_factory() as db:
            # Query ledger entries via service
            entries, total = await get_user_ledger_entries(db, test_user_id, limit=10, offset=0)
            assert total == 2
            assert len(entries) == 2
            assert entries[0].entry_type == "DEBIT"  # Most recent first
            assert entries[1].entry_type == "CREDIT"

            # Test filter by category
            topup_entries, topup_total = await get_user_ledger_entries(
                db, test_user_id, category="topup"
            )
            assert topup_total == 1
            assert topup_entries[0].category == "topup"

            # Query endpoint get_my_ledger_entries
            res_user = await db.execute(select(User).where(User.id == test_user_id))
            cur_user = res_user.scalar_one()

            endpoint_res = await get_my_ledger(
                entry_type="DEBIT",
                category=None,
                limit=10,
                offset=0,
                db=db,
                current_user=cur_user,
            )
            assert endpoint_res.total == 1
            assert endpoint_res.entries[0].entry_type == "DEBIT"
            assert endpoint_res.entries[0].amount == 35_000

            # Test admin endpoint admin_reconcile_user_balance
            res_admin = await db.execute(select(User).where(User.id == admin_user_id))
            cur_admin = res_admin.scalar_one()

            admin_recon = await admin_reconcile_user_balance(
                user_id=test_user_id,
                db=db,
                current_user=cur_admin,
            )
            assert admin_recon.is_reconciled is True
            assert admin_recon.discrepancy == 0
        print("  -> PASSED: Ledger statements and admin reconciliation API verified.")

        # ── 7. Test Admin Balance Adjustment Integration ─────────────────────────
        print("[TEST 6] Testing Admin Balance Adjustment via record_ledger_entry...")
        async with async_session_factory() as db:
            mock_req = MockRequest()
            res_admin = await db.execute(select(User).where(User.id == admin_user_id))
            cur_admin = res_admin.scalar_one()

            # Admin adds 25,000
            adj_add = await update_user_balance(
                request=mock_req,
                payload=UpdateBalanceRequest(user_id=str(test_user_id), amount=25_000),
                db=db,
                current_user=cur_admin,
            )
            assert adj_add.balance == 90_000

            # Admin deducts 10,000
            adj_deduct = await update_user_balance(
                request=mock_req,
                payload=UpdateBalanceRequest(user_id=str(test_user_id), amount=-10_000),
                db=db,
                current_user=cur_admin,
            )
            assert adj_deduct.balance == 80_000
            await db.commit()

            # Verify reconciliation holds
            recon = await reconcile_user_balance(db, test_user_id)
            assert recon["actual_balance"] == 80_000
            assert recon["computed_balance"] == 80_000
            assert recon["is_reconciled"] is True
        print("  -> PASSED: Admin balance adjustments correctly booked and reconciled.")

        # ── 8. Test Redeem Voucher Integration ───────────────────────────────────
        print("[TEST 7] Testing Voucher Redemption integration with ledger...")
        async with async_session_factory() as db:
            voucher_code = f"TESTVOUCH{uuid.uuid4().hex[:6].upper()}"
            v_code = RedeemCode(
                code=voucher_code,
                code_type="balance",
                amount=15_000,
                max_uses=1,
                used_count=0,
                is_active=True,
                created_by=admin_user_id,
            )
            db.add(v_code)
            await db.commit()

            res_user = await db.execute(select(User).where(User.id == test_user_id))
            cur_user = res_user.scalar_one()

            # Redeem
            redeem_res = await redeem_code(db, cur_user, voucher_code)
            assert redeem_res["balance_added"] == 15_000
            assert cur_user.balance == 95_000
            await db.commit()

            # Verify reconciliation holds
            recon = await reconcile_user_balance(db, test_user_id)
            assert recon["actual_balance"] == 95_000
            assert recon["computed_balance"] == 95_000
            assert recon["is_reconciled"] is True
        print("  -> PASSED: Voucher redemption ledger credit verified and reconciled.")

        # ── 9. Test Marketplace Purchase Integration ─────────────────────────────
        print("[TEST 8] Testing Marketplace account purchase (Buyer DEBIT / Seller CREDIT)...")
        async with async_session_factory() as db:
            res_user = await db.execute(select(User).where(User.id == test_user_id))
            buyer = res_user.scalar_one()
            res_seller = await db.execute(select(User).where(User.id == seller_user_id))
            seller = res_seller.scalar_one()

            # Create listed TelegramAccount belonging to seller
            listing_phone = f"+628{uuid.uuid4().int % 1000000000}"
            acc = TelegramAccount(
                user_id=seller.id,
                seller_id=seller.id,
                phone=listing_phone,
                session_string="mock_session",
                is_active=True,
                for_sale=True,
                is_sold=False,
                buy_price=20_000,
                sell_price=20_000,
            )
            db.add(acc)
            await db.commit()
            await db.refresh(acc)

            # Buyer buys listing
            # Buyer has 95_000, price is 20_000 -> Buyer should have 75_000
            # Seller has 0, price is 20_000 -> Seller should have 20_000
            bought_acc = await buy_account(db, buyer, acc.id)
            assert bought_acc.user_id == buyer.id
            assert bought_acc.for_sale is False
            assert buyer.balance == 75_000
            assert seller.balance == 20_000
            await db.commit()

            # Verify Buyer reconciliation
            buyer_recon = await reconcile_user_balance(db, buyer.id)
            assert buyer_recon["actual_balance"] == 75_000
            assert buyer_recon["computed_balance"] == 75_000
            assert buyer_recon["is_reconciled"] is True

            # Verify Seller reconciliation
            seller_recon = await reconcile_user_balance(db, seller.id)
            assert seller_recon["actual_balance"] == 20_000
            assert seller_recon["computed_balance"] == 20_000
            assert seller_recon["is_reconciled"] is True
        print("  -> PASSED: Marketplace atomic buyer debit and seller credit verified and both reconciled.")

        print("\nALL SEC-08 WALLET LEDGER INTEGRATION TESTS PASSED SUCCESSFULLY! 🎉\n")

    finally:
        # Cleanup test data
        async with async_session_factory() as db:
            if test_user_id:
                await db.execute(delete(WalletLedger).where(WalletLedger.user_id == test_user_id))
                await db.execute(delete(TelegramAccount).where(TelegramAccount.user_id == test_user_id))
                await db.execute(delete(User).where(User.id == test_user_id))
            if seller_user_id:
                await db.execute(delete(WalletLedger).where(WalletLedger.user_id == seller_user_id))
                await db.execute(delete(TelegramAccount).where(TelegramAccount.user_id == seller_user_id))
                await db.execute(delete(User).where(User.id == seller_user_id))
            if admin_user_id:
                await db.execute(delete(WalletLedger).where(WalletLedger.user_id == admin_user_id))
                await db.execute(delete(User).where(User.id == admin_user_id))
            await db.commit()
            print("[CLEANUP] Cleaned up all test users and associated ledger records.")


if __name__ == "__main__":
    asyncio.run(run_tests())
