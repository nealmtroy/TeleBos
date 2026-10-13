"""Shared isolated configuration for backend unit tests."""

import os

# These must be set before any app module imports and calls get_settings().
default_db_url = os.environ.get("DATABASE_URL") or "postgresql+asyncpg://postgres:postgres@localhost:5432/telebos"
default_db_sync = os.environ.get("DATABASE_URL_SYNC") or "postgresql://postgres:postgres@localhost:5432/telebos"
default_redis_url = os.environ.get("REDIS_URL") or "redis://localhost:6379/0"

os.environ.setdefault("APP_SECRET_KEY", "test-app-secret-key-not-for-production")
os.environ.setdefault("ENCRYPTION_KEY", "uA3GWsSzBbNTdhTwzl9iDujvVLHVP12n9Bss82aVMXc=")
os.environ["DATABASE_URL"] = default_db_url
os.environ["DATABASE_URL_SYNC"] = default_db_sync
os.environ["REDIS_URL"] = default_redis_url
os.environ.setdefault("TELEBOS_ENV", "test")
os.environ.setdefault("PRODUCTION", "false")

import pytest

from app.config import get_settings


@pytest.fixture(autouse=True)
def reset_settings_cache():
    """Keep cached settings isolated when a test changes environment variables."""
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture(autouse=True)
async def cleanup_async_resources():
    """Cleanly dispose async engine connections, Redis connections, and async locks at the end of each test."""
    yield
    import asyncio
    from app.database import engine
    await engine.dispose()
    try:
        from app.utils.redis import redis_client
        await redis_client.connection_pool.disconnect()
    except Exception:
        pass
    try:
        import app.services.session_manager as sm
        sm._connect_task_lock = asyncio.Lock()
        sm._connect_semaphore = asyncio.Semaphore(3)
        sm._sync_semaphore = asyncio.Semaphore(3)
        sm._connect_tasks.clear()
        sm._sync_tasks.clear()
        sm._tracked_tasks.clear()
    except Exception:
        pass
    try:
        from app.services.telegram_client import client_pool
        client_pool._locks.clear()
        client_pool._clients.clear()
    except Exception:
        pass
