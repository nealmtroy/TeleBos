"""Application configuration via environment variables."""

from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # App
    APP_NAME: str = "TeleBos API"
    DEBUG: bool = False
    PRODUCTION: bool = False  # Set True in production — enables Secure cookies, HSTS, etc.

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/telebos"
    DATABASE_URL_SYNC: str = "postgresql://postgres:postgres@localhost:5432/telebos"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # Celery
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"

    # JWT
    JWT_SECRET_KEY: str = "change-this-secret-key-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Encryption (Fernet key — 32 base64-encoded bytes)
    ENCRYPTION_KEY: str = (
        "dGhpcyBpcyBhIDMyIGJ5dGUgYmFzZTY0IGVuY29kZWQga2V5IGZvciBmZXJuZXQ="
    )

    # CORS
    CORS_ORIGINS: list[str] = ["http://localhost:3000"]

    # Rate limiting
    RATE_LIMIT_DEFAULT_MAX: int = 30
    RATE_LIMIT_DEFAULT_WINDOW: int = 60
    RATE_LIMIT_2FA_MAX: int = 5
    RATE_LIMIT_2FA_WINDOW: int = 300  # 5 min
    RATE_LIMIT_FAILS_OPEN: bool = True

    # Telethon
    TELEGRAM_API_ID: int = 0  # Fill from my.telegram.org
    TELEGRAM_API_HASH: str = ""

    # UptimeRobot
    UPTIMEROBOT_API_KEY: str = ""
    UPTIMEROBOT_MONITOR_IDS: str = ""
    UPTIMEROBOT_API_URL: str = "https://api.uptimerobot.com/v2"

    # Broadcast defaults
    BROADCAST_DEFAULT_DELAY: int = 5
    BROADCAST_MAX_CONCURRENT: int = 3
    BROADCAST_FLOOD_WAIT_MULTIPLIER: float = 1.5

    # Default destination for broadcast cycle logs (sent by the broadcasting account)
    BROADCAST_LOG_DEFAULT_DEST: str = "@teleboslogging_bot"

    # SMM Panel (Buzzerpanel.id)
    SMM_API_URL: str = "https://buzzerpanel.id/api/json.php"
    SMM_API_KEY: str = ""
    SMM_SECRET_KEY: str = ""

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


@lru_cache
def get_settings() -> Settings:
    s = Settings()

    # ── Guard: reject well-known default secrets in production ────────
    if s.JWT_SECRET_KEY == "change-this-secret-key-in-production":
        raise RuntimeError(
            "JWT_SECRET_KEY is still set to the insecure default. "
            "Generate a strong random key and set the JWT_SECRET_KEY env var."
        )
    if s.ENCRYPTION_KEY == "dGhpcyBpcyBhIDMyIGJ5dGUgYmFzZTY0IGVuY29kZWQga2V5IGZvciBmZXJuZXQ=":
        raise RuntimeError(
            "ENCRYPTION_KEY is still set to the insecure default. "
            "Generate a valid Fernet key (32 base64-encoded bytes) and set the ENCRYPTION_KEY env var."
        )
    if s.DATABASE_URL == "postgresql+asyncpg://postgres:postgres@localhost:5432/telebos":
        import os
        if os.environ.get("TELEBOS_ENV") == "production":
            raise RuntimeError(
                "DATABASE_URL is still set to the default dev value. "
                "Set the DATABASE_URL env var for production."
            )

    return s
