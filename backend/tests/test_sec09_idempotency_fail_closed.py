"""Integration Test Suite for SEC-09 Idempotency Fail-Closed and In-Flight Mutex.

Verifies:
1. Normal sequential idempotency: Retrying with the same X-Idempotency-Key returns
   the existing orders and does NOT double-deduct user balance.
2. Concurrent in-flight mutex: A concurrent request with the same X-Idempotency-Key
   while the first is PROCESSING is rejected with HTTP 409 Conflict.
3. Fail-Closed on Redis failure: If Redis is unavailable or raises an exception,
   requests with X-Idempotency-Key are rejected with HTTP 503 Service Unavailable,
   NEVER falling through to duplicate deductions.
4. Clean lock release on validation failure: If balance is insufficient or input
   is invalid, the PROCESSING lock is released so the user can retry.
5. Single order endpoint: Verified to also enforce fail-closed and in-flight mutex.
"""

import asyncio
import json
import uuid
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException
from sqlalchemy import select, delete

from app.database import async_session_factory
from app.models.user import User
from app.models.order import Order
from app.models.smm_service import SmmService
from app.schemas.order import MassOrderCreate, MassOrderItem as MassOrderItemSchema, OrderCreate
from app.api.orders import place_mass_order, place_single_order
from app.smm_service_ids import ALLOWED_SMM_SERVICE_IDS
from app.utils.redis import redis_client


class MockClient:
    def __init__(self, host: str = "127.0.0.1"):
        self.host = host


class MockRequest:
    def __init__(self, client_host: str = "127.0.0.1"):
        self.client = MockClient(client_host)
        self.headers = {}


async def run_tests():
    print("=== STARTING SEC-09 IDEMPOTENCY FAIL-CLOSED INTEGRATION TESTS ===")

    test_user_id = None
    test_user_email = f"sec09_user_{uuid.uuid4().hex[:8]}@example.com"
    initial_balance = 500_000

    # Pick an allowed SMM service ID
    allowed_service_id = next(iter(ALLOWED_SMM_SERVICE_IDS))

    try:
        # Setup: Create test user and ensure an SMM service exists
        async with async_session_factory() as db:
            user = User(
                email=test_user_email,
                balance=initial_balance,
                role="basic",
                is_active=True,
            )
            db.add(user)

            # Ensure the service exists in smm_services
            res_svc = await db.execute(select(SmmService).where(SmmService.id == allowed_service_id))
            svc = res_svc.scalar_one_or_none()
            if not svc:
                svc = SmmService(
                    id=allowed_service_id,
                    service_id=allowed_service_id,
                    service_name="Test Telegram Service",
                    category="Telegram",
                    original_price=10000,
                    selling_price=15000,
                    min_qty=10,
                    max_qty=10000,
                    is_active=True,
                    is_visible=True,
                )
                db.add(svc)
            else:
                svc.is_active = True
                svc.is_visible = True

            await db.commit()
            await db.refresh(user)
            test_user_id = user.id

        print(f"[SETUP] Created user {test_user_id} with initial balance Rp {initial_balance:,}")

        # ── 1. Test Sequential Mass Order Idempotency (Deduplication) ─────────────
        print("\n[TEST 1] Testing sequential mass order idempotency deduplication...")
        idempotency_key = f"IDEM-MASS-{uuid.uuid4().hex}"
        mass_payload = MassOrderCreate(
            orders=[
                MassOrderItemSchema(
                    service_id=allowed_service_id,
                    data_target="https://t.me/test_channel_1",
                    quantity=100,
                ),
                MassOrderItemSchema(
                    service_id=allowed_service_id,
                    data_target="https://t.me/test_channel_2",
                    quantity=200,
                ),
            ]
        )

        mock_req = MockRequest()
        first_order_ids = []

        with patch("app.services.order_service.create_order", new_callable=AsyncMock) as mock_create:
            mock_create.return_value = {"status": True, "data": {"id": 888888}}

            async with async_session_factory() as db:
                res_user = await db.execute(select(User).where(User.id == test_user_id))
                cur_user = res_user.scalar_one()

                # First request
                created_orders = await place_mass_order(
                    request=mock_req,
                    payload=mass_payload,
                    db=db,
                    user=cur_user,
                    x_idempotency_key=idempotency_key,
                )
                assert len(created_orders) == 2
                first_order_ids = [o.id for o in created_orders]
                balance_after_first = cur_user.balance
                assert balance_after_first < initial_balance
                print(f"  ✓ First request succeeded: created 2 orders, balance debited to Rp {balance_after_first:,}")

            # Retry with identical X-Idempotency-Key
            async with async_session_factory() as db:
                res_user = await db.execute(select(User).where(User.id == test_user_id))
                cur_user = res_user.scalar_one()

                retried_orders = await place_mass_order(
                    request=mock_req,
                    payload=mass_payload,
                    db=db,
                    user=cur_user,
                    x_idempotency_key=idempotency_key,
                )
                assert len(retried_orders) == 2
                retried_ids = [o.id for o in retried_orders]
                assert retried_ids == first_order_ids, "Retried order IDs must match initial orders"
                assert cur_user.balance == balance_after_first, "Balance must NOT be deducted again on retry"
                print("  ✓ Sequential retry returned cached orders without duplicate deduction.")

        # ── 2. Test In-Flight Concurrency Mutex (HTTP 409 Conflict) ───────────────
        print("\n[TEST 2] Testing in-flight concurrency mutex (HTTP 409 Conflict)...")
        in_flight_key = f"IDEM-INFLIGHT-{uuid.uuid4().hex}"
        cache_key = f"idempotency:order_mass:{test_user_id}:{in_flight_key}"

        # Manually simulate a concurrent request currently in state "PROCESSING"
        await redis_client.set(cache_key, "PROCESSING", ex=60)

        async with async_session_factory() as db:
            res_user = await db.execute(select(User).where(User.id == test_user_id))
            cur_user = res_user.scalar_one()

            conflict_caught = False
            try:
                await place_mass_order(
                    request=mock_req,
                    payload=mass_payload,
                    db=db,
                    user=cur_user,
                    x_idempotency_key=in_flight_key,
                )
            except HTTPException as e:
                if e.status_code == 409:
                    conflict_caught = True
                    print(f"  ✓ Correctly rejected concurrent in-flight request: {e.detail}")

            assert conflict_caught, "Concurrent request on PROCESSING key must return HTTP 409"
            await redis_client.delete(cache_key)

        # ── 3. Test Fail-Closed on Redis Connectivity Failure (HTTP 503) ──────────
        print("\n[TEST 3] Testing fail-closed on Redis outage (HTTP 503)...")
        fail_closed_key = f"IDEM-FAILCLOSED-{uuid.uuid4().hex}"

        # Mock redis_client.set to simulate a ConnectionError / TimeoutError
        with patch.object(redis_client, "set", side_effect=Exception("Redis connection timed out")):
            async with async_session_factory() as db:
                res_user = await db.execute(select(User).where(User.id == test_user_id))
                cur_user = res_user.scalar_one()
                balance_before_redis_failure = cur_user.balance

                service_unavailable_caught = False
                try:
                    await place_mass_order(
                        request=mock_req,
                        payload=mass_payload,
                        db=db,
                        user=cur_user,
                        x_idempotency_key=fail_closed_key,
                    )
                except HTTPException as e:
                    if e.status_code == 503:
                        service_unavailable_caught = True
                        assert "Retry-After" in e.headers
                        print(f"  ✓ Correctly failed-closed with HTTP 503: {e.detail} (Retry-After: {e.headers['Retry-After']}s)")

                assert service_unavailable_caught, "Redis failure must fail-closed with HTTP 503"
                assert cur_user.balance == balance_before_redis_failure, "Balance must remain untouched during Redis failure"
                print("  ✓ Fail-closed guarantee verified: NO orders placed and balance completely safe.")

        # ── 4. Test Single Order Fail-Closed and In-Flight Lock ────────────────────
        print("\n[TEST 4] Testing Single Order endpoint fail-closed and idempotency...")
        single_key = f"IDEM-SINGLE-{uuid.uuid4().hex}"
        single_payload = OrderCreate(
            service_id=allowed_service_id,
            data_target="https://t.me/test_single_channel",
            quantity=100,
        )

        with patch("app.services.order_service.create_order", new_callable=AsyncMock) as mock_create:
            mock_create.return_value = {"status": True, "data": {"id": 777777}}

            async with async_session_factory() as db:
                res_user = await db.execute(select(User).where(User.id == test_user_id))
                cur_user = res_user.scalar_one()

                # Initial single order
                single_ord = await place_single_order(
                    request=mock_req,
                    payload=single_payload,
                    db=db,
                    user=cur_user,
                    x_idempotency_key=single_key,
                )
                single_ord_id = single_ord.id
                bal_after_single = cur_user.balance

                # Sequential retry
                retry_single = await place_single_order(
                    request=mock_req,
                    payload=single_payload,
                    db=db,
                    user=cur_user,
                    x_idempotency_key=single_key,
                )
                assert retry_single.id == single_ord_id
                assert cur_user.balance == bal_after_single
                print("  ✓ Single order sequential idempotency verified without duplicate deduction.")

        # Single order fail-closed test
        with patch.object(redis_client, "set", side_effect=Exception("Redis connection timed out")):
            async with async_session_factory() as db:
                res_user = await db.execute(select(User).where(User.id == test_user_id))
                cur_user = res_user.scalar_one()

                single_503_caught = False
                try:
                    await place_single_order(
                        request=mock_req,
                        payload=single_payload,
                        db=db,
                        user=cur_user,
                        x_idempotency_key=f"IDEM-SINGLE-FAIL-{uuid.uuid4().hex}",
                    )
                except HTTPException as e:
                    if e.status_code == 503:
                        single_503_caught = True
                assert single_503_caught, "Single order must also fail-closed with HTTP 503 on Redis outage"
                print("  ✓ Single order fail-closed on Redis outage verified.")

        # ── 5. Test Lock Release on Business Validation Failure ───────────────────
        print("\n[TEST 5] Testing lock release on validation failure...")
        invalid_key = f"IDEM-INVALID-{uuid.uuid4().hex}"
        invalid_payload = MassOrderCreate(
            orders=[
                MassOrderItemSchema(
                    service_id=allowed_service_id,
                    data_target="invalid_url",
                    quantity=500000,  # Valid schema (<= 1M) but fails balance check
                )
            ]
        )

        async with async_session_factory() as db:
            res_user = await db.execute(select(User).where(User.id == test_user_id))
            cur_user = res_user.scalar_one()

            val_err_caught = False
            try:
                await place_mass_order(
                    request=mock_req,
                    payload=invalid_payload,
                    db=db,
                    user=cur_user,
                    x_idempotency_key=invalid_key,
                )
            except HTTPException as e:
                val_err_caught = True
                assert e.status_code == 400

            assert val_err_caught, "Invalid order must raise HTTP 400"

            # Check that the PROCESSING key was deleted from Redis
            key_in_redis = await redis_client.get(f"idempotency:order_mass:{test_user_id}:{invalid_key}")
            assert key_in_redis is None, "PROCESSING key must be deleted on validation error so user can retry"
            print("  ✓ Lock correctly deleted from Redis upon validation failure.")

        print("\nALL SEC-09 IDEMPOTENCY FAIL-CLOSED TESTS PASSED SUCCESSFULLY! 🎉\n")

    finally:
        # Cleanup test data
        async with async_session_factory() as db:
            if test_user_id:
                await db.execute(delete(Order).where(Order.user_id == test_user_id))
                await db.execute(delete(User).where(User.id == test_user_id))
                await db.commit()
                print(f"[CLEANUP] Deleted test user {test_user_id} and associated orders.")


if __name__ == "__main__":
    asyncio.run(run_tests())
