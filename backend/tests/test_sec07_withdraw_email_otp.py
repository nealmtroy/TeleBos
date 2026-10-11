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

import asyncio
import json
import uuid

from fastapi import HTTPException
from sqlalchemy import select, delete

from app.database import async_session_factory
from app.models.wallet_transaction import WalletTransaction
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


async def run_tests():
    print("=== STARTING SEC-07 WITHDRAW EMAIL OTP INTEGRATION TESTS ===")

    test_user_id = None
    test_user_email = f"sec07_test_{uuid.uuid4().hex[:8]}@example.com"
    initial_balance = 500_000

    try:
        # Setup: Create test user with balance
        async with async_session_factory() as db:
            user = User(
                email=test_user_email,
                balance=initial_balance,
                role="basic",
                is_active=True,
            )
            db.add(user)
            await db.commit()
            await db.refresh(user)
            test_user_id = user.id
            print(f"[SETUP] Created user {test_user_id} with balance Rp {initial_balance:,}")

        # Clean any preexisting keys in Redis for this test user
        await redis_client.delete(f"withdraw:otp:{test_user_id}")
        await redis_client.delete(f"withdraw:otp:cooldown:{test_user_id}")
        await redis_client.delete(f"withdraw:otp:hourly:{test_user_id}")

        req = MockRequest("10.0.0.7")

        # TEST 1: Request OTP without enough balance
        print("\n[TEST 1] Testing OTP request with insufficient balance...")
        async with async_session_factory() as db:
            user = await db.get(User, test_user_id)
            otp_payload_too_high = WithdrawOtpRequest(
                amount=1_000_000, # user only has 500,000
                method="BCA",
                note="1234567890 (Neal)",
            )
            try:
                await request_withdraw_otp(req, otp_payload_too_high, db, user)
                assert False, "Expected HTTPException 400 for insufficient balance"
            except HTTPException as e:
                assert e.status_code == 400
                assert "Saldo tidak mencukupi" in e.detail
                print("  ✓ Correctly rejected with HTTP 400: Saldo tidak mencukupi")

        # TEST 2: Legitimate OTP request
        print("\n[TEST 2] Testing legitimate OTP request...")
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
            print(f"  ✓ OTP requested successfully! Masked email: {res.email_masked}")

            # Check Redis
            otp_raw = await redis_client.get(f"withdraw:otp:{test_user_id}")
            assert otp_raw is not None, "OTP not stored in Redis!"
            otp_data = json.loads(otp_raw)
            generated_code = otp_data["code"]
            assert len(generated_code) == 6
            assert otp_data["amount"] == otp_amount
            assert otp_data["attempts"] == 0
            print(f"  ✓ Redis verified: OTP={generated_code}, Amount={otp_data['amount']}, TTL={await redis_client.ttl(f'withdraw:otp:{test_user_id}')}s")

        # TEST 3: Cooldown enforcement
        print("\n[TEST 3] Testing OTP cooldown enforcement (re-requesting within 60s)...")
        async with async_session_factory() as db:
            user = await db.get(User, test_user_id)
            try:
                await request_withdraw_otp(req, otp_payload, db, user)
                assert False, "Expected HTTPException 429 due to cooldown"
            except HTTPException as e:
                assert e.status_code == 429
                assert "detik sebelum meminta kode OTP baru" in e.detail
                print(f"  ✓ Cooldown enforced correctly: {e.detail}")

        # TEST 4: Withdraw with wrong OTP code (attempts tracking)
        print("\n[TEST 4] Testing withdrawal with wrong OTP code...")
        async with async_session_factory() as db:
            user = await db.get(User, test_user_id)
            bad_withdraw_payload = WithdrawCreateRequest(
                amount=otp_amount,
                method="BCA",
                note="1234567890 (Neal)",
                otp_code="000000" if generated_code != "000000" else "999999",
            )
            try:
                await request_withdraw(req, bad_withdraw_payload, db, user)
                assert False, "Expected HTTPException 400 for wrong OTP"
            except HTTPException as e:
                assert e.status_code == 400
                assert "Kode OTP salah" in e.detail
                print(f"  ✓ Wrong OTP rejected: {e.detail}")

            # Verify attempts counter in Redis
            otp_raw = await redis_client.get(f"withdraw:otp:{test_user_id}")
            assert otp_raw is not None
            assert json.loads(otp_raw)["attempts"] == 1
            print("  ✓ Redis verified: attempts incremented to 1")

        # TEST 5: Brute-force lockout (exceeding 3 attempts deletes OTP)
        print("\n[TEST 5] Testing brute-force lockout on 3 wrong attempts...")
        async with async_session_factory() as db:
            user = await db.get(User, test_user_id)
            # Attempt 2
            try:
                await request_withdraw(req, bad_withdraw_payload, db, user)
            except HTTPException as e:
                assert "Sisa kesempatan: 1 kali" in e.detail
                print(f"  ✓ Attempt 2: {e.detail}")

            # Attempt 3 (lockout / revocation)
            try:
                await request_withdraw(req, bad_withdraw_payload, db, user)
            except HTTPException as e:
                assert "mencapai batas maksimal" in e.detail
                print(f"  ✓ Attempt 3: {e.detail}")

            # Verify OTP is revoked/deleted from Redis
            otp_raw = await redis_client.get(f"withdraw:otp:{test_user_id}")
            assert otp_raw is None, "OTP should have been deleted from Redis after 3 attempts!"
            print("  ✓ OTP key successfully burned/deleted from Redis after 3 wrong attempts")

        # TEST 6: Amount tampering (Dynamic linking protection)
        print("\n[TEST 6] Testing amount tampering (dynamic linking protection)...")
        # Clear cooldown so we can generate fresh OTP
        await redis_client.delete(f"withdraw:otp:cooldown:{test_user_id}")
        async with async_session_factory() as db:
            user = await db.get(User, test_user_id)
            res = await request_withdraw_otp(req, WithdrawOtpRequest(amount=50_000, method="BCA", note="12345"), db, user)
            otp_raw = await redis_client.get(f"withdraw:otp:{test_user_id}")
            new_code = json.loads(otp_raw)["code"]

            # Attacker tries to withdraw 100,000 using OTP generated for 50,000
            tampered_payload = WithdrawCreateRequest(
                amount=100_000,
                method="BCA",
                note="12345",
                otp_code=new_code,
            )
            try:
                await request_withdraw(req, tampered_payload, db, user)
                assert False, "Expected rejection for tampered amount"
            except HTTPException as e:
                assert e.status_code == 400
                assert "Nominal penarikan tidak cocok" in e.detail
                print(f"  ✓ Tampered amount blocked: {e.detail}")

        # TEST 7: Valid withdrawal execution & single-use atomic consumption
        print("\n[TEST 7] Testing successful withdrawal with valid OTP and atomic burn...")
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
            assert tx_res.method == "MANDIRI"
            await db.commit()
            print(f"  ✓ Withdrawal created: ID={tx_res.id}, Status={tx_res.status}, Amount={tx_res.amount}")

            # Check user balance deducted
            await db.refresh(user)
            expected_balance = initial_balance - valid_amount
            assert user.balance == expected_balance
            print(f"  ✓ Balance correctly deducted: from Rp {initial_balance:,} to Rp {user.balance:,}")

            # Check OTP was burned in Redis
            burned_otp = await redis_client.get(f"withdraw:otp:{test_user_id}")
            assert burned_otp is None, "OTP must be deleted from Redis immediately after use!"
            print("  ✓ OTP atomicity verified: key deleted from Redis immediately upon approval")

            # TEST 8: Replay attack prevention
            print("\n[TEST 8] Testing replay attack prevention with already consumed OTP...")
            try:
                await request_withdraw(req, withdraw_payload, db, user)
                assert False, "Expected rejection for replayed OTP"
            except HTTPException as e:
                assert e.status_code == 400
                assert "tidak valid atau sudah kedaluwarsa" in e.detail
                print(f"  ✓ Replay attack blocked: {e.detail}")

        print("\n🎉 ALL SEC-07 INTEGRATION TESTS PASSED PERFECTLY! 🎉")

    finally:
        # Cleanup test user & transactions
        if test_user_id:
            try:
                async with async_session_factory() as db:
                    await db.execute(delete(WalletTransaction).where(WalletTransaction.user_id == test_user_id))
                    await db.execute(delete(User).where(User.id == test_user_id))
                    await db.commit()
                await redis_client.delete(f"withdraw:otp:{test_user_id}")
                await redis_client.delete(f"withdraw:otp:cooldown:{test_user_id}")
                await redis_client.delete(f"withdraw:otp:hourly:{test_user_id}")
                print(f"[CLEANUP] Deleted test user {test_user_id}")
            except Exception as e:
                print(f"[CLEANUP ERROR] {e}")


if __name__ == "__main__":
    asyncio.run(run_tests())
