"""Unit tests for KlikQRIS payment gateway integration."""

from datetime import datetime, timezone
import json
from unittest.mock import AsyncMock, MagicMock, patch
import uuid

import httpx
import pytest

from app.config import get_settings
from app.models.user import User
from app.models.wallet_transaction import WalletTransaction
from app.services.klikqris_service import (
    check_qris_status,
    close_klikqris_http_client,
    create_qris_transaction,
    get_klikqris_http_client,
    is_klikqris_configured,
    verify_signature,
)


def test_verify_signature():
    sig = "OxHsv2QLFEYd4xaeaRLcdxrs4r1oau1791494788"
    assert verify_signature(sig, sig) is True
    assert verify_signature(f"  {sig}  ", sig) is True
    assert verify_signature(sig, "different_signature") is False
    assert verify_signature(None, sig) is False
    assert verify_signature(sig, None) is False
    assert verify_signature("", sig) is False


def test_is_klikqris_configured(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "KLIKQRIS_API_KEY", "test_key")
    monkeypatch.setattr(settings, "KLIKQRIS_ID_MERCHANT", "test_merchant")
    assert is_klikqris_configured() is True

    monkeypatch.setattr(settings, "KLIKQRIS_API_KEY", "")
    assert is_klikqris_configured() is False

    monkeypatch.setattr(settings, "KLIKQRIS_API_KEY", "test_key")
    monkeypatch.setattr(settings, "KLIKQRIS_ID_MERCHANT", "")
    assert is_klikqris_configured() is False


@pytest.mark.asyncio
async def test_create_qris_transaction_not_configured(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "KLIKQRIS_API_KEY", "")
    with pytest.raises(ValueError, match="not configured"):
        await create_qris_transaction("TB-TEST-01", 50000)


@pytest.mark.asyncio
async def test_create_qris_transaction_success(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "KLIKQRIS_API_KEY", "mock_key")
    monkeypatch.setattr(settings, "KLIKQRIS_ID_MERCHANT", "12345")
    monkeypatch.setattr(settings, "KLIKQRIS_BASE_URL", "https://klikqris.com/api")

    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_client.is_closed = False

    fake_resp = MagicMock(spec=httpx.Response)
    fake_resp.status_code = 201
    fake_resp.content = b'{"status": true}'
    fake_resp.json.return_value = {
        "status": True,
        "message": "QRIS Berhasil Dibuat",
        "data": {
            "order_id": "TB-TEST-01",
            "amount": 50000,
            "total_amount": 50123,
            "signature": "sig123456",
            "qris_url": "https://klikqris.com/pay/TB-TEST-01",
            "qris_image": "data:image/png;base64,iVBORw0KGgo...",
            "expired_at": "2026-10-09 05:00:00",
        },
    }
    mock_client.post.return_value = fake_resp

    with patch("app.services.klikqris_service.get_klikqris_http_client", return_value=mock_client):
        data = await create_qris_transaction(
            order_id="TB-TEST-01",
            amount=50000,
            keterangan="Topup User",
            callback_url="https://telebos.com/callback",
        )

        assert data["order_id"] == "TB-TEST-01"
        assert data["total_amount"] == 50123
        assert data["signature"] == "sig123456"
        assert data["qris_url"] == "https://klikqris.com/pay/TB-TEST-01"
        mock_client.post.assert_awaited_once()


@pytest.mark.asyncio
async def test_create_qris_transaction_failure(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "KLIKQRIS_API_KEY", "mock_key")
    monkeypatch.setattr(settings, "KLIKQRIS_ID_MERCHANT", "12345")

    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_client.is_closed = False

    fake_resp = MagicMock(spec=httpx.Response)
    fake_resp.status_code = 400
    fake_resp.content = b'{"status": false, "message": "Invalid amount"}'
    fake_resp.text = '{"status": false, "message": "Invalid amount"}'
    fake_resp.json.return_value = {"status": False, "message": "Invalid amount"}
    mock_client.post.return_value = fake_resp

    with patch("app.services.klikqris_service.get_klikqris_http_client", return_value=mock_client):
        with pytest.raises(RuntimeError, match="KlikQRIS error: Invalid amount"):
            await create_qris_transaction("TB-TEST-01", 1000)


@pytest.mark.asyncio
async def test_check_qris_status_success(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "KLIKQRIS_API_KEY", "mock_key")
    monkeypatch.setattr(settings, "KLIKQRIS_ID_MERCHANT", "12345")

    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_client.is_closed = False

    fake_resp = MagicMock(spec=httpx.Response)
    fake_resp.status_code = 200
    fake_resp.is_success = True
    fake_resp.content = b'{"status": true}'
    fake_resp.json.return_value = {
        "status": True,
        "data": {
            "order_id": "TB-TEST-01",
            "status": "PAID",
            "total_amount": 50123,
        },
    }
    mock_client.get.return_value = fake_resp

    with patch("app.services.klikqris_service.get_klikqris_http_client", return_value=mock_client):
        result = await check_qris_status("TB-TEST-01")
        assert result is not None
        assert result["status"] == "PAID"
        assert result["total_amount"] == 50123


@pytest.mark.asyncio
async def test_check_qris_status_404_returns_none(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "KLIKQRIS_API_KEY", "mock_key")
    monkeypatch.setattr(settings, "KLIKQRIS_ID_MERCHANT", "12345")

    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_client.is_closed = False

    fake_resp = MagicMock(spec=httpx.Response)
    fake_resp.status_code = 404
    fake_resp.is_success = False
    mock_client.get.return_value = fake_resp

    with patch("app.services.klikqris_service.get_klikqris_http_client", return_value=mock_client):
        result = await check_qris_status("TB-NONEXISTENT")
        assert result is None


@pytest.mark.asyncio
async def test_close_klikqris_client():
    client = get_klikqris_http_client()
    assert client is not None
    await close_klikqris_http_client()


from app.api.wallet import klikqris_webhook
from starlette.requests import Request


def _make_mock_json_request(data: dict) -> Request:
    scope = {
        "type": "http",
        "method": "POST",
        "headers": [(b"content-type", b"application/json")],
    }

    async def receive():
        return {
            "type": "http.request",
            "body": json.dumps(data).encode("utf-8"),
        }

    return Request(scope, receive)


@pytest.mark.asyncio
async def test_webhook_missing_order_id():
    req = _make_mock_json_request({"status": "PAID"})
    mock_db = AsyncMock()
    resp = await klikqris_webhook(req, db=mock_db)
    assert resp["status"] == "error"
    assert "Missing order_id" in resp["message"]


@pytest.mark.asyncio
async def test_webhook_order_not_found():
    req = _make_mock_json_request({"order_id": "TB-NONEXISTENT", "status": "PAID"})
    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_db.execute.return_value = mock_result

    resp = await klikqris_webhook(req, db=mock_db)
    assert resp["status"] == "error"
    assert "not found" in resp["message"]


@pytest.mark.asyncio
async def test_webhook_invalid_signature():
    tx = WalletTransaction(
        id="TB-INV-1",
        user_id=uuid.uuid4(),
        amount=50000,
        total_amount=50123,
        status="pending",
        signature="correct_signature_123",
    )

    req = _make_mock_json_request({
        "order_id": "TB-INV-1",
        "status": "PAID",
        "signature": "wrong_signature",
    })
    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = tx
    mock_db.execute.return_value = mock_result

    resp = await klikqris_webhook(req, db=mock_db)
    assert resp["status"] == "error"
    assert resp["message"] == "Invalid signature"


@pytest.mark.asyncio
async def test_webhook_already_processed_idempotent():
    tx = WalletTransaction(
        id="TB-INV-1",
        user_id=uuid.uuid4(),
        amount=50000,
        total_amount=50123,
        status="approved",
        signature="correct_sig",
    )

    req = _make_mock_json_request({
        "order_id": "TB-INV-1",
        "status": "PAID",
        "signature": "correct_sig",
    })
    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = tx
    mock_db.execute.return_value = mock_result

    resp = await klikqris_webhook(req, db=mock_db)
    assert resp["status"] == "ok"
    assert "already in approved state" in resp["message"]
    mock_db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_webhook_paid_success_credits_user():
    user = User(
        id=uuid.uuid4(),
        email="buyer@telebos.com",
        balance=100000,
    )
    tx = WalletTransaction(
        id="TB-INV-PAID",
        user_id=user.id,
        amount=50000,
        total_amount=50456,
        status="pending",
        signature="correct_sig",
    )

    req = _make_mock_json_request({
        "order_id": "TB-INV-PAID",
        "status": "PAID",
        "total_amount": 50456,
        "signature": "correct_sig",
    })
    mock_db = AsyncMock()
    mock_db.add = MagicMock()
    
    # First execute is for WalletTransaction, second is for User
    tx_result = MagicMock()
    tx_result.scalar_one_or_none.return_value = tx
    user_result = MagicMock()
    user_result.scalar_one_or_none.return_value = user

    mock_db.execute.side_effect = [tx_result, user_result]

    resp = await klikqris_webhook(req, db=mock_db)
    assert resp["status"] == "ok"
    assert "credited" in resp["message"]
    assert tx.status == "approved"
    assert user.balance == 150000  # 100,000 + 50,000
    mock_db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_webhook_expired_marks_rejected():
    tx = WalletTransaction(
        id="TB-INV-EXP",
        user_id=uuid.uuid4(),
        amount=50000,
        status="pending",
        signature="correct_sig",
    )

    req = _make_mock_json_request({
        "order_id": "TB-INV-EXP",
        "status": "EXPIRED",
        "signature": "correct_sig",
    })
    mock_db = AsyncMock()
    mock_db.add = MagicMock()
    tx_result = MagicMock()
    tx_result.scalar_one_or_none.return_value = tx
    mock_db.execute.return_value = tx_result

    resp = await klikqris_webhook(req, db=mock_db)
    assert resp["status"] == "ok"
    assert "expired" in resp["message"]
    assert tx.status == "rejected"
    mock_db.commit.assert_awaited_once()

