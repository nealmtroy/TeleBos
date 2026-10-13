"""Unit tests verifying fail-closed semantics for SMM order creation on KlikQRIS gateway failure.

Addresses EXT-01 / REL-04 (TASK-06 in REMEDIATION_ROADMAP.md):
- When user balance is insufficient and KlikQRIS is unconfigured or fails (timeout / HTTP error),
  order creation must fail-closed immediately.
- No zombie Order records in 'Awaiting Payment' and no pending WalletTransaction rows
  must be persisted.
- API endpoints map gateway RuntimeError to HTTP 502 Bad Gateway and cleanly clear idempotency locks.
"""

from unittest.mock import AsyncMock, MagicMock, patch
import uuid
import pytest
from fastapi import HTTPException

from app.api.orders import place_single_order, place_mass_order
from app.models.order import Order
from app.models.user import User
from app.models.wallet_transaction import WalletTransaction
from app.schemas.order import OrderCreate, MassOrderCreate, MassOrderItem
from app.services import order_service
from app.smm_service_ids import ALLOWED_SMM_SERVICE_IDS


class FakeScalarResult:
    def __init__(self, item):
        self._item = item

    def scalar_one(self):
        return self._item

    def scalar(self):
        return self._item


class MockClient:
    def __init__(self, host: str = "127.0.0.1"):
        self.host = host


class MockRequest:
    def __init__(self, client_host: str = "127.0.0.1"):
        self.client = MockClient(client_host)
        self.headers = {}


@pytest.fixture
def allowed_service_id():
    return next(iter(ALLOWED_SMM_SERVICE_IDS))


@pytest.mark.asyncio
async def test_place_order_fails_closed_when_qris_gateway_throws(allowed_service_id):
    """When KlikQRIS transaction creation throws an error, place_order must raise RuntimeError

    and NEVER persist Order or WalletTransaction records.
    """
    user_id = uuid.uuid4()
    test_user = User(
        id=user_id,
        email="test_user@example.com",
        balance=0,  # Insufficient balance
    )

    db = AsyncMock()
    # Mock row lock select(User).where(...).with_for_update()
    db.execute.return_value = FakeScalarResult(test_user)
    db.add = MagicMock()

    effective_price_tuple = (
        1000,  # price_per_unit
        "Telegram Post Views",  # service_name
        "Views",  # category
        10,  # min_qty
        10000,  # max_qty
        500,  # original_rate
        1000,  # final_rate
    )

    with (
        patch("app.services.order_service._get_effective_price", new=AsyncMock(return_value=effective_price_tuple)),
        patch("app.services.order_service.is_klikqris_configured", return_value=True),
        patch(
            "app.services.order_service.create_qris_transaction",
            new=AsyncMock(side_effect=RuntimeError("Connection timed out to KlikQRIS")),
        ),
    ):
        with pytest.raises(RuntimeError, match="Gagal menghubungi gateway pembayaran KlikQRIS"):
            await order_service.place_order(
                db=db,
                user=test_user,
                service_id=allowed_service_id,
                data_target="https://t.me/telebos_channel/1",
                quantity=100,
            )

    # Verify no Order or WalletTransaction was added to session or committed
    for call_arg in db.add.call_args_list:
        obj = call_arg[0][0]
        assert not isinstance(obj, Order), "Order must not be added when KlikQRIS fails"
        assert not isinstance(obj, WalletTransaction), "WalletTransaction must not be added when KlikQRIS fails"

    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_place_order_fails_closed_when_qris_returns_empty_qr(allowed_service_id):
    """If KlikQRIS returns a response without valid qris_url or qris_image, order creation must abort

    preventing zombie invoice creation.
    """
    user_id = uuid.uuid4()
    test_user = User(
        id=user_id,
        email="test_user@example.com",
        balance=0,
    )

    db = AsyncMock()
    db.execute.return_value = FakeScalarResult(test_user)
    db.add = MagicMock()

    effective_price_tuple = (1000, "Telegram Post Views", "Views", 10, 10000, 500, 1000)

    with (
        patch("app.services.order_service._get_effective_price", new=AsyncMock(return_value=effective_price_tuple)),
        patch("app.services.order_service.is_klikqris_configured", return_value=True),
        patch(
            "app.services.order_service.create_qris_transaction",
            new=AsyncMock(return_value={"qris_url": None, "qris_image": None, "signature": "abc"}),
        ),
    ):
        with pytest.raises(RuntimeError, match="tidak mengembalikan barcode QRIS yang valid"):
            await order_service.place_order(
                db=db,
                user=test_user,
                service_id=allowed_service_id,
                data_target="https://t.me/telebos_channel/1",
                quantity=100,
            )

    # Verify db was never modified
    for call_arg in db.add.call_args_list:
        obj = call_arg[0][0]
        assert not isinstance(obj, (Order, WalletTransaction))

    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_place_order_rejects_when_qris_not_configured_and_insufficient_balance(allowed_service_id):
    """If user has insufficient balance and QRIS is not configured, place_order must raise ValueError."""
    user_id = uuid.uuid4()
    test_user = User(
        id=user_id,
        email="test_user@example.com",
        balance=0,
    )

    db = AsyncMock()
    db.execute.return_value = FakeScalarResult(test_user)
    db.add = MagicMock()

    effective_price_tuple = (1000, "Telegram Post Views", "Views", 10, 10000, 500, 1000)

    with (
        patch("app.services.order_service._get_effective_price", new=AsyncMock(return_value=effective_price_tuple)),
        patch("app.services.order_service.is_klikqris_configured", return_value=False),
    ):
        with pytest.raises(ValueError, match="gateway pembayaran QRIS belum dikonfigurasi"):
            await order_service.place_order(
                db=db,
                user=test_user,
                service_id=allowed_service_id,
                data_target="https://t.me/telebos_channel/1",
                quantity=100,
            )

    db.add.assert_not_called()
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_place_mass_orders_fails_closed_when_qris_gateway_throws(allowed_service_id):
    """Mass orders must also fail-closed without persisting any orders or invoices."""
    user_id = uuid.uuid4()
    test_user = User(
        id=user_id,
        email="test_mass@example.com",
        balance=0,
    )

    db = AsyncMock()
    db.execute.return_value = FakeScalarResult(test_user)
    db.add = MagicMock()

    effective_price_tuple = (1000, "Telegram Post Views", "Views", 10, 10000, 500, 1000)

    orders_data = [
        {"service_id": allowed_service_id, "data_target": "https://t.me/chan1", "quantity": 50},
        {"service_id": allowed_service_id, "data_target": "https://t.me/chan2", "quantity": 50},
    ]

    with (
        patch("app.services.order_service._get_effective_price", new=AsyncMock(return_value=effective_price_tuple)),
        patch("app.services.order_service.is_klikqris_configured", return_value=True),
        patch(
            "app.services.order_service.create_qris_transaction",
            new=AsyncMock(side_effect=RuntimeError("KlikQRIS HTTP 500 Down")),
        ),
    ):
        with pytest.raises(RuntimeError, match="Gagal menghubungi gateway pembayaran KlikQRIS"):
            await order_service.place_mass_orders(
                db=db,
                user=test_user,
                orders_data=orders_data,
            )

    db.add.assert_not_called()
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_api_single_order_maps_runtime_error_to_http_502(allowed_service_id):
    """The FastAPI single order endpoint must map gateway RuntimeError to HTTP 502 Bad Gateway."""
    test_user = User(id=uuid.uuid4(), email="api_user@example.com", balance=0)
    payload = OrderCreate(
        service_id=allowed_service_id,
        data_target="https://t.me/channel/1",
        quantity=50,
    )

    mock_req = MockRequest()
    mock_db = AsyncMock()

    with (
        patch("app.api.orders.rate_limiter.check", new=AsyncMock(return_value=True)),
        patch(
            "app.services.order_service.place_order",
            new=AsyncMock(side_effect=RuntimeError("Gagal menghubungi gateway pembayaran KlikQRIS: Gateway Down")),
        ),
    ):
        with pytest.raises(HTTPException) as exc_info:
            await place_single_order(
                request=mock_req,
                payload=payload,
                db=mock_db,
                user=test_user,
            )

        assert exc_info.value.status_code == 502
        assert "gateway pembayaran KlikQRIS" in exc_info.value.detail


@pytest.mark.asyncio
async def test_api_mass_order_maps_runtime_error_to_http_502(allowed_service_id):
    """The FastAPI mass order endpoint must map gateway RuntimeError to HTTP 502 Bad Gateway."""
    test_user = User(id=uuid.uuid4(), email="api_mass@example.com", balance=0)
    payload = MassOrderCreate(
        orders=[
            MassOrderItem(
                service_id=allowed_service_id,
                data_target="https://t.me/mass/1",
                quantity=50,
            )
        ]
    )

    mock_req = MockRequest()
    mock_db = AsyncMock()

    with (
        patch("app.api.orders.rate_limiter.check", new=AsyncMock(return_value=True)),
        patch(
            "app.services.order_service.place_mass_orders",
            new=AsyncMock(side_effect=RuntimeError("Gagal menghubungi gateway pembayaran KlikQRIS: Timeout")),
        ),
    ):
        with pytest.raises(HTTPException) as exc_info:
            await place_mass_order(
                request=mock_req,
                payload=payload,
                db=mock_db,
                user=test_user,
            )

        assert exc_info.value.status_code == 502
        assert "gateway pembayaran KlikQRIS" in exc_info.value.detail
