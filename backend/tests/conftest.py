"""Shared isolated configuration for backend unit tests."""

import os

# These must be set before any app module imports and calls get_settings().
os.environ.update(
    {
        "APP_SECRET_KEY": "test-app-secret-key-not-for-production",
        "ENCRYPTION_KEY": "uA3GWsSzBbNTdhTwzl9iDujvVLHVP12n9Bss82aVMXc=",
        "DATABASE_URL": "postgresql+asyncpg://test:test@localhost:5432/test",
        "DATABASE_URL_SYNC": "postgresql://test:test@localhost:5432/test",
        "REDIS_URL": "redis://localhost:6379/15",
        "CELERY_BROKER_URL": "redis://localhost:6379/14",
        "CELERY_RESULT_BACKEND": "redis://localhost:6379/13",
        "TELEBOS_ENV": "test",
        "PRODUCTION": "false",
    }
)

import pytest

from app.config import get_settings


@pytest.fixture(autouse=True)
def reset_settings_cache():
    """Keep cached settings isolated when a test changes environment variables."""
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()
