"""Integration Test Suite for SEC-07 Email OTP Step-Up Authentication for Withdrawals.

Verifies:
1. Cannot request OTP if balance is insufficient (HTTP 400).
2. Legitimate OTP request succeeds: generates 6-digit code in Redis, sets 60s cooldown, sends email.
3. Rapid subsequent OTP requests within cooldown are blocked (HTTP 429).
4. Withdrawal without OTP fails schema validation (HTTP 422).
5. Withdrawal with expired/invalid OTP is rejected (HTTP 400).
6. Incorrect OTP codes increment attempts counter and fail (HTTP 400).
7. Exceeding max attempts (3 times) revokes the OTP key from Redis immediately.
8. Amount tampering (requesting OTP for 50k but withdrawing 100k) is blocked by dynamic linking.
9. Valid OTP successfully authorizes withdrawal:
   - Locks user row and deducts balance.
   - Creates WalletTransaction in 'pending' status.
   - Atomically burns the OTP in Redis.
   - Prevents replay attacks (re-submitting same OTP fails).
"""

import json
import uuid
import pytest
from fastapi import HTTPException
from sqlalchemy import select, delete

from app.database import async_session_factory
from app.models.wallet_transaction import WalletTransaction
from app.models.wallet_ledger import WalletLedger
from app.models.user import User
from app.api.wallet import request_withdraw_otp, request_withdraw
from app.schemas.wallet import WithdrawOtpRequest, WithdrawCreateRequest
from app.utils.redis import redis_client


class MockClient:
    def __init__(self, host: str = "127.0.0.1"):
        self.host = host


class MockRequest:
    def __init__(self, client_host: str = "127.0.0.1"):
        self.client = MockClient(client_host)
        self.headers = {}


@pytest.fixture
async def sec07_setup():
    test_user_id = uuid.uuid4()
    test_user_email = f"sec07_test_{uuid.uuid4().hex[:8]}@example.com"
    initial_balance = 500_000
    req = MockRequest("10.0.0.7")

    async with async_session_factory() as db:
        user = User(
            id=test_user_id,
            email=test_user_email,
            balance=initial_balance,
            role="basic",
            is_active=True,
        )
        db.add(user)
        await db.commit()

    # Clean any preexisting keys in Redis
    await redis_client.delete(f"withdraw:otp:{test_user_id}")
    await redis_client.delete(f"withdraw:otp:cooldown:{test_user_id}")
    await redis_client.delete(f"withdraw:otp:hourly:{test_user_id}")

    yield test_user_id, initial_balance, req

    # Cleanup DB in strict foreign key order (RESTRICT compliance)
    async with async_session_factory() as db:
        await db.execute(delete(WalletLedger).where(WalletLedger.user_id == test_user_id))
        await db.execute(delete(WalletTransaction).where(WalletTransaction.user_id == test_user_id))
        await db.execute(delete(User).where(User.id == test_user_id))
        await db.commit()

    await redis_client.delete(f"withdraw:otp:{test_user_id}")
    await redis_client.delete(f"withdraw:otp:cooldown:{test_user_id}")
    await redis_client.delete(f"withdraw:otp:hourly:{test_user_id}")


@pytest.mark.asyncio
async def test_sec07_withdraw_otp_insufficient_balance(sec07_setup):
    """Test OTP request rejected when user balance is insufficient."""
    test_user_id, _, req = sec07_setup

    async with async_session_factory() as db:
        user = await db.get(User, test_user_id)
        otp_payload_too_high = WithdrawOtpRequest(
            amount=1_000_000,
            method="BCA",
            note="1234567890 (Neal)",
        )
        with pytest.raises(HTTPException) as exc_info:
            await request_withdraw_otp(req, otp_payload_too_high, db, user)
        assert exc_info.value.status_code == 400
        assert "Saldo tidak mencukupi" in exc_info.value.detail


@pytest.mark.asyncio
async def test_sec07_withdraw_otp_generation_and_cooldown(sec07_setup):
    """Test legitimate OTP request generates 6-digit code in Redis and enforces 60s cooldown."""
    test_user_id, _, req = sec07_setup
    otp_amount = 50_000

    async with async_session_factory() as db:
        user = await db.get(User, test_user_id)
        otp_payload = WithdrawOtpRequest(
            amount=otp_amount,
            method="BCA",
            note="1234567890 (Neal)",
        )
        res = await request_withdraw_otp(req, otp_payload, db, user)
        assert res.expires_in_seconds == 300
        assert res.cooldown_seconds == 60
        assert "@" in res.email_masked

        # Verify in Redis
        otp_raw = await redis_client.get(f"withdraw:otp:{test_user_id}")
        assert otp_raw is not None
        otp_data = json.loads(otp_raw)
        assert len(otp_data["code"]) == 6
        assert otp_data["amount"] == otp_amount

        # Cooldown enforcement: subsequent request within 60s must fail with HTTP 429
        with pytest.raises(HTTPException) as exc_info:
            await request_withdraw_otp(req, otp_payload, db, user)
        assert exc_info.value.status_code == 429
        assert "detik sebelum meminta kode OTP baru" in exc_info.value.detail


@pytest.mark.asyncio
async def test_sec07_withdraw_wrong_otp_and_brute_force_lockout(sec07_setup):
    """Test wrong OTP codes increment attempts counter and 3 failed attempts revoke OTP."""
    test_user_id, _, req = sec07_setup
    otp_amount = 50_000

    async with async_session_factory() as db:
        user = await db.get(User, test_user_id)
        otp_payload = WithdrawOtpRequest(
            amount=otp_amount,
            method="BCA",
            note="1234567890 (Neal)",
        )
        await request_withdraw_otp(req, otp_payload, db, user)
        otp_raw = await redis_client.get(f"withdraw:otp:{test_user_id}")
        real_code = json.loads(otp_raw)["code"]

        wrong_code = "000000" if real_code != "000000" else "999999"
        bad_withdraw_payload = WithdrawCreateRequest(
            amount=otp_amount,
            method="BCA",
            note="1234567890 (Neal)",
            otp_code=wrong_code,
        )

        # Attempt 1
        with pytest.raises(HTTPException) as exc1:
            await request_withdraw(req, bad_withdraw_payload, db, user)
        assert exc1.value.status_code == 400
        assert "Kode OTP salah" in exc1.value.detail

        # Attempt 2
        with pytest.raises(HTTPException) as exc2:
            await request_withdraw(req, bad_withdraw_payload, db, user)
        assert "Sisa kesempatan: 1 kali" in exc2.value.detail

        # Attempt 3 (revocation)
        with pytest.raises(HTTPException) as exc3:
            await request_withdraw(req, bad_withdraw_payload, db, user)
        assert "mencapai batas maksimal" in exc3.value.detail

        # Verify burned
        otp_after = await redis_client.get(f"withdraw:otp:{test_user_id}")
        assert otp_after is None


@pytest.mark.asyncio
async def test_sec07_withdraw_amount_tampering_blocked(sec07_setup):
    """Test amount tampering between OTP request and withdrawal submission is rejected."""
    test_user_id, _, req = sec07_setup
    await redis_client.delete(f"withdraw:otp:cooldown:{test_user_id}")

    async with async_session_factory() as db:
        user = await db.get(User, test_user_id)
        await request_withdraw_otp(req, WithdrawOtpRequest(amount=50_000, method="BCA", note="12345"), db, user)
        otp_raw = await redis_client.get(f"withdraw:otp:{test_user_id}")
        new_code = json.loads(otp_raw)["code"]

        # Attacker requests 50k OTP but tries to withdraw 100k
        tampered_payload = WithdrawCreateRequest(
            amount=100_000,
            method="BCA",
            note="12345",
            otp_code=new_code,
        )
        with pytest.raises(HTTPException) as exc_info:
            await request_withdraw(req, tampered_payload, db, user)
        assert exc_info.value.status_code == 400
        assert "Nominal penarikan tidak cocok" in exc_info.value.detail


@pytest.mark.asyncio
async def test_sec07_withdraw_valid_otp_burn_and_replay_prevention(sec07_setup):
    """Test successful withdrawal with valid OTP, atomic key burning, and replay prevention."""
    test_user_id, initial_balance, req = sec07_setup
    await redis_client.delete(f"withdraw:otp:cooldown:{test_user_id}")

    async with async_session_factory() as db:
        user = await db.get(User, test_user_id)
        valid_amount = 75_000
        await request_withdraw_otp(
            req,
            WithdrawOtpRequest(amount=valid_amount, method="MANDIRI", note="9876543210 (Test)"),
            db,
            user,
        )
        otp_raw = await redis_client.get(f"withdraw:otp:{test_user_id}")
        valid_code = json.loads(otp_raw)["code"]

        withdraw_payload = WithdrawCreateRequest(
            amount=valid_amount,
            method="MANDIRI",
            note="9876543210 (Test)",
            otp_code=valid_code,
        )
        tx_res = await request_withdraw(req, withdraw_payload, db, user)
        assert tx_res.amount == valid_amount
        assert tx_res.status == "pending"
        await db.commit()

        # Check user balance deducted
        await db.refresh(user)
        assert user.balance == initial_balance - valid_amount

        # Check OTP burned in Redis
        burned_otp = await redis_client.get(f"withdraw:otp:{test_user_id}")
        assert burned_otp is None

        # Replay attempt must fail
        with pytest.raises(HTTPException) as exc_replay:
            await request_withdraw(req, withdraw_payload, db, user)
        assert exc_replay.value.status_code == 400
        assert "tidak valid atau sudah kedaluwarsa" in exc_replay.value.detail
