"""Unit tests for System Health & Telemetry infrastructure."""

import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock, MagicMock

from app.main import app
from app.dependencies import get_current_user, get_db
from app.services.system_health_service import SystemTelemetryTracker


@pytest.mark.asyncio
async def test_system_telemetry_request_recording_and_percentiles():
    tracker = SystemTelemetryTracker()

    # Record normal requests
    tracker.record_request("GET", "/api/v1/accounts", 200, 25.0)
    tracker.record_request("GET", "/api/v1/chats", 200, 30.0)
    tracker.record_request("POST", "/api/v1/broadcast/start", 200, 100.0)
    tracker.record_request("GET", "/api/v1/orders/123", 404, 15.0)
    tracker.record_request("POST", "/api/v1/admin/login", 500, 45.0, error_detail="Simulated DB Error")

    metrics = tracker.get_api_metrics()

    assert metrics.total_requests == 5
    assert metrics.status_2xx_count == 3
    assert metrics.status_4xx_count == 1
    assert metrics.status_5xx_count == 1
    assert metrics.error_4xx_rate == 20.0
    assert metrics.error_5xx_rate == 20.0
    assert metrics.latency_p50_ms > 0
    assert metrics.latency_p95_ms >= metrics.latency_p50_ms

    # Check incident was captured for 500
    assert len(tracker.recent_incidents) == 1
    incident = tracker.recent_incidents[0]
    assert incident.status_code == 500
    assert incident.subsystem == "api"
    assert "Simulated DB Error" in incident.summary


@pytest.mark.asyncio
async def test_system_telemetry_slow_request_tracking():
    tracker = SystemTelemetryTracker()

    # Fast request
    tracker.record_request("GET", "/fast", 200, 40.0)
    assert len(tracker.slow_requests) == 0

    # Slow request (> 500ms)
    tracker.record_request("GET", "/slow", 200, 650.0)
    assert len(tracker.slow_requests) == 1
    assert tracker.slow_requests[0]["duration_ms"] == 650.0
    assert tracker.slow_requests[0]["path"] == "/slow"


@pytest.mark.asyncio
async def test_system_resources_and_uptime():
    tracker = SystemTelemetryTracker()

    resources = tracker.get_system_resources()
    assert resources.cpu_cores >= 1
    assert resources.memory_total_bytes > 0
    assert resources.memory_percent >= 0.0
    assert resources.disk_total_bytes > 0

    api_metrics = tracker.get_api_metrics()
    db_metrics = MagicMock(is_connected=True)
    queue_metrics = MagicMock(is_redis_connected=True, worker_health_status="healthy")

    uptime = tracker.get_uptime_and_incidents(
        api_metrics=api_metrics,
        db_metrics=db_metrics,
        queue_metrics=queue_metrics,
        resources=resources,
    )

    assert uptime.uptime_seconds >= 0
    assert uptime.system_status in ("healthy", "degraded", "critical")
    assert "Metrik telemetri dikumpulkan secara langsung" in uptime.measurement_limitations_note


@pytest.mark.asyncio
async def test_database_health_probe():
    tracker = SystemTelemetryTracker()
    mock_db = AsyncMock()
    mock_db.execute = AsyncMock(return_value=MagicMock())
    db_health = await tracker.get_database_health(mock_db)

    assert db_health.is_connected is True
    assert db_health.pool_size >= 1
    assert db_health.query_ping_latency_ms >= 0.0
    assert db_health.database_dialect == "postgresql+asyncpg"


@pytest.mark.asyncio
async def test_system_health_endpoint_authorization():
    mock_owner = MagicMock()
    mock_owner.id = "owner-1"
    mock_owner.role = "owner"
    mock_owner.email = "owner@telebos.id"

    mock_regular = MagicMock()
    mock_regular.id = "user-1"
    mock_regular.role = "user"
    mock_regular.email = "user@telebos.id"

    mock_db = AsyncMock()
    mock_db.add = MagicMock()

    # Owner access: should return 200 with full health metrics
    app.dependency_overrides[get_current_user] = lambda: mock_owner
    app.dependency_overrides[get_db] = lambda: mock_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://localhost") as client:
        res = await client.get("/api/v1/admin/analytics/system-health")
        assert res.status_code == 200
        data = res.json()

        assert "measured_at" in data
        assert "overall_status" in data
        assert "resources" in data
        assert "api_traffic" in data
        assert "database" in data
        assert "queue_workers" in data
        assert "realtime" in data
        assert "uptime_incidents" in data
        assert "timeseries" in data
        assert data["database"]["is_connected"] is True

    # Non-owner access: should return 403 Forbidden
    app.dependency_overrides[get_current_user] = lambda: mock_regular
    async with AsyncClient(transport=transport, base_url="http://localhost") as client:
        res_fail = await client.get("/api/v1/admin/analytics/system-health")
        assert res_fail.status_code == 403

    app.dependency_overrides.clear()
