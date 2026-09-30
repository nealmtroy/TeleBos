"""Shutdown teardown must be best-effort (PYTHON-FASTAPI-3)."""

import asyncio
import logging
from unittest.mock import AsyncMock, patch

import pytest

from app.main import _shutdown_resources


def _tasks():
    """Five already-spawned, harmless background tasks."""
    return {
        name: asyncio.create_task(asyncio.sleep(3600))
        for name in (
            "cleanup_task",
            "smm_sync_task",
            "smm_orders_poll_task",
            "media_cleanup_task",
            "redis_ws_bridge_task",
        )
    }


async def _cleanup(tasks):
    for t in tasks.values():
        t.cancel()
    await asyncio.gather(*tasks.values(), return_exceptions=True)


@pytest.mark.asyncio
async def test_redis_and_db_still_closed_after_telegram_failure():
    """The point of the guard: later steps must run after an earlier one fails."""
    closed: list[str] = []
    tasks = _tasks()
    try:
        with (
            patch("app.services.smm_service.close_smm_http_client", new=AsyncMock()),
            patch("app.services.session_manager.session_manager.stop", new=AsyncMock()),
            patch(
                "app.services.telegram_client.client_pool.stop",
                new=AsyncMock(side_effect=RuntimeError("MTProto socket gone")),
            ),
            patch(
                "app.utils.redis.redis_client.close",
                new=AsyncMock(side_effect=lambda: closed.append("redis")),
            ),
            patch("app.main.engine") as mock_engine,
        ):
            mock_engine.dispose = AsyncMock()
            await _shutdown_resources(**tasks)
    finally:
        await _cleanup(tasks)

    assert "redis" in closed, "Redis close was skipped after a teardown failure"
    mock_engine.dispose.assert_awaited_once()


@pytest.mark.asyncio
async def test_shutdown_never_raises(caplog):
    """Even when every step fails, shutdown must complete quietly."""
    tasks = _tasks()
    try:
        with (
            patch("app.services.smm_service.close_smm_http_client", new=AsyncMock()),
            patch(
                "app.services.session_manager.session_manager.stop",
                new=AsyncMock(side_effect=RuntimeError("session manager boom")),
            ),
            patch(
                "app.services.telegram_client.client_pool.stop",
                new=AsyncMock(side_effect=RuntimeError("pool boom")),
            ),
            patch(
                "app.utils.redis.redis_client.close",
                new=AsyncMock(side_effect=RuntimeError("redis boom")),
            ),
            patch("app.main.engine") as mock_engine,
        ):
            mock_engine.dispose = AsyncMock(side_effect=RuntimeError("engine boom"))
            with caplog.at_level(logging.WARNING, logger="app.main"):
                await _shutdown_resources(**tasks)  # must not raise
    finally:
        await _cleanup(tasks)

    logged = " ".join(r.getMessage() for r in caplog.records)
    assert "session manager boom" in logged
    assert "pool boom" in logged
    assert "redis boom" in logged
    assert "engine boom" in logged


@pytest.mark.asyncio
async def test_background_tasks_are_cancelled():
    tasks = _tasks()
    with (
        patch("app.services.smm_service.close_smm_http_client", new=AsyncMock()),
        patch("app.services.session_manager.session_manager.stop", new=AsyncMock()),
        patch("app.services.telegram_client.client_pool.stop", new=AsyncMock()),
        patch("app.utils.redis.redis_client.close", new=AsyncMock()),
        patch("app.main.engine") as mock_engine,
    ):
        mock_engine.dispose = AsyncMock()
        await _shutdown_resources(**tasks)

    for name, task in tasks.items():
        assert task.cancelled() or task.done(), f"{name} was left running"


@pytest.mark.asyncio
async def test_pool_stop_failure_is_contained_per_account(caplog):
    """A single client failing to disconnect must not abort the rest."""
    from app.services.telegram_client import TelegramClientPool

    pool = TelegramClientPool()
    acc = "11111111-1111-1111-1111-111111111111"
    pool._clients[acc] = {"client": AsyncMock(), "last_accessed": 0.0}

    async def boom(account_id, *, save_state=True):
        raise RuntimeError("socket gone")

    pool.remove = boom

    with caplog.at_level(logging.WARNING, logger="app.services.telegram_client"):
        await pool.stop()

    assert pool._clients == {}
    assert [r for r in caplog.records if "socket gone" in r.getMessage()]
