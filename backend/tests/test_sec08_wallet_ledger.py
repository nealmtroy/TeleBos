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
import pytest
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


@pytest.fixture
async def sec08_users():
    test_user_id = uuid.uuid4()
    seller_user_id = uuid.uuid4()
    admin_user_id = uuid.uuid4()
    test_user_email = f"sec08_user_{uuid.uuid4().hex[:8]}@example.com"
    seller_email = f"sec08_seller_{uuid.uuid4().hex[:8]}@example.com"
    admin_email = f"sec08_admin_{uuid.uuid4().hex[:8]}@example.com"

    async with async_session_factory() as db:
        user = User(
            id=test_user_id,
            email=test_user_email,
            balance=0,
            role="basic",
            is_active=True,
        )
        seller = User(
            id=seller_user_id,
            email=seller_email,
            balance=0,
            role="basic",
            is_active=True,
        )
        admin = User(
            id=admin_user_id,
            email=admin_email,
            balance=0,
            role="owner",
            is_active=True,
        )
        db.add_all([user, seller, admin])
        await db.commit()

    yield {
        "user_id": test_user_id,
        "seller_id": seller_user_id,
        "admin_id": admin_user_id,
    }

    # Strict cleanup in reverse dependency order (RESTRICT compliance)
    user_ids = [test_user_id, seller_user_id, admin_user_id]
    async with async_session_factory() as db:
        await db.execute(delete(RedeemCode).where(RedeemCode.created_by.in_(user_ids)))
        await db.execute(delete(TelegramAccount).where(
            (TelegramAccount.user_id.in_(user_ids)) | (TelegramAccount.seller_id.in_(user_ids))
        ))
        await db.execute(delete(WalletLedger).where(WalletLedger.user_id.in_(user_ids)))
        await db.execute(delete(User).where(User.id.in_(user_ids)))
        await db.commit()


@pytest.mark.asyncio
async def test_sec08_direct_ledger_mutations_and_invariants(sec08_users):
    """Test CREDIT/DEBIT atomic balance changes and validation invariants."""
    test_user_id = sec08_users["user_id"]

    async with async_session_factory() as db:
        res = await db.execute(select(User).where(User.id == test_user_id).with_for_update())
        u = res.scalar_one()

        # 1. Record CREDIT
        credit_entry = await record_ledger_entry(
            db=db,
            user=u,
            amount=100_000,
            entry_type="CREDIT",
            category="topup",
            reference_id="TX-TEST-001",
            description="Initial test deposit",
        )
        assert u.balance == 100_000
        assert credit_entry.balance_before == 0
        assert credit_entry.balance_after == 100_000
        assert credit_entry.amount == 100_000

        # 2. Record DEBIT
        debit_entry = await record_ledger_entry(
            db=db,
            user=u,
            amount=35_000,
            entry_type="DEBIT",
            category="order_smm",
            reference_id="ORD-SMM-001",
            description="SMM Order 1",
        )
        assert u.balance == 65_000
        assert debit_entry.balance_before == 100_000
        assert debit_entry.balance_after == 65_000
        assert debit_entry.amount == 35_000

        # 3. Attempt Overdraft
        with pytest.raises(ValueError, match="Saldo tidak mencukupi"):
            await record_ledger_entry(
                db=db,
                user=u,
                amount=70_000,
                entry_type="DEBIT",
                category="order_smm",
            )

        # 4. Attempt zero/negative amount
        with pytest.raises(ValueError):
            await record_ledger_entry(
                db=db,
                user=u,
                amount=0,
                entry_type="CREDIT",
                category="topup",
            )

        # 5. Attempt invalid entry type
        with pytest.raises(ValueError):
            await record_ledger_entry(
                db=db,
                user=u,
                amount=10_000,
                entry_type="INVALID_TYPE",
                category="topup",
            )

        await db.commit()


@pytest.mark.asyncio
async def test_sec08_sql_check_constraints(sec08_users):
    """Test SQL database level check constraints on wallet_ledgers table."""
    test_user_id = sec08_users["user_id"]

    async with async_session_factory() as db:
        # Test chk_ledger_amount_positive
        with pytest.raises(IntegrityError):
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
        await db.rollback()

        # Test chk_ledger_entry_type
        with pytest.raises(IntegrityError):
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
        await db.rollback()


@pytest.mark.asyncio
async def test_sec08_reconciliation_engine_and_tamper_detection(sec08_users):
    """Test balance reconciliation engine and detection of unauthorized direct DB modifications."""
    test_user_id = sec08_users["user_id"]

    async with async_session_factory() as db:
        res = await db.execute(select(User).where(User.id == test_user_id).with_for_update())
        u = res.scalar_one()

        await record_ledger_entry(
            db=db,
            user=u,
            amount=100_000,
            entry_type="CREDIT",
            category="topup",
        )
        await record_ledger_entry(
            db=db,
            user=u,
            amount=35_000,
            entry_type="DEBIT",
            category="order_smm",
        )
        await db.commit()

        # Reconcile valid state
        recon = await reconcile_user_balance(db, test_user_id)
        assert str(recon["user_id"]) == str(test_user_id)
        assert recon["total_credits"] == 100_000
        assert recon["total_debits"] == 35_000
        assert recon["computed_balance"] == 65_000
        assert recon["actual_balance"] == 65_000
        assert recon["is_reconciled"] is True
        assert recon["discrepancy"] == 0

        # Simulate direct unauthorized SQL balance modification
        await db.execute(
            text("UPDATE users SET balance = 999999 WHERE id = :uid"),
            {"uid": str(test_user_id)},
        )
        await db.commit()
        db.expire_all()

        recon_tampered = await reconcile_user_balance(db, test_user_id)
        assert recon_tampered["actual_balance"] == 999999
        assert recon_tampered["computed_balance"] == 65_000
        assert recon_tampered["is_reconciled"] is False
        assert recon_tampered["discrepancy"] == 999999 - 65_000

        # Restore balance
        await db.execute(
            text("UPDATE users SET balance = 65000 WHERE id = :uid"),
            {"uid": str(test_user_id)},
        )
        await db.commit()
        db.expire_all()


@pytest.mark.asyncio
async def test_sec08_ledger_statement_and_admin_reconcile_api(sec08_users):
    """Test ledger pagination, category filter, and admin reconciliation endpoint."""
    test_user_id = sec08_users["user_id"]
    admin_user_id = sec08_users["admin_id"]

    async with async_session_factory() as db:
        res = await db.execute(select(User).where(User.id == test_user_id).with_for_update())
        u = res.scalar_one()

        await record_ledger_entry(
            db=db,
            user=u,
            amount=100_000,
            entry_type="CREDIT",
            category="topup",
        )
        await asyncio.sleep(0.02)
        await record_ledger_entry(
            db=db,
            user=u,
            amount=35_000,
            entry_type="DEBIT",
            category="order_smm",
        )
        await db.commit()

        # Query via service
        entries, total = await get_user_ledger_entries(db, test_user_id, limit=10, offset=0)
        assert total == 2
        assert len(entries) == 2
        assert {e.entry_type for e in entries} == {"CREDIT", "DEBIT"}
        assert entries[0].entry_type == "DEBIT"
        assert entries[1].entry_type == "CREDIT"

        topup_entries, topup_total = await get_user_ledger_entries(
            db, test_user_id, category="topup"
        )
        assert topup_total == 1
        assert topup_entries[0].category == "topup"

        # Query via get_my_ledger endpoint
        endpoint_res = await get_my_ledger(
            entry_type="DEBIT",
            category=None,
            limit=10,
            offset=0,
            db=db,
            current_user=u,
        )
        assert endpoint_res.total == 1
        assert endpoint_res.entries[0].entry_type == "DEBIT"
        assert endpoint_res.entries[0].amount == 35_000

        # Admin reconcile endpoint
        res_admin = await db.execute(select(User).where(User.id == admin_user_id))
        cur_admin = res_admin.scalar_one()

        admin_recon = await admin_reconcile_user_balance(
            user_id=test_user_id,
            db=db,
            current_user=cur_admin,
        )
        assert admin_recon.is_reconciled is True
        assert admin_recon.discrepancy == 0


@pytest.mark.asyncio
async def test_sec08_integrated_balance_mutations(sec08_users):
    """Test admin adjustments, voucher redemption, and marketplace purchase integrations."""
    test_user_id = sec08_users["user_id"]
    seller_user_id = sec08_users["seller_id"]
    admin_user_id = sec08_users["admin_id"]

    mock_req = MockRequest()

    async with async_session_factory() as db:
        res_admin = await db.execute(select(User).where(User.id == admin_user_id))
        cur_admin = res_admin.scalar_one()

        # 1. Admin credit 25_000
        adj_add = await update_user_balance(
            request=mock_req,
            payload=UpdateBalanceRequest(user_id=str(test_user_id), amount=25_000),
            db=db,
            current_user=cur_admin,
        )
        assert adj_add.balance == 25_000

        # 2. Admin debit 10_000
        adj_deduct = await update_user_balance(
            request=mock_req,
            payload=UpdateBalanceRequest(user_id=str(test_user_id), amount=-10_000),
            db=db,
            current_user=cur_admin,
        )
        assert adj_deduct.balance == 15_000
        await db.commit()

        recon1 = await reconcile_user_balance(db, test_user_id)
        assert recon1["actual_balance"] == 15_000
        assert recon1["is_reconciled"] is True

        # 3. Voucher redemption
        voucher_code = f"TESTVOUCH{uuid.uuid4().hex[:6].upper()}"
        v_code = RedeemCode(
            code=voucher_code,
            code_type="balance",
            amount=50_000,
            max_uses=1,
            used_count=0,
            is_active=True,
            created_by=admin_user_id,
        )
        db.add(v_code)
        await db.commit()

        res_user = await db.execute(select(User).where(User.id == test_user_id))
        cur_user = res_user.scalar_one()

        redeem_res = await redeem_code(db, cur_user, voucher_code)
        assert redeem_res["balance_added"] == 50_000
        assert cur_user.balance == 65_000
        await db.commit()

        recon2 = await reconcile_user_balance(db, test_user_id)
        assert recon2["actual_balance"] == 65_000
        assert recon2["is_reconciled"] is True

        # 4. Marketplace purchase: seller lists account, buyer purchases
        res_seller = await db.execute(select(User).where(User.id == seller_user_id))
        seller = res_seller.scalar_one()

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

        bought_acc = await buy_account(db, cur_user, acc.id)
        assert bought_acc.user_id == cur_user.id
        assert bought_acc.for_sale is False
        assert cur_user.balance == 45_000
        assert seller.balance == 20_000
        await db.commit()

        buyer_recon = await reconcile_user_balance(db, cur_user.id)
        assert buyer_recon["actual_balance"] == 45_000
        assert buyer_recon["is_reconciled"] is True

        seller_recon = await reconcile_user_balance(db, seller.id)
        assert seller_recon["actual_balance"] == 20_000
        assert seller_recon["is_reconciled"] is True
