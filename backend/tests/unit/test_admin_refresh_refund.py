"""Unit tests verifying automatic refund and notification integration on admin single order refresh.

Addresses CONS-03 (TASK-04 in REMEDIATION_ROADMAP.md):
- When an admin refreshes a single order via admin_smm_service.refresh_order_status,
  and the provider status is terminal (Canceled, Error, Partial),
  process_order_refund_if_eligible MUST be executed immediately.
- Notifications (wallet.refund_received and order.status_changed) must be created.
- Completed orders must not be refunded.
"""

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4
import pytest

from app.models.order import Order
from app.models.user import User
from app.services import admin_smm_service


@pytest.mark.asyncio
async def test_admin_refresh_order_status_triggers_full_refund_on_canceled():
    """Verify TASK-04: admin_smm_service.refresh_order_status triggers 100% refund when status changes to Canceled."""
    db = AsyncMock()
    user_id = uuid4()
    order_id = uuid4()

    user = User(id=user_id, email="customer@example.com", balance=10_000)
    order = Order(
        id=order_id,
        user_id=user_id,
        smm_order_id="buzzer_999",
        service_id=101,
        service_name="Telegram Post Views",
        category="Telegram",
        data_target="https://t.me/channel/1",
        quantity=1000,
        price=50,
        total_price=50_000,
        status="Processing",
        remains=1000,
        is_refunded=False,
        refunded_amount=0,
    )

    mock_order_res = MagicMock()
    mock_order_res.scalar_one_or_none.return_value = order

    mock_user_res = MagicMock()
    mock_user_res.scalar_one_or_none.return_value = user

    db.execute.side_effect = [mock_order_res, mock_user_res]

    provider_response = {
        "status": True,
        "data": {
            "status": "Canceled",
            "start_count": "100",
            "remains": "1000",
        },
    }

    with (
        patch("app.services.admin_smm_service.smm_api.check_order_status", new=AsyncMock(return_value=provider_response)),
        patch("app.services.order_service.record_ledger_entry", new=AsyncMock()) as mock_ledger,
        patch("app.services.order_service.create_notification", new=MagicMock()) as mock_user_notify,
        patch("app.services.notification_service.create_notification", new=MagicMock()) as mock_status_notify,
    ):
        refreshed_order = await admin_smm_service.refresh_order_status(db, order)

        assert refreshed_order.status == "Canceled"
        assert refreshed_order.is_refunded is True
        assert refreshed_order.refunded_amount == 50_000

        # Verify ledger credited the full price
        mock_ledger.assert_awaited_once()
        _, ledger_kwargs = mock_ledger.call_args
        assert ledger_kwargs["amount"] == 50_000
        assert ledger_kwargs["entry_type"] == "CREDIT"
        assert ledger_kwargs["category"] == "order_smm_refund"
        assert ledger_kwargs["user"] == user

        # Verify wallet.refund_received notification
        mock_user_notify.assert_called_once()
        _, user_notify_args, _ = mock_user_notify.mock_calls[0]
        assert user_notify_args[2] == "wallet.refund_received"

        # Verify order.status_changed notification
        mock_status_notify.assert_called_once()
        _, status_notify_args, _ = mock_status_notify.mock_calls[0]
        assert status_notify_args[2] == "order.status_changed"

        db.flush.assert_awaited_once()


@pytest.mark.asyncio
async def test_admin_refresh_order_status_triggers_prorated_refund_on_partial():
    """Verify TASK-04: admin_smm_service.refresh_order_status triggers prorated refund when status changes to Partial."""
    db = AsyncMock()
    user_id = uuid4()
    order_id = uuid4()

    user = User(id=user_id, email="customer@example.com", balance=5_000)
    order = Order(
        id=order_id,
        user_id=user_id,
        smm_order_id="buzzer_888",
        service_id=102,
        service_name="Telegram Channel Members",
        category="Telegram",
        data_target="https://t.me/channel",
        quantity=1000,
        price=60,
        total_price=60_000,
        status="Processing",
        remains=1000,
        is_refunded=False,
        refunded_amount=0,
    )

    mock_order_res = MagicMock()
    mock_order_res.scalar_one_or_none.return_value = order

    mock_user_res = MagicMock()
    mock_user_res.scalar_one_or_none.return_value = user

    db.execute.side_effect = [mock_order_res, mock_user_res]

    # Partial: 400 remains out of 1000 -> (60_000 * 400) // 1000 = 24_000
    provider_response = {
        "status": True,
        "data": {
            "status": "Partial",
            "start_count": "50",
            "remains": "400",
        },
    }

    with (
        patch("app.services.admin_smm_service.smm_api.check_order_status", new=AsyncMock(return_value=provider_response)),
        patch("app.services.order_service.record_ledger_entry", new=AsyncMock()) as mock_ledger,
        patch("app.services.order_service.create_notification", new=MagicMock()),
        patch("app.services.notification_service.create_notification", new=MagicMock()),
    ):
        refreshed_order = await admin_smm_service.refresh_order_status(db, order)

        assert refreshed_order.status == "Partial"
        assert refreshed_order.is_refunded is True
        assert refreshed_order.refunded_amount == 24_000

        mock_ledger.assert_awaited_once()
        _, ledger_kwargs = mock_ledger.call_args
        assert ledger_kwargs["amount"] == 24_000

        db.flush.assert_awaited_once()


@pytest.mark.asyncio
async def test_admin_refresh_order_status_no_refund_on_completed():
    """Completed orders must update status and notify without issuing any refund."""
    db = AsyncMock()
    user_id = uuid4()
    order_id = uuid4()

    order = Order(
        id=order_id,
        user_id=user_id,
        smm_order_id="buzzer_777",
        service_id=103,
        service_name="Telegram Reactions",
        category="Reactions",
        data_target="https://t.me/post/1",
        quantity=500,
        price=10,
        total_price=5_000,
        status="Processing",
        remains=500,
        is_refunded=False,
        refunded_amount=0,
    )

    provider_response = {
        "status": True,
        "data": {
            "status": "Completed",
            "start_count": "10",
            "remains": "0",
        },
    }

    with (
        patch("app.services.admin_smm_service.smm_api.check_order_status", new=AsyncMock(return_value=provider_response)),
        patch("app.services.order_service.record_ledger_entry", new=AsyncMock()) as mock_ledger,
        patch("app.services.notification_service.create_notification", new=MagicMock()) as mock_notify,
    ):
        refreshed_order = await admin_smm_service.refresh_order_status(db, order)

        assert refreshed_order.status == "Completed"
        assert refreshed_order.remains == 0
        assert refreshed_order.is_refunded is False
        assert refreshed_order.refunded_amount == 0

        # No refund ledger calls
        mock_ledger.assert_not_called()

        # Status changed notification created with success kind
        mock_notify.assert_called_once()
        _, notify_args, _ = mock_notify.mock_calls[0]
        assert notify_args[2] == "order.status_changed"

        db.flush.assert_awaited_once()


@pytest.mark.asyncio
async def test_admin_refresh_order_status_skips_when_no_smm_order_id():
    """Orders without smm_order_id must return untouched without provider calls."""
    db = AsyncMock()
    order = Order(
        id=uuid4(),
        user_id=uuid4(),
        smm_order_id=None,
        status="Pending",
    )

    with patch("app.services.admin_smm_service.smm_api.check_order_status", new=AsyncMock()) as mock_api:
        res = await admin_smm_service.refresh_order_status(db, order)
        assert res is order
        mock_api.assert_not_called()
        db.flush.assert_not_awaited()
