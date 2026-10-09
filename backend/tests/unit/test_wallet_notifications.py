from datetime import datetime, timezone
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
import pytest

from app.api.wallet import admin_update_transaction_status, request_topup, request_withdraw
from app.models.wallet_transaction import WalletTransaction
from app.models.user import User
from app.schemas.wallet import AdminTransactionStatusUpdate, TopupCreateRequest, WithdrawCreateRequest


@pytest.mark.asyncio
async def test_topup_creates_notification(monkeypatch):
    user = User(id=uuid.uuid4(), email="user@telebos.test", balance=10000)
    mock_request = SimpleNamespace(client=SimpleNamespace(host="127.0.0.1"))
    payload = TopupCreateRequest(amount=50000, method="QRIS", note="Test topup")

    mock_db = MagicMock()
    mock_db.add = MagicMock()
    mock_db.flush = AsyncMock()

    # Disable rate limiter
    monkeypatch.setattr("app.api.wallet.rate_limiter.check", AsyncMock(return_value=True))
    monkeypatch.setattr("app.api.wallet.is_klikqris_configured", lambda: False)

    res = await request_topup(mock_request, payload, db=mock_db, current_user=user)
    assert res["status"] == "pending"

    # Verify db.add was called for both tx and notification
    added_items = [call.args[0] for call in mock_db.add.call_args_list]
    notifs = [item for item in added_items if getattr(item, "event", None) == "wallet.topup_created"]
    assert len(notifs) == 1
    assert notifs[0].kind == "info"
    assert notifs[0].data["amount"] == 50000
    assert notifs[0].data["method"] == "QRIS"
    assert notifs[0].href == f"/wallet/invoice/{res['id']}"


@pytest.mark.asyncio
async def test_withdraw_creates_notification(monkeypatch):
    user_id = uuid.uuid4()
    user = User(id=user_id, email="user@telebos.test", balance=100000)
    mock_request = SimpleNamespace(client=SimpleNamespace(host="127.0.0.1"))
    payload = WithdrawCreateRequest(amount=50000, method="BCA", note="12345678 a/n Test")

    mock_db = MagicMock()
    mock_db.add = MagicMock()
    mock_db.flush = AsyncMock()

    user_result = MagicMock()
    user_result.scalar_one_or_none.return_value = user
    mock_db.execute = AsyncMock(return_value=user_result)

    monkeypatch.setattr("app.api.wallet.rate_limiter.check", AsyncMock(return_value=True))

    res = await request_withdraw(mock_request, payload, db=mock_db, current_user=user)
    assert res.status == "pending"
    assert user.balance == 50000

    added_items = [call.args[0] for call in mock_db.add.call_args_list]
    notifs = [item for item in added_items if getattr(item, "event", None) == "wallet.withdraw_created"]
    assert len(notifs) == 1
    assert notifs[0].kind == "info"
    assert notifs[0].data["amount"] == 50000
    assert notifs[0].data["method"] == "BCA"


@pytest.mark.asyncio
async def test_admin_approve_topup_creates_notification():
    user = User(id=uuid.uuid4(), email="user@telebos.test", balance=10000)
    admin = User(id=uuid.uuid4(), email="admin@telebos.test", role="owner")
    tx = WalletTransaction(
        id="TB-INV-TEST",
        user_id=user.id,
        type="topup",
        amount=50000,
        method="QRIS",
        status="pending",
    )

    mock_db = MagicMock()
    mock_db.add = MagicMock()
    mock_db.flush = AsyncMock()

    tx_res = MagicMock()
    tx_res.scalar_one_or_none.return_value = tx
    user_res = MagicMock()
    user_res.scalar_one_or_none.return_value = user
    mock_db.execute = AsyncMock(side_effect=[tx_res, user_res])

    payload = AdminTransactionStatusUpdate(status="approved", admin_note="Payment confirmed")
    res = await admin_update_transaction_status("TB-INV-TEST", payload, db=mock_db, current_user=admin)
    assert res.status == "approved"
    assert user.balance == 60000

    added_items = [call.args[0] for call in mock_db.add.call_args_list]
    notifs = [item for item in added_items if getattr(item, "event", None) == "wallet.topup_approved"]
    assert len(notifs) == 1
    assert notifs[0].kind == "success"
    assert notifs[0].data["amount"] == 50000


@pytest.mark.asyncio
async def test_admin_reject_withdraw_creates_notification():
    user = User(id=uuid.uuid4(), email="user@telebos.test", balance=10000)
    admin = User(id=uuid.uuid4(), email="admin@telebos.test", role="owner")
    tx = WalletTransaction(
        id="TB-WD-TEST",
        user_id=user.id,
        type="withdraw",
        amount=50000,
        method="BCA",
        status="pending",
    )

    mock_db = MagicMock()
    mock_db.add = MagicMock()
    mock_db.flush = AsyncMock()

    tx_res = MagicMock()
    tx_res.scalar_one_or_none.return_value = tx
    user_res = MagicMock()
    user_res.scalar_one_or_none.return_value = user
    mock_db.execute = AsyncMock(side_effect=[tx_res, user_res])

    payload = AdminTransactionStatusUpdate(status="rejected", admin_note="Invalid account number")
    res = await admin_update_transaction_status("TB-WD-TEST", payload, db=mock_db, current_user=admin)
    assert res.status == "rejected"
    assert user.balance == 60000  # Refunded 10000 + 50000

    added_items = [call.args[0] for call in mock_db.add.call_args_list]
    notifs = [item for item in added_items if getattr(item, "event", None) == "wallet.withdraw_rejected"]
    assert len(notifs) == 1
    assert notifs[0].kind == "error"
    assert notifs[0].data["amount"] == 50000
    assert notifs[0].data["reason"] == "Invalid account number"
