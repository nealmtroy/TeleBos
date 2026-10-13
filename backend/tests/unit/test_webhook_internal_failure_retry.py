"""Unit tests for TASK-10 / API-01:
Verification that KlikQRIS payment webhook returns HTTP 500 Internal Server Error
when encountering internal server failures or user lookup inconsistency, allowing
the payment gateway to automatically retry delivering legitimate payment confirmations.
"""

import json
from unittest.mock import AsyncMock, MagicMock
import uuid
import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.api.wallet import klikqris_webhook
from app.models.wallet_transaction import WalletTransaction
from app.models.user import User


def _make_mock_json_request(data: dict) -> Request:
    scope = {
        "type": "http",
        "method": "POST",
        "headers": [(b"content-type", b"application/json")],
        "client": ("127.0.0.1", 12345),
    }

    async def receive():
        return {
            "type": "http.request",
            "body": json.dumps(data).encode("utf-8"),
        }

    return Request(scope, receive)


@pytest.mark.asyncio
async def test_webhook_paid_raises_http_500_when_user_not_found():
    """When a PAID payment webhook is received but the user record cannot be found

    due to internal database inconsistency, klikqris_webhook must raise HTTP 500
    so that KlikQRIS's automatic retry mechanism will retry delivery instead of
    permanently dropping a legitimate payment.
    """
    missing_user_id = uuid.uuid4()
    tx = WalletTransaction(
        id="TB-INV-MISSING-USER",
        user_id=missing_user_id,
        amount=50000,
        total_amount=50123,
        status="pending",
        signature="valid_secret_signature",
    )

    req = _make_mock_json_request({
        "order_id": "TB-INV-MISSING-USER",
        "status": "PAID",
        "total_amount": 50123,
        "signature": "valid_secret_signature",
    })

    mock_db = AsyncMock()
    tx_result = MagicMock()
    tx_result.scalar_one_or_none.return_value = tx

    # User query returns None (e.g. replica lag, internal inconsistency)
    user_result = MagicMock()
    user_result.scalar_one_or_none.return_value = None

    mock_db.execute.side_effect = [tx_result, tx_result, user_result]

    with pytest.raises(HTTPException) as exc_info:
        await klikqris_webhook(req, db=mock_db)

    assert exc_info.value.status_code == 500
    assert "Retry required" in exc_info.value.detail
    # Transaction must NOT have been marked completed or committed
    mock_db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_webhook_successful_payment_returns_200_and_commits():
    """When user is found and payment is legitimate, responds with 200 OK and commits."""
    user = User(
        id=uuid.uuid4(),
        email="customer@telebos.com",
        balance=10000,
    )
    tx = WalletTransaction(
        id="TB-INV-SUCCESS",
        user_id=user.id,
        amount=50000,
        total_amount=50000,
        status="pending",
        signature="valid_sig",
    )

    req = _make_mock_json_request({
        "order_id": "TB-INV-SUCCESS",
        "status": "PAID",
        "total_amount": 50000,
        "signature": "valid_sig",
    })

    mock_db = AsyncMock()
    mock_db.add = MagicMock()
    tx_result = MagicMock()
    tx_result.scalar_one_or_none.return_value = tx
    user_result = MagicMock()
    user_result.scalar_one_or_none.return_value = user

    mock_db.execute.side_effect = [tx_result, tx_result, user_result]

    resp = await klikqris_webhook(req, db=mock_db)
    assert resp["status"] == "ok"
    assert "fulfilled" in resp["message"]
    mock_db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_webhook_idempotent_retry_after_approval_returns_200_without_commit():
    """When payment gateway retries a previously approved transaction, responds 200 OK

    idempotently without calling commit or duplicating funds.
    """
    tx = WalletTransaction(
        id="TB-INV-ALREADY-APPROVED",
        user_id=uuid.uuid4(),
        amount=50000,
        total_amount=50000,
        status="approved",
        signature="valid_sig",
    )

    req = _make_mock_json_request({
        "order_id": "TB-INV-ALREADY-APPROVED",
        "status": "PAID",
        "total_amount": 50000,
        "signature": "valid_sig",
    })

    mock_db = AsyncMock()
    tx_result = MagicMock()
    tx_result.scalar_one_or_none.return_value = tx
    mock_db.execute.return_value = tx_result

    resp = await klikqris_webhook(req, db=mock_db)
    assert resp["status"] == "ok"
    assert "already in approved state" in resp["message"]
    mock_db.commit.assert_not_awaited()
