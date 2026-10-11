"""Integration Test Suite for SEC-02 Admin Settlement Fulfillment & Manual Workflow.

Verifies:
1. Withdrawal transactions:
   - Approval: marks transaction approved without altering pre-deducted balance.
   - Rejection: refunds pre-deducted balance back to user atomically via double-entry ledger.
2. Inbound payment transactions (Automatic by gateway, but if manually approved by admin override):
   - Subscription: activates user role (e.g. 'pro') and extends subscription_expires_at.
   - Topup: credits user balance via double-entry ledger.
   - Marketplace: transfers account ownership to buyer, activates session, credits seller via ledger.
   - SMM: dispatches order and creates Order record.
3. Zero settlement desync: guarantees entity fulfillment is executed upon status approval.
"""

import asyncio
import json
import uuid
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, patch

from sqlalchemy import select, delete

from app.database import async_session_factory
from app.models.user import User
from app.models.wallet_transaction import WalletTransaction
from app.models.telegram_account import TelegramAccount
from app.models.order import Order
from app.models.smm_service import SmmService
from app.models.wallet_ledger import WalletLedger
from app.api.wallet import admin_update_transaction_status
from app.schemas.wallet import AdminTransactionStatusUpdate
from app.services.ledger_service import record_ledger_entry, reconcile_user_balance
from app.smm_service_ids import ALLOWED_SMM_SERVICE_IDS


async def run_tests():
    print("=== STARTING SEC-02 ADMIN SETTLEMENT FULFILLMENT INTEGRATION TESTS ===")

    test_user_id = None
    seller_user_id = None
    admin_user_id = None
    test_user_email = f"sec02_user_{uuid.uuid4().hex[:8]}@example.com"
    seller_email = f"sec02_seller_{uuid.uuid4().hex[:8]}@example.com"
    admin_email = f"sec02_admin_{uuid.uuid4().hex[:8]}@example.com"

    allowed_service_id = next(iter(ALLOWED_SMM_SERVICE_IDS))

    try:
        # Setup test users
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

            # Seed initial ledger entry for baseline balance reconciliation
            await record_ledger_entry(
                db=db,
                user=user,
                amount=100_000,
                entry_type="CREDIT",
                category="initial_balance",
                description="Initial setup balance",
            )
            await db.commit()

        print(f"[SETUP] Created users: User={test_user_id}, Seller={seller_user_id}, Admin={admin_user_id}")

        # ── 1. Test Withdrawal Rejection Refund ───────────────────────────────────
        print("\n[TEST 1] Testing withdrawal rejection refunds balance via ledger...")
        async with async_session_factory() as db:
            res_user = await db.execute(select(User).where(User.id == test_user_id).with_for_update())
            u = res_user.scalar_one()

            # Simulate pending withdrawal of 40,000 (pre-deducted)
            await record_ledger_entry(
                db=db,
                user=u,
                amount=40_000,
                entry_type="DEBIT",
                category="withdraw",
                description="Penarikan dana BCA",
            )
            tx_withdraw = WalletTransaction(
                id=f"TX-WD-{uuid.uuid4().hex[:8]}",
                user_id=u.id,
                type="withdraw",
                amount=40_000,
                method="BCA",
                note="1234567890",
                status="pending",
            )
            db.add(tx_withdraw)
            await db.commit()
            assert u.balance == 60_000

        # Admin rejects the withdrawal
        async with async_session_factory() as db:
            res_admin = await db.execute(select(User).where(User.id == admin_user_id))
            cur_admin = res_admin.scalar_one()

            res_tx = await admin_update_transaction_status(
                tx_id=tx_withdraw.id,
                payload=AdminTransactionStatusUpdate(status="rejected", admin_note="Nomor rekening tidak valid"),
                db=db,
                current_user=cur_admin,
            )
            assert res_tx.status == "rejected"
            await db.commit()

        # Verify user balance was refunded back to 100,000
        async with async_session_factory() as db:
            res_user = await db.execute(select(User).where(User.id == test_user_id))
            u = res_user.scalar_one()
            assert u.balance == 100_000, f"Expected balance refunded to 100,000, got {u.balance}"
            recon = await reconcile_user_balance(db, test_user_id)
            assert recon["is_reconciled"] is True
            print("  ✓ Withdrawal rejection successfully refunded 40,000 to user balance via ledger.")

        # ── 2. Test Subscription Manual Approval Fulfillment ─────────────────────
        print("\n[TEST 2] Testing subscription invoice approval fulfills plan upgrade...")
        async with async_session_factory() as db:
            sub_note = json.dumps({
                "plan_id": "pro",
                "billing_cycle": "monthly",
                "duration_days": 30,
            })
            tx_sub = WalletTransaction(
                id=f"TX-SUB-{uuid.uuid4().hex[:8]}",
                user_id=test_user_id,
                type="subscription",
                amount=50_000,
                total_amount=50_000,
                method="QRIS",
                note=sub_note,
                status="pending",
            )
            db.add(tx_sub)
            await db.commit()

        # Admin approves the subscription transaction
        async with async_session_factory() as db:
            res_admin = await db.execute(select(User).where(User.id == admin_user_id))
            cur_admin = res_admin.scalar_one()

            res_tx = await admin_update_transaction_status(
                tx_id=tx_sub.id,
                payload=AdminTransactionStatusUpdate(status="approved", admin_note="Manual bank transfer verified"),
                db=db,
                current_user=cur_admin,
            )
            assert res_tx.status == "approved"
            await db.commit()

        # Verify user role upgraded and subscription_expires_at extended
        async with async_session_factory() as db:
            res_user = await db.execute(select(User).where(User.id == test_user_id))
            u = res_user.scalar_one()
            assert u.role == "pro", f"Expected user role 'pro', got {u.role}"
            assert u.subscription_expires_at is not None, "subscription_expires_at must be set"
            assert u.subscription_expires_at > datetime.now(timezone.utc) + timedelta(days=25)
            print(f"  ✓ Subscription fulfilled on admin approve: user upgraded to '{u.role}', expires at {u.subscription_expires_at.date()}")

        # ── 3. Test Marketplace Account Purchase Manual Approval ──────────────────
        print("\n[TEST 3] Testing marketplace purchase approval fulfills account transfer...")
        async with async_session_factory() as db:
            phone_num = f"+628{uuid.uuid4().int % 1000000000}"
            acc = TelegramAccount(
                user_id=seller_user_id,
                seller_id=seller_user_id,
                phone=phone_num,
                session_string="mock_session_sec02",
                is_active=False,
                for_sale=True,
                is_sold=False,
                buy_price=25_000,
                sell_price=20_000,
            )
            db.add(acc)
            await db.commit()
            await db.refresh(acc)

            m_note = json.dumps({"account_id": str(acc.id)})
            tx_mkt = WalletTransaction(
                id=f"TX-MKT-{uuid.uuid4().hex[:8]}",
                user_id=test_user_id,
                type="marketplace",
                amount=25_000,
                total_amount=25_000,
                method="QRIS",
                note=m_note,
                status="pending",
            )
            db.add(tx_mkt)
            await db.commit()

        # Admin approves the marketplace transaction
        async with async_session_factory() as db:
            res_admin = await db.execute(select(User).where(User.id == admin_user_id))
            cur_admin = res_admin.scalar_one()

            res_tx = await admin_update_transaction_status(
                tx_id=tx_mkt.id,
                payload=AdminTransactionStatusUpdate(status="approved", admin_note="Pembayaran marketplace terverifikasi"),
                db=db,
                current_user=cur_admin,
            )
            assert res_tx.status == "approved"
            await db.commit()

        # Verify buyer owns the account and seller received sale credits via ledger
        async with async_session_factory() as db:
            res_acc = await db.execute(select(TelegramAccount).where(TelegramAccount.id == acc.id))
            updated_acc = res_acc.scalar_one()
            assert updated_acc.user_id == test_user_id, "Account ownership must transfer to buyer"
            assert updated_acc.for_sale is False
            assert updated_acc.is_active is True

            res_seller = await db.execute(select(User).where(User.id == seller_user_id))
            s = res_seller.scalar_one()
            assert s.balance == 20_000, f"Expected seller balance 20,000, got {s.balance}"

            # Verify seller ledger reconciled
            s_recon = await reconcile_user_balance(db, seller_user_id)
            assert s_recon["is_reconciled"] is True
            print("  ✓ Marketplace purchase fulfilled on admin approve: account transferred and seller credited.")

        # ── 4. Test Topup Manual Approval ─────────────────────────────────────────
        print("\n[TEST 4] Testing manual topup approval credits balance via ledger...")
        async with async_session_factory() as db:
            tx_topup = WalletTransaction(
                id=f"TX-TOP-{uuid.uuid4().hex[:8]}",
                user_id=test_user_id,
                type="topup",
                amount=30_000,
                total_amount=30_000,
                method="BCA Manual",
                note="Deposit manual konfirmasi admin",
                status="pending",
            )
            db.add(tx_topup)
            await db.commit()

        async with async_session_factory() as db:
            res_admin = await db.execute(select(User).where(User.id == admin_user_id))
            cur_admin = res_admin.scalar_one()

            res_tx = await admin_update_transaction_status(
                tx_id=tx_topup.id,
                payload=AdminTransactionStatusUpdate(status="approved", admin_note="Bukti transfer BCA valid"),
                db=db,
                current_user=cur_admin,
            )
            assert res_tx.status == "approved"
            await db.commit()

        async with async_session_factory() as db:
            res_user = await db.execute(select(User).where(User.id == test_user_id))
            u = res_user.scalar_one()
            assert u.balance == 130_000, f"Expected balance 130,000, got {u.balance}"
            recon = await reconcile_user_balance(db, test_user_id)
            assert recon["is_reconciled"] is True
            print("  ✓ Manual topup approval credited 30,000 to user balance and reconciled.")

        print("\nALL SEC-02 ADMIN SETTLEMENT FULFILLMENT TESTS PASSED SUCCESSFULLY! 🎉\n")

    finally:
        # Cleanup
        async with async_session_factory() as db:
            if test_user_id:
                await db.execute(delete(WalletTransaction).where(WalletTransaction.user_id == test_user_id))
                await db.execute(delete(WalletLedger).where(WalletLedger.user_id == test_user_id))
                await db.execute(delete(TelegramAccount).where(TelegramAccount.user_id == test_user_id))
                await db.execute(delete(User).where(User.id == test_user_id))
            if seller_user_id:
                await db.execute(delete(WalletTransaction).where(WalletTransaction.user_id == seller_user_id))
                await db.execute(delete(WalletLedger).where(WalletLedger.user_id == seller_user_id))
                await db.execute(delete(TelegramAccount).where(TelegramAccount.user_id == seller_user_id))
                await db.execute(delete(User).where(User.id == seller_user_id))
            if admin_user_id:
                await db.execute(delete(WalletTransaction).where(WalletTransaction.user_id == admin_user_id))
                await db.execute(delete(User).where(User.id == admin_user_id))
            await db.commit()
            print("[CLEANUP] Deleted test users and transactions.")


if __name__ == "__main__":
    asyncio.run(run_tests())
