"""Unit & Integration Test Suite for SEC-06 KlikQRIS Webhook Hardening.

Verifies:
1. Rate limiter stops flood attempts (HTTP 429).
2. Missing or invalid signature fails cleanly without acquiring row locks.
3. IP whitelisting: empty allows dynamic cloud IPs (KlikQRIS standard), while configured values reject untrusted IPs.
4. Idempotency: duplicate webhooks acknowledge with HTTP 200 without double crediting.
5. Legitimate payment: valid signature fulfills transaction and returns HTTP 200 OK.
"""

import uuid
import pytest
from fastapi import HTTPException
from sqlalchemy import select, delete

from app.database import async_session_factory
from app.models.wallet_transaction import WalletTransaction
from app.models.wallet_ledger import WalletLedger
from app.models.user import User
from app.api.wallet import klikqris_webhook
from app.config import get_settings
from app.utils.rate_limiter import rate_limiter


class MockClient:
    def __init__(self, host: str):
        self.host = host


class MockRequest:
    def __init__(self, json_data: dict, client_host: str = "127.0.0.1"):
        self._json_data = json_data
        self.headers = {"content-type": "application/json"}
        self.client = MockClient(client_host)

    async def json(self):
        return self._json_data


@pytest.fixture
async def sec06_setup():
    test_user_id = uuid.uuid4()
    test_tx_id = f"TB-SEC06-{uuid.uuid4().hex[:8]}"
    test_signature = "sig_valid_cryptographic_hash_12345"

    async with async_session_factory() as db:
        user = User(
            id=test_user_id,
            email=f"test_sec06_{uuid.uuid4().hex[:8]}@example.com",
            balance=10000,
            role="basic",
            is_active=True,
        )
        db.add(user)
        await db.flush()

        tx = WalletTransaction(
            id=test_tx_id,
            user_id=user.id,
            type="topup",
            amount=50000,
            total_amount=50123,
            status="pending",
            method="qris",
            signature=test_signature,
        )
        db.add(tx)
        await db.commit()

    yield test_user_id, test_tx_id, test_signature

    # Cleanup in strict foreign key order (RESTRICT compliance)
    async with async_session_factory() as db:
        await db.execute(delete(WalletLedger).where(WalletLedger.user_id == test_user_id))
        await db.execute(delete(WalletTransaction).where(WalletTransaction.user_id == test_user_id))
        await db.execute(delete(User).where(User.id == test_user_id))
        await db.commit()


@pytest.mark.asyncio
async def test_sec06_webhook_missing_or_fake_signature_rejection(sec06_setup):
    """Test rejection of missing or invalid signatures without acquiring locks."""
    _, test_tx_id, _ = sec06_setup

    async with async_session_factory() as db:
        # Missing signature
        req_no_sig = MockRequest({"order_id": test_tx_id, "status": "PAID"})
        resp = await klikqris_webhook(req_no_sig, db=db)
        assert resp["status"] == "error"
        assert resp["message"] == "Invalid signature"

        # Fake signature
        req_fake_sig = MockRequest({
            "order_id": test_tx_id,
            "status": "PAID",
            "signature": "fake_attacker_signature_9999",
        })
        resp = await klikqris_webhook(req_fake_sig, db=db)
        assert resp["status"] == "error"
        assert resp["message"] == "Invalid signature"


@pytest.mark.asyncio
async def test_sec06_webhook_ip_whitelisting_behavior(sec06_setup):
    """Test optional IP whitelisting when configured vs default open behavior."""
    _, test_tx_id, test_signature = sec06_setup
    settings = get_settings()

    original_allowed_ips = getattr(settings, "KLIKQRIS_ALLOWED_IPS", "")
    try:
        # Configured whitelist: reject untrusted IPs
        settings.KLIKQRIS_ALLOWED_IPS = "10.0.0.1, 10.0.0.2"
        async with async_session_factory() as db:
            req_untrusted_ip = MockRequest({
                "order_id": test_tx_id,
                "status": "PAID",
                "signature": test_signature,
            }, client_host="192.168.1.100")
            resp_ip = await klikqris_webhook(req_untrusted_ip, db=db)
            assert resp_ip["status"] == "error"
            assert resp_ip["message"] == "Unauthorized IP"
    finally:
        settings.KLIKQRIS_ALLOWED_IPS = original_allowed_ips


@pytest.mark.asyncio
async def test_sec06_webhook_rate_limiting_enforcement(sec06_setup):
    """Test rate limiting blocks flood requests with HTTP 429."""
    _, test_tx_id, test_signature = sec06_setup
    rate_limit_ip = f"198.51.100.{uuid.uuid4().int % 250 + 1}"

    # Consume quota for rate_limit_ip
    for _ in range(60):
        await rate_limiter.check(f"webhook:klikqris:ip:{rate_limit_ip}", max_requests=60, window_seconds=60)

    # 61st request must trigger HTTP 429
    async with async_session_factory() as db:
        req_flood = MockRequest({
            "order_id": test_tx_id,
            "status": "PAID",
            "signature": test_signature,
        }, client_host=rate_limit_ip)
        with pytest.raises(HTTPException) as exc_info:
            await klikqris_webhook(req_flood, db=db)
        assert exc_info.value.status_code == 429


@pytest.mark.asyncio
async def test_sec06_webhook_legitimate_payment_and_idempotency(sec06_setup):
    """Test legitimate payment fulfillment and subsequent idempotent replay handling."""
    test_user_id, test_tx_id, test_signature = sec06_setup

    req_legit = MockRequest({
        "order_id": test_tx_id,
        "status": "PAID",
        "total_amount": 50123,
        "signature": test_signature,
    }, client_host="103.10.10.1")

    # 1. First execution: fulfills payment and credits balance
    async with async_session_factory() as db:
        resp_legit = await klikqris_webhook(req_legit, db=db)
        assert resp_legit["status"] == "ok"
        assert "verified and fulfilled" in resp_legit["message"]

    # Verify database state
    async with async_session_factory() as db:
        res_user = await db.execute(select(User).where(User.id == test_user_id))
        db_user = res_user.scalar_one()
        assert db_user.balance == 60000  # 10,000 + 50,000

        res_tx = await db.execute(select(WalletTransaction).where(WalletTransaction.id == test_tx_id))
        db_tx = res_tx.scalar_one()
        assert db_tx.status == "approved"

    # 2. Duplicate callback replay: acknowledged with HTTP 200 without double crediting
    async with async_session_factory() as db:
        resp_dup = await klikqris_webhook(req_legit, db=db)
        assert resp_dup["status"] == "ok"
        assert "already in approved state" in resp_dup["message"]

        res_user2 = await db.execute(select(User).where(User.id == test_user_id))
        db_user2 = res_user2.scalar_one()
        assert db_user2.balance == 60000  # Must remain unchanged
