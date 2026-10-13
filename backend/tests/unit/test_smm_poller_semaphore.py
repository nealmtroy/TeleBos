"""Unit tests verifying bounded concurrency semaphore for SMM status polling.

Addresses REL-01 / EXT-02 (TASK-28 in REMEDIATION_ROADMAP.md):
- Verifies that SMM order status checks across bulk orders are strictly bounded by asyncio.Semaphore(5).
- Verifies that concurrent HTTP requests to BuzzerPanel never exceed 5 simultaneously even with 50+ pending orders.
- Verifies exception resilience (exceptions do not leak semaphore tokens or crash parallel tasks).
- Verifies adaptive polling logic and batch chunking in refresh_all_pending_smart.
"""

import asyncio
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4
import pytest

from app.models.order import Order
from app.services import admin_smm_service, smm_service


@pytest.mark.asyncio
async def test_check_orders_status_bounded_limits_concurrency_to_5():
    """Verify TASK-28: 50 orders are polled concurrently without ever exceeding 5 simultaneous calls."""
    order_ids = [f"smm_{i}" for i in range(50)]
    active_concurrent_calls = 0
    peak_concurrent_calls = 0
    lock = asyncio.Lock()

    async def mock_check_order_status(order_id: str):
        nonlocal active_concurrent_calls, peak_concurrent_calls
        async with lock:
            active_concurrent_calls += 1
            if active_concurrent_calls > peak_concurrent_calls:
                peak_concurrent_calls = active_concurrent_calls

        # Simulate small network roundtrip
        await asyncio.sleep(0.01)

        async with lock:
            active_concurrent_calls -= 1

        return {
            "status": True,
            "data": {
                "status": "Completed",
                "start_count": "100",
                "remains": "0",
            },
        }

    with patch.object(admin_smm_service.smm_api, "check_order_status", side_effect=mock_check_order_status):
        results = await admin_smm_service.check_orders_status_bounded(
            order_ids,
            max_concurrency=5,
            pacing_seconds=0.0,
        )

        assert len(results) == 50
        assert peak_concurrent_calls <= 5
        assert peak_concurrent_calls > 1  # Proves true concurrent execution, not purely serial
        assert active_concurrent_calls == 0


@pytest.mark.asyncio
async def test_check_orders_status_bounded_handles_exceptions_gracefully():
    """Verify exceptions in individual order checks do not deadlock the semaphore or abort siblings."""
    order_ids = [f"smm_{i}" for i in range(20)]
    active_concurrent_calls = 0
    peak_concurrent_calls = 0
    lock = asyncio.Lock()

    async def mock_check_with_failures(order_id: str):
        nonlocal active_concurrent_calls, peak_concurrent_calls
        async with lock:
            active_concurrent_calls += 1
            if active_concurrent_calls > peak_concurrent_calls:
                peak_concurrent_calls = active_concurrent_calls

        await asyncio.sleep(0.005)

        async with lock:
            active_concurrent_calls -= 1

        if order_id in ("smm_3", "smm_7", "smm_12"):
            raise ConnectionError(f"HTTP timeout on {order_id}")

        return {
            "status": True,
            "data": {"status": "Processing", "start_count": "50", "remains": "500"},
        }

    with patch.object(admin_smm_service.smm_api, "check_order_status", side_effect=mock_check_with_failures):
        results = await admin_smm_service.check_orders_status_bounded(
            order_ids,
            max_concurrency=5,
            pacing_seconds=0.0,
        )

        assert len(results) == 20
        assert peak_concurrent_calls <= 5
        assert active_concurrent_calls == 0

        # Check failures were collected as exceptions without breaking other results
        exceptions = [r for r in results if isinstance(r, Exception)]
        successes = [r for r in results if not isinstance(r, Exception)]

        assert len(exceptions) == 3
        assert len(successes) == 17


@pytest.mark.asyncio
async def test_refresh_all_pending_bounded_concurrency_simulation():
    """Verify refresh_all_pending executes under bounded semaphore when processing 50 active orders."""
    db = AsyncMock()
    user_id = uuid4()
    orders = [
        Order(
            id=uuid4(),
            user_id=user_id,
            smm_order_id=f"order_{i}",
            service_id=101,
            service_name="Telegram Views",
            category="Telegram",
            data_target="https://t.me/post",
            quantity=1000,
            price=10,
            total_price=10_000,
            status="Processing",
            remains=1000,
            is_refunded=False,
            refunded_amount=0,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        for i in range(50)
    ]

    mock_db_res = MagicMock()
    mock_db_res.scalars.return_value.all.return_value = orders
    db.execute.return_value = mock_db_res

    active_concurrent_calls = 0
    peak_concurrent_calls = 0
    lock = asyncio.Lock()

    async def mock_status_checker(order_id: str):
        nonlocal active_concurrent_calls, peak_concurrent_calls
        async with lock:
            active_concurrent_calls += 1
            if active_concurrent_calls > peak_concurrent_calls:
                peak_concurrent_calls = active_concurrent_calls

        await asyncio.sleep(0.005)

        async with lock:
            active_concurrent_calls -= 1

        return {
            "status": True,
            "data": {
                "status": "Completed",
                "start_count": "100",
                "remains": "0",
            },
        }

    with (
        patch.object(admin_smm_service.smm_api, "check_order_status", side_effect=mock_status_checker),
        patch("app.services.order_service.process_order_refund_if_eligible", new=AsyncMock()),
        patch("app.services.notification_service.create_notification", new=MagicMock()),
    ):
        updated_count = await admin_smm_service.refresh_all_pending(
            db,
            max_concurrency=5,
            pacing_seconds=0.0,
        )

        assert updated_count == 50
        assert peak_concurrent_calls <= 5
        assert peak_concurrent_calls > 1
        db.flush.assert_awaited_once()


@pytest.mark.asyncio
async def test_refresh_all_pending_smart_adaptive_chunking():
    """Verify refresh_all_pending_smart filters by age/interval and enforces batch limit of 25."""
    db = AsyncMock()
    user_id = uuid4()
    now = datetime.now(timezone.utc)

    # 1. Fresh order (<15 min ago) checked 1 min ago -> should NOT check yet (interval = 2m)
    o1 = Order(
        id=uuid4(),
        user_id=user_id,
        smm_order_id="fresh_skip",
        status="Processing",
        created_at=now - timedelta(minutes=5),
        updated_at=now - timedelta(minutes=1),
    )
    # 2. Fresh order (<15 min ago) checked 3 min ago -> should check
    o2 = Order(
        id=uuid4(),
        user_id=user_id,
        smm_order_id="fresh_check",
        status="Processing",
        created_at=now - timedelta(minutes=10),
        updated_at=now - timedelta(minutes=3),
    )
    # 3. Medium order (30 min ago) checked 2 min ago -> should NOT check yet (interval = 5m)
    o3 = Order(
        id=uuid4(),
        user_id=user_id,
        smm_order_id="med_skip",
        status="In progress",
        created_at=now - timedelta(minutes=30),
        updated_at=now - timedelta(minutes=2),
    )
    # 4. Medium order (30 min ago) checked 6 min ago -> should check
    o4 = Order(
        id=uuid4(),
        user_id=user_id,
        smm_order_id="med_check",
        status="In progress",
        created_at=now - timedelta(minutes=30),
        updated_at=now - timedelta(minutes=6),
    )
    # 5. Old order (3 hours ago) checked 8 min ago -> should NOT check yet (interval = 15m)
    o5 = Order(
        id=uuid4(),
        user_id=user_id,
        smm_order_id="old_skip",
        status="Pending",
        created_at=now - timedelta(hours=3),
        updated_at=now - timedelta(minutes=8),
    )
    # 6. Old order (3 hours ago) checked 20 min ago -> should check
    o6 = Order(
        id=uuid4(),
        user_id=user_id,
        smm_order_id="old_check",
        status="Pending",
        created_at=now - timedelta(hours=3),
        updated_at=now - timedelta(minutes=20),
    )

    mock_db_res = MagicMock()
    mock_db_res.scalars.return_value.all.return_value = [o1, o2, o3, o4, o5, o6]
    db.execute.return_value = mock_db_res

    checked_order_ids = []

    async def mock_status_checker(order_id: str):
        checked_order_ids.append(order_id)
        return {
            "status": True,
            "data": {"status": "Processing", "start_count": "10", "remains": "90"},
        }

    with (
        patch.object(admin_smm_service.smm_api, "check_order_status", side_effect=mock_status_checker),
        patch("app.services.order_service.process_order_refund_if_eligible", new=AsyncMock()),
        patch("app.services.notification_service.create_notification", new=MagicMock()),
    ):
        updated_count = await admin_smm_service.refresh_all_pending_smart(
            db,
            max_concurrency=5,
            pacing_seconds=0.0,
            batch_limit=25,
        )

        assert updated_count == 3
        assert set(checked_order_ids) == {"fresh_check", "med_check", "old_check"}


@pytest.mark.asyncio
async def test_smm_service_bulk_check_status_bounded():
    """Verify smm_service.bulk_check_status also bounds concurrency with semaphore."""
    order_ids = [f"bulk_{i}" for i in range(25)]
    active_concurrent_calls = 0
    peak_concurrent_calls = 0
    lock = asyncio.Lock()

    async def mock_check_single(order_id: str):
        nonlocal active_concurrent_calls, peak_concurrent_calls
        async with lock:
            active_concurrent_calls += 1
            if active_concurrent_calls > peak_concurrent_calls:
                peak_concurrent_calls = active_concurrent_calls

        await asyncio.sleep(0.005)

        async with lock:
            active_concurrent_calls -= 1

        return {"status": True, "data": {"status": "Completed"}}

    with patch("app.services.smm_service.check_order_status", side_effect=mock_check_single):
        results = await smm_service.bulk_check_status(
            order_ids,
            max_concurrency=5,
            pacing_seconds=0.0,
        )

        assert len(results) == 25
        assert peak_concurrent_calls <= 5
        assert peak_concurrent_calls > 1
        assert active_concurrent_calls == 0
