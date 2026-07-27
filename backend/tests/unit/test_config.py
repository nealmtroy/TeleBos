"""Tests for settings parsing and insecure-default startup guards."""

import pytest

from app.config import get_settings


@pytest.mark.parametrize(
    ("name", "value", "expected"),
    [
        ("RATE_LIMIT_DEFAULT_MAX", "42", 42),
        ("RATE_LIMIT_FAILS_OPEN", "false", False),
    ],
)
def test_settings_parse_environment_values(monkeypatch, name, value, expected):
    monkeypatch.setenv(name, value)
    get_settings.cache_clear()

    assert getattr(get_settings(), name) == expected


def test_insecure_app_secret_is_rejected(monkeypatch):
    monkeypatch.setenv("APP_SECRET_KEY", "change-this-secret-key-in-production")
    get_settings.cache_clear()

    with pytest.raises(RuntimeError, match="APP_SECRET_KEY"):
        get_settings()


def test_default_database_url_is_only_rejected_in_production(monkeypatch):
    monkeypatch.setenv(
        "DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/telebos"
    )
    monkeypatch.delenv("TELEBOS_ENV", raising=False)
    get_settings.cache_clear()
    assert get_settings().DATABASE_URL.endswith("/telebos")

    monkeypatch.setenv("TELEBOS_ENV", "production")
    get_settings.cache_clear()
    with pytest.raises(RuntimeError, match="DATABASE_URL"):
        get_settings()
