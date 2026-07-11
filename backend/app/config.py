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

    # App secret — used for signed photo URLs and other HMAC operations
    APP_SECRET_KEY: str = "change-this-secret-key-in-production"

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
    RATE_LIMIT_PHOTO_MAX: int = 300
    RATE_LIMIT_PHOTO_WINDOW: int = 60
    RATE_LIMIT_WS_MAX: int = 150
    RATE_LIMIT_WS_WINDOW: int = 60
    RATE_LIMIT_FAILS_OPEN: bool = True

    # Trusted proxy CIDRs (in addition to hardcoded Cloudflare ranges).
    # Comma-separated in env, e.g. "10.0.0.0/8,172.16.0.0/12,192.168.0.0/16"
    # Docker default bridge/overlay networks and loopback are included by default.
    TRUSTED_PROXIES: list[str] = [
        "127.0.0.1/8",
        "10.0.0.0/8",
        "172.16.0.0/12",
        "192.168.0.0/16",
        "::1/128",
        "fc00::/7",
    ]

    # Telethon
    TELEGRAM_API_ID: int = 0  # Fill from my.telegram.org
    TELEGRAM_API_HASH: str = ""
    TELEGRAM_BOT_TOKEN: str = ""

    # 2Captcha (automated Turnstile solver)
    TWOCAPTCHA_API_KEY: str = ""

    # Groq AI
    GROQ_API_KEY_1: str = ""
    GROQ_API_KEY_2: str = ""
    GROQ_API_KEY_3: str = ""

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

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


@lru_cache
def get_settings() -> Settings:
    s = Settings()

    # ── Guard: reject well-known default secrets in production ────────
    if s.APP_SECRET_KEY == "change-this-secret-key-in-production":
        raise RuntimeError(
            "APP_SECRET_KEY is still set to the insecure default. "
            "Generate a strong random key and set the APP_SECRET_KEY env var."
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
