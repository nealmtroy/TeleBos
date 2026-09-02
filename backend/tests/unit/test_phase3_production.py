"""Unit tests validating Fase 3 production hardening, deep health check, and config parsers."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import Response, status

from app.config import Settings


def test_cors_origins_flexible_parser():
    """Verify CORS_ORIGINS parser accepts JSON strings, comma-separated strings, and lists."""
    # 1. JSON list string
    res_json = Settings.assemble_cors_origins('["https://app.telebos.com", "https://tele.t-me.site"]')
    assert res_json == ["https://app.telebos.com", "https://tele.t-me.site"]

    # 2. Comma-separated string
    res_csv = Settings.assemble_cors_origins("https://app.telebos.com, https://tele.t-me.site, http://localhost:3000")
    assert res_csv == ["https://app.telebos.com", "https://tele.t-me.site", "http://localhost:3000"]

    # 3. Single string
    res_single = Settings.assemble_cors_origins("http://localhost:3000")
    assert res_single == ["http://localhost:3000"]

    # 4. Native list
    res_list = Settings.assemble_cors_origins(["http://localhost:3000", "https://test.com"])
    assert res_list == ["http://localhost:3000", "https://test.com"]


@pytest.mark.asyncio
async def test_deep_health_check_healthy():
    """Verify /api/v1/health returns 200 OK when both DB and Redis are healthy."""
    from app.main import health

    response = Response()
    with patch("app.main.engine") as mock_engine, \
         patch("app.utils.redis.redis_client.ping", new_callable=AsyncMock) as mock_ping:

        mock_conn = AsyncMock()
        mock_conn.execute = AsyncMock()
        mock_engine.connect.return_value.__aenter__.return_value = mock_conn
        mock_ping.return_value = True

        result = await health(response)

        assert result["status"] == "ok"
        assert result["database"] == "ok"
        assert result["redis"] == "ok"
        assert response.status_code == status.HTTP_200_OK


@pytest.mark.asyncio
async def test_deep_health_check_unhealthy_database():
    """Verify /api/v1/health returns 503 Service Unavailable when DB is down."""
    from app.main import health

    response = Response()
    with patch("app.main.engine") as mock_engine, \
         patch("app.utils.redis.redis_client.ping", new_callable=AsyncMock) as mock_ping:

        mock_engine.connect.side_effect = Exception("Database connection timeout")
        mock_ping.return_value = True

        result = await health(response)

        assert result["status"] == "unhealthy"
        assert "error" in result["database"]
        assert result["redis"] == "ok"
        assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
