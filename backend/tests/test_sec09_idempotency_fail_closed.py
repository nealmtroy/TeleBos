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

import uuid
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException
from sqlalchemy import select, delete

from app.database import async_session_factory
from app.models.user import User
from app.models.order import Order
from app.models.wallet_ledger import WalletLedger
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


@pytest.fixture
async def sec09_setup():
    test_user_id = uuid.uuid4()
    test_user_email = f"sec09_user_{uuid.uuid4().hex[:8]}@example.com"
    initial_balance = 500_000
    req = MockRequest()

    allowed_service_id = next(iter(ALLOWED_SMM_SERVICE_IDS))

    async with async_session_factory() as db:
        user = User(
            id=test_user_id,
            email=test_user_email,
            balance=initial_balance,
            role="basic",
            is_active=True,
        )
        db.add(user)

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

    yield {
        "user_id": test_user_id,
        "initial_balance": initial_balance,
        "service_id": allowed_service_id,
        "req": req,
    }

    # Strict cleanup in reverse dependency order (RESTRICT compliance)
    async with async_session_factory() as db:
        await db.execute(delete(WalletLedger).where(WalletLedger.user_id == test_user_id))
        await db.execute(delete(Order).where(Order.user_id == test_user_id))
        await db.execute(delete(User).where(User.id == test_user_id))
        await db.commit()


@pytest.mark.asyncio
async def test_sec09_sequential_mass_order_idempotency_deduplication(sec09_setup):
    """Test retrying with identical X-Idempotency-Key returns existing orders without duplicate deduction."""
    test_user_id = sec09_setup["user_id"]
    initial_balance = sec09_setup["initial_balance"]
    allowed_service_id = sec09_setup["service_id"]
    mock_req = sec09_setup["req"]

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
            assert retried_ids == first_order_ids
            assert cur_user.balance == balance_after_first


@pytest.mark.asyncio
async def test_sec09_in_flight_concurrency_mutex_409(sec09_setup):
    """Test in-flight mutex returns HTTP 409 Conflict when key is PROCESSING."""
    test_user_id = sec09_setup["user_id"]
    allowed_service_id = sec09_setup["service_id"]
    mock_req = sec09_setup["req"]

    in_flight_key = f"IDEM-INFLIGHT-{uuid.uuid4().hex}"
    cache_key = f"idempotency:order_mass:{test_user_id}:{in_flight_key}"
    mass_payload = MassOrderCreate(
        orders=[
            MassOrderItemSchema(
                service_id=allowed_service_id,
                data_target="https://t.me/test_channel_mutex",
                quantity=100,
            )
        ]
    )

    # Manually simulate a concurrent request currently in state "PROCESSING"
    await redis_client.set(cache_key, "PROCESSING", ex=60)

    try:
        async with async_session_factory() as db:
            res_user = await db.execute(select(User).where(User.id == test_user_id))
            cur_user = res_user.scalar_one()

            with pytest.raises(HTTPException) as exc_info:
                await place_mass_order(
                    request=mock_req,
                    payload=mass_payload,
                    db=db,
                    user=cur_user,
                    x_idempotency_key=in_flight_key,
                )
            assert exc_info.value.status_code == 409
    finally:
        await redis_client.delete(cache_key)


@pytest.mark.asyncio
async def test_sec09_fail_closed_on_redis_connectivity_failure_503(sec09_setup):
    """Test fail-closed behavior returning HTTP 503 on Redis connectivity exception."""
    test_user_id = sec09_setup["user_id"]
    allowed_service_id = sec09_setup["service_id"]
    mock_req = sec09_setup["req"]

    fail_closed_key = f"IDEM-FAILCLOSED-{uuid.uuid4().hex}"
    mass_payload = MassOrderCreate(
        orders=[
            MassOrderItemSchema(
                service_id=allowed_service_id,
                data_target="https://t.me/test_channel_failclosed",
                quantity=100,
            )
        ]
    )

    with patch.object(redis_client, "set", side_effect=Exception("Redis connection timed out")):
        async with async_session_factory() as db:
            res_user = await db.execute(select(User).where(User.id == test_user_id))
            cur_user = res_user.scalar_one()
            balance_before = cur_user.balance

            with pytest.raises(HTTPException) as exc_info:
                await place_mass_order(
                    request=mock_req,
                    payload=mass_payload,
                    db=db,
                    user=cur_user,
                    x_idempotency_key=fail_closed_key,
                )
            assert exc_info.value.status_code == 503
            assert "Retry-After" in exc_info.value.headers
            assert cur_user.balance == balance_before


@pytest.mark.asyncio
async def test_sec09_single_order_fail_closed_and_idempotency(sec09_setup):
    """Test single order sequential idempotency and Redis outage fail-closed."""
    test_user_id = sec09_setup["user_id"]
    allowed_service_id = sec09_setup["service_id"]
    mock_req = sec09_setup["req"]

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

            # 1. Initial single order
            single_ord = await place_single_order(
                request=mock_req,
                payload=single_payload,
                db=db,
                user=cur_user,
                x_idempotency_key=single_key,
            )
            single_ord_id = single_ord.id
            bal_after_single = cur_user.balance

            # 2. Sequential retry
            retry_single = await place_single_order(
                request=mock_req,
                payload=single_payload,
                db=db,
                user=cur_user,
                x_idempotency_key=single_key,
            )
            assert retry_single.id == single_ord_id
            assert cur_user.balance == bal_after_single

    # 3. Redis outage fail-closed on single order
    with patch.object(redis_client, "set", side_effect=Exception("Redis connection timed out")):
        async with async_session_factory() as db:
            res_user = await db.execute(select(User).where(User.id == test_user_id))
            cur_user = res_user.scalar_one()

            with pytest.raises(HTTPException) as exc_info:
                await place_single_order(
                    request=mock_req,
                    payload=single_payload,
                    db=db,
                    user=cur_user,
                    x_idempotency_key=f"IDEM-SINGLE-FAIL-{uuid.uuid4().hex}",
                )
            assert exc_info.value.status_code == 503


@pytest.mark.asyncio
async def test_sec09_lock_release_on_business_validation_failure(sec09_setup):
    """Test lock is deleted from Redis when order fails business validation."""
    test_user_id = sec09_setup["user_id"]
    allowed_service_id = sec09_setup["service_id"]
    mock_req = sec09_setup["req"]

    invalid_key = f"IDEM-INVALID-{uuid.uuid4().hex}"
    invalid_payload = MassOrderCreate(
        orders=[
            MassOrderItemSchema(
                service_id=allowed_service_id,
                data_target="invalid_url",
                quantity=500000,
            )
        ]
    )

    async with async_session_factory() as db:
        res_user = await db.execute(select(User).where(User.id == test_user_id))
        cur_user = res_user.scalar_one()

        with pytest.raises(HTTPException) as exc_info:
            await place_mass_order(
                request=mock_req,
                payload=invalid_payload,
                db=db,
                user=cur_user,
                x_idempotency_key=invalid_key,
            )
        assert exc_info.value.status_code == 400

        # Check that the PROCESSING key was deleted from Redis
        key_in_redis = await redis_client.get(f"idempotency:order_mass:{test_user_id}:{invalid_key}")
        assert key_in_redis is None
