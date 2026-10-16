"""Unit tests for user activity history aggregation service and endpoint."""

from datetime import datetime, timezone
import uuid
import pytest
import pytest_asyncio
from sqlalchemy import delete

from app.database import async_session_factory
from app.models.account_audit_log import AccountAuditLog
from app.models.order import Order
from app.models.user import User
from app.models.wallet_transaction import WalletTransaction
from app.services.activity_history_service import (
    calculate_activity_metrics,
    format_wib_datetime,
    get_user_activity_history,
)


@pytest_asyncio.fixture
async def db_session():
    async with async_session_factory() as session:
        yield session


@pytest.mark.asyncio
async def test_format_wib_datetime():
    dt = datetime(2026, 10, 14, 2, 30, tzinfo=timezone.utc)
    date_id, time_id = format_wib_datetime(dt, locale="id")
    assert "2026" in date_id
    assert "WIB" in time_id

    date_en, time_en = format_wib_datetime(dt, locale="en")
    assert "2026" in date_en
    assert "WIB" in time_en


@pytest.mark.asyncio
async def test_calculate_activity_metrics_empty(db_session):
    user = User(
        id=uuid.uuid4(),
        email=f"test_metrics_{uuid.uuid4().hex[:8]}@example.com",
        role="basic",
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()

    try:
        metrics = await calculate_activity_metrics(db_session, user.id)
        assert metrics.total_orders == 0
        assert metrics.total_spend == 0
        assert metrics.success_rate == "100.0"
        assert metrics.in_progress_count == 0
        assert metrics.completed_count == 0
    finally:
        await db_session.execute(delete(User).where(User.id == user.id))
        await db_session.commit()


@pytest.mark.asyncio
async def test_get_user_activity_history_unified(db_session):
    user = User(
        id=uuid.uuid4(),
        email=f"test_unified_{uuid.uuid4().hex[:8]}@example.com",
        role="basic",
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()

    # 1. SMM Order
    smm_order = Order(
        id=uuid.uuid4(),
        user_id=user.id,
        service_id=101,
        service_name="Telegram Reaction",
        category="Telegram",
        data_target="@mychannel",
        quantity=500,
        price=10,
        total_price=5000,
        status="Success",
        is_mass_order=False,
    )
    db_session.add(smm_order)

    # 2. Account Log
    acct_log = AccountAuditLog(
        id=uuid.uuid4(),
        user_id=user.id,
        action="buy",
        price=25000,
        phone="+628123456789",
        telegram_id=12345678,
    )
    db_session.add(acct_log)

    # 3. Wallet Transaction Topup
    topup_tx = WalletTransaction(
        id=f"TRX-TOPUP-{uuid.uuid4().hex[:6]}",
        user_id=user.id,
        type="topup",
        amount=50000,
        method="QRIS",
        note="Deposit via QRIS",
        status="approved",
    )
    db_session.add(topup_tx)

    # 4. Wallet Transaction Withdraw
    wd_tx = WalletTransaction(
        id=f"TRX-WD-{uuid.uuid4().hex[:6]}",
        user_id=user.id,
        type="withdraw",
        amount=20000,
        method="BCA",
        note="12345678 a.n Test",
        status="pending",
    )
    db_session.add(wd_tx)

    await db_session.commit()

    try:
        # Test "all" tab
        resp = await get_user_activity_history(db_session, user, tab="all", page=1, page_size=10)
        assert resp.pagination.total_items == 4
        assert len(resp.items) == 4
        assert resp.metrics.total_orders == 4
        assert resp.metrics.total_smm == 1
        assert resp.metrics.total_accounts == 1
        assert resp.metrics.total_deposits == 1
        assert resp.metrics.total_withdrawals == 1
        assert resp.metrics.completed_count == 3
        assert resp.metrics.in_progress_count == 1

        # Verify SMM tab filtering
        smm_resp = await get_user_activity_history(db_session, user, tab="smm", page=1, page_size=10)
        assert smm_resp.pagination.total_items == 1
        assert smm_resp.items[0].type == "smm"
        assert smm_resp.items[0].detail == "@mychannel"
        assert smm_resp.items[0].status == "Selesai"

        # Verify Accounts tab filtering
        acct_resp = await get_user_activity_history(db_session, user, tab="accounts", page=1, page_size=10)
        assert acct_resp.pagination.total_items == 1
        assert acct_resp.items[0].type == "telegram_account"
        assert acct_resp.items[0].phone == "+628123456789"
        assert acct_resp.items[0].telegram_id == 12345678

        # Verify Deposits tab filtering
        dep_resp = await get_user_activity_history(db_session, user, tab="deposits", page=1, page_size=10)
        assert dep_resp.pagination.total_items == 1
        assert dep_resp.items[0].type == "deposit"
        assert "+Rp 50,000" in dep_resp.items[0].price_display

        # Verify Withdrawals tab filtering
        wd_resp = await get_user_activity_history(db_session, user, tab="withdrawals", page=1, page_size=10)
        assert wd_resp.pagination.total_items == 1
        assert wd_resp.items[0].type == "withdraw"
        assert wd_resp.items[0].status == "Menunggu"
        assert "-Rp 20,000" in wd_resp.items[0].price_display

        # Verify Status filter
        pending_resp = await get_user_activity_history(db_session, user, tab="all", status="Menunggu")
        assert pending_resp.pagination.total_items == 1
        assert pending_resp.items[0].type == "withdraw"

        # Verify Search filter
        search_resp = await get_user_activity_history(db_session, user, tab="all", search="@mychannel")
        assert search_resp.pagination.total_items == 1
        assert search_resp.items[0].type == "smm"

        # Verify Pagination
        page1_resp = await get_user_activity_history(db_session, user, tab="all", page=1, page_size=2)
        assert len(page1_resp.items) == 2
        assert page1_resp.pagination.total_pages == 2
        assert page1_resp.pagination.page == 1

        page2_resp = await get_user_activity_history(db_session, user, tab="all", page=2, page_size=2)
        assert len(page2_resp.items) == 2
        assert page2_resp.pagination.page == 2
    finally:
        await db_session.execute(delete(Order).where(Order.user_id == user.id))
        await db_session.execute(delete(AccountAuditLog).where(AccountAuditLog.user_id == user.id))
        await db_session.execute(delete(WalletTransaction).where(WalletTransaction.user_id == user.id))
        await db_session.execute(delete(User).where(User.id == user.id))
        await db_session.commit()


@pytest.mark.asyncio
async def test_get_activity_history_endpoint_function(db_session):
    from app.api.orders import get_activity_history

    user = User(
        id=uuid.uuid4(),
        email=f"test_ep_{uuid.uuid4().hex[:8]}@example.com",
        role="basic",
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()

    try:
        resp = await get_activity_history(
            tab="all",
            search=None,
            status="all",
            start_date=None,
            end_date=None,
            sort_by="date",
            sort_order="desc",
            page=1,
            page_size=20,
            locale="id",
            db=db_session,
            user=user,
        )
        assert resp.pagination.page == 1
        assert resp.pagination.page_size == 20
        assert resp.metrics.total_orders == 0
    finally:
        await db_session.execute(delete(User).where(User.id == user.id))
        await db_session.commit()


@pytest.mark.asyncio
async def test_sold_listing_settles_into_one_order(db_session):
    """A listing + its later sale is ONE order (same id), resolved as Selesai.

    Previously the listing stayed "Proses" forever and the sale spawned a second
    order id, so an in-progress order could never complete.
    """
    from datetime import timedelta

    user = User(
        id=uuid.uuid4(),
        email=f"test_settle_{uuid.uuid4().hex[:8]}@example.com",
        role="basic",
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()

    now = datetime.now(timezone.utc)
    listing = AccountAuditLog(
        id=uuid.uuid4(),
        user_id=user.id,
        action="list_for_sale",
        price=7000,
        phone="60179876877",
        telegram_id=555,
        created_at=now - timedelta(hours=2),
    )
    sell = AccountAuditLog(
        id=uuid.uuid4(),
        user_id=user.id,
        action="sell",
        price=7000,
        phone="60179876877",
        telegram_id=555,
        created_at=now - timedelta(hours=1),
    )
    db_session.add_all([listing, sell])
    await db_session.commit()

    try:
        resp = await get_user_activity_history(db_session, user, tab="accounts", page=1, page_size=10)
        assert resp.pagination.total_items == 1
        item = resp.items[0]
        assert item.id == str(listing.id)  # same order id as the listing
        assert item.status == "Selesai"
        assert resp.metrics.in_progress_count == 0
        assert resp.metrics.completed_count == 1
        assert resp.metrics.total_accounts == 1
    finally:
        await db_session.execute(delete(AccountAuditLog).where(AccountAuditLog.user_id == user.id))
        await db_session.execute(delete(User).where(User.id == user.id))
        await db_session.commit()


@pytest.mark.asyncio
async def test_active_listing_stays_in_progress(db_session):
    """A listing with no sale/delist yet is the only genuinely in-progress one."""
    user = User(
        id=uuid.uuid4(),
        email=f"test_active_{uuid.uuid4().hex[:8]}@example.com",
        role="basic",
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()

    listing = AccountAuditLog(
        id=uuid.uuid4(),
        user_id=user.id,
        action="list_for_sale",
        price=7000,
        phone="60179876877",
        telegram_id=777,
    )
    db_session.add(listing)
    await db_session.commit()

    try:
        resp = await get_user_activity_history(db_session, user, tab="accounts", page=1, page_size=10)
        assert resp.pagination.total_items == 1
        assert resp.items[0].status == "Proses"
        assert resp.metrics.in_progress_count == 1
        assert resp.metrics.completed_count == 0
    finally:
        await db_session.execute(delete(AccountAuditLog).where(AccountAuditLog.user_id == user.id))
        await db_session.execute(delete(User).where(User.id == user.id))
        await db_session.commit()
