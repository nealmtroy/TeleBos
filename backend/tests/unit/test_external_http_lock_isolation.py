"""Unit test suite for TASK-09 / CONS-04:
Verification that external HTTP gateway calls (create_qris_transaction / create_order)
are never executed while holding database row locks (with_for_update), preventing
database connection pool exhaustion under gateway latency.
"""

from unittest.mock import AsyncMock, MagicMock, patch
import uuid
import pytest

from app.models.telegram_account import TelegramAccount
from app.models.user import User
from app.services import order_service, marketplace_service
from app.smm_service_ids import ALLOWED_SMM_SERVICE_IDS


class FakeScalarResult:
    def __init__(self, item):
        self._item = item

    def scalar_one(self):
        return self._item

    def scalar_one_or_none(self):
        return self._item

    def scalar(self):
        return self._item


@pytest.fixture
def allowed_service_id():
    return next(iter(ALLOWED_SMM_SERVICE_IDS))


@pytest.mark.asyncio
async def test_place_order_releases_row_lock_before_qris_network_call(allowed_service_id):
    """When creating a QRIS invoice for an order with insufficient balance,

    the database row lock must be released (via db.rollback()) BEFORE calling
    create_qris_transaction().
    """
    user_id = uuid.uuid4()
    test_user = User(
        id=user_id,
        email="shopper@telebos.com",
        balance=0,  # Insufficient balance
    )

    call_sequence: list[str] = []

    async def fake_rollback():
        call_sequence.append("db.rollback")

    async def fake_create_qris(*args, **kwargs):
        call_sequence.append("create_qris_transaction")
        return {
            "qris_url": "https://qris.id/mock",
            "qris_image": "data:image/png;base64,mock",
            "signature": "sig123",
        }

    async def fake_commit():
        call_sequence.append("db.commit")

    db = AsyncMock()
    db.execute.return_value = FakeScalarResult(test_user)
    db.rollback = AsyncMock(side_effect=fake_rollback)
    db.commit = AsyncMock(side_effect=fake_commit)
    db.add = MagicMock()
    db.flush = AsyncMock()

    effective_price_tuple = (
        1000, "Telegram Post Views", "Views", 10, 10000, 500, 1000
    )

    with (
        patch("app.services.order_service._get_effective_price", new=AsyncMock(return_value=effective_price_tuple)),
        patch("app.services.order_service.is_klikqris_configured", return_value=True),
        patch("app.services.order_service.create_qris_transaction", new=AsyncMock(side_effect=fake_create_qris)),
    ):
        order = await order_service.place_order(
            db=db,
            user=test_user,
            service_id=allowed_service_id,
            data_target="https://t.me/channel/1",
            quantity=100,
        )

    assert order is not None
    assert order.status == "Awaiting Payment"

    # Verify that db.rollback (releasing row lock) happened BEFORE create_qris_transaction!
    assert "db.rollback" in call_sequence
    assert "create_qris_transaction" in call_sequence
    rollback_idx = call_sequence.index("db.rollback")
    qris_idx = call_sequence.index("create_qris_transaction")
    commit_idx = call_sequence.index("db.commit")

    assert rollback_idx < qris_idx, "Database row lock must be released before calling external QRIS HTTP gateway!"
    assert qris_idx < commit_idx, "Transaction commit for invoice must occur after gateway call succeeds!"


@pytest.mark.asyncio
async def test_place_mass_orders_releases_row_lock_before_qris_network_call(allowed_service_id):
    """place_mass_orders must release the row lock before creating mass order QRIS transaction."""
    user_id = uuid.uuid4()
    test_user = User(
        id=user_id,
        email="mass_shopper@telebos.com",
        balance=0,
    )

    call_sequence: list[str] = []

    async def fake_rollback():
        call_sequence.append("db.rollback")

    async def fake_create_qris(*args, **kwargs):
        call_sequence.append("create_qris_transaction")
        return {
            "qris_url": "https://qris.id/mock",
            "qris_image": "data:image/png;base64,mock",
            "signature": "sig123",
        }

    db = AsyncMock()
    db.execute.return_value = FakeScalarResult(test_user)
    db.rollback = AsyncMock(side_effect=fake_rollback)
    db.commit = AsyncMock()
    db.add = MagicMock()
    db.flush = AsyncMock()

    effective_price_tuple = (
        1000, "Telegram Post Views", "Views", 10, 10000, 500, 1000
    )

    with (
        patch("app.services.order_service._get_effective_price", new=AsyncMock(return_value=effective_price_tuple)),
        patch("app.services.order_service.is_klikqris_configured", return_value=True),
        patch("app.services.order_service.create_qris_transaction", new=AsyncMock(side_effect=fake_create_qris)),
    ):
        orders = await order_service.place_mass_orders(
            db=db,
            user=test_user,
            orders_data=[
                {"service_id": allowed_service_id, "data_target": "https://t.me/channel/1", "quantity": 100},
            ],
        )

    assert len(orders) == 1
    assert "db.rollback" in call_sequence
    assert "create_qris_transaction" in call_sequence
    assert call_sequence.index("db.rollback") < call_sequence.index("create_qris_transaction")


@pytest.mark.asyncio
async def test_buy_account_releases_row_locks_before_qris_network_call():
    """buy_account with insufficient balance must release TelegramAccount and User locks

    before calling create_qris_transaction().
    """
    buyer_id = uuid.uuid4()
    seller_id = uuid.uuid4()
    account_id = uuid.uuid4()

    buyer = User(id=buyer_id, email="buyer@telebos.com", balance=1000)
    seller = User(id=seller_id, email="seller@telebos.com", balance=5000)
    account = TelegramAccount(
        id=account_id,
        phone="+6281234567890",
        for_sale=True,
        is_sold=False,
        seller_id=seller_id,
        user_id=seller_id,
        buy_price=50000,
        sell_price=40000,
    )

    call_sequence: list[str] = []

    async def fake_rollback():
        call_sequence.append("db.rollback")

    async def fake_create_qris(*args, **kwargs):
        call_sequence.append("create_qris_transaction")
        return {
            "qris_url": "https://qris.id/mock",
            "qris_image": "data:image/png;base64,mock",
            "signature": "sig123",
        }

    async def fake_execute(stmt, *args, **kwargs):
        stmt_str = str(stmt)
        if "telegram_accounts" in stmt_str:
            return FakeScalarResult(account)
        if str(buyer_id) in stmt_str:
            return FakeScalarResult(buyer)
        if str(seller_id) in stmt_str:
            return FakeScalarResult(seller)
        return FakeScalarResult(buyer)

    db = AsyncMock()
    db.execute = AsyncMock(side_effect=fake_execute)
    db.rollback = AsyncMock(side_effect=fake_rollback)
    db.commit = AsyncMock()
    db.add = MagicMock()
    db.flush = AsyncMock()

    with (
        patch("app.services.marketplace_service.is_klikqris_configured", return_value=True),
        patch("app.services.marketplace_service.create_qris_transaction", new=AsyncMock(side_effect=fake_create_qris)),
    ):
        result_account = await marketplace_service.buy_account(
            db=db,
            user=buyer,
            account_id=str(account_id),
            allow_invoice=True,
        )

    assert result_account.payment_required is True
    assert "db.rollback" in call_sequence
    assert "create_qris_transaction" in call_sequence
    assert call_sequence.index("db.rollback") < call_sequence.index("create_qris_transaction")


@pytest.mark.asyncio
async def test_balance_order_commits_debit_before_smm_gateway_call(allowed_service_id):
    """When paying from balance, the debit must be committed before calling the SMM gateway."""
    user_id = uuid.uuid4()
    test_user = User(
        id=user_id,
        email="rich_shopper@telebos.com",
        balance=100000,  # Plentiful balance
    )

    call_sequence: list[str] = []

    async def fake_commit():
        call_sequence.append("db.commit")

    async def fake_create_order(*args, **kwargs):
        call_sequence.append("smm_create_order")
        return {"status": True, "data": {"id": 999123}}

    db = AsyncMock()
    db.execute.return_value = FakeScalarResult(test_user)
    db.commit = AsyncMock(side_effect=fake_commit)
    db.add = MagicMock()
    db.flush = AsyncMock()

    effective_price_tuple = (
        1000, "Telegram Post Views", "Views", 10, 10000, 500, 1000
    )

    with (
        patch("app.services.order_service._get_effective_price", new=AsyncMock(return_value=effective_price_tuple)),
        patch("app.services.order_service.record_ledger_entry", new=AsyncMock()),
        patch("app.services.order_service.create_order", new=AsyncMock(side_effect=fake_create_order)),
        patch("app.services.order_service.create_notification", new=MagicMock()),
    ):
        order = await order_service.place_order(
            db=db,
            user=test_user,
            service_id=allowed_service_id,
            data_target="https://t.me/channel/1",
            quantity=100,
        )

    assert order is not None
    assert order.status in ("Pending", "Processing")
    assert "db.commit" in call_sequence
    assert "smm_create_order" in call_sequence
    first_commit_idx = call_sequence.index("db.commit")
    smm_idx = call_sequence.index("smm_create_order")
    assert first_commit_idx < smm_idx, "Debit must be committed to release row lock before calling external SMM API!"
