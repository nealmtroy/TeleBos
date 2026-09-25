"""Redis client connection and security helpers."""

import logging
import time
import redis.asyncio as aioredis
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Initialize the async redis client
redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)


# Auto-reply Rate Limiter & Cooldown Defaults
MAX_REPLIES_PER_HOUR = 30
COOLDOWN_SECONDS = 5


async def check_auto_reply_rate_limit(account_id: str, sender_id: int | str | None = None) -> bool:
    """
    Check if an account is allowed to send an auto-reply.
    
    Verifies:
    1. Cooldown has passed for this sender (or account-level if sender_id not specified).
    2. Hourly limit has not been exceeded.
    """
    try:
        # 1. Cooldown check: per sender if available, fallback to account level
        if sender_id is not None:
            sender_cooldown_key = f"autoreply:cooldown:{account_id}:{sender_id}"
            if await redis_client.exists(sender_cooldown_key):
                return False
        else:
            cooldown_key = f"autoreply:last_sent:{account_id}"
            if await redis_client.exists(cooldown_key):
                return False

        # 2. Hourly rate limit check
        current_hour = int(time.time() // 3600)
        rate_key = f"autoreply:rate:{account_id}:{current_hour}"
        count = await redis_client.get(rate_key)
        if count and int(count) >= MAX_REPLIES_PER_HOUR:
            return False

        return True
    except Exception as exc:
        logger.error("Failed to check auto-reply rate limit in Redis: %s", exc)
        # Fallback to True under Redis failures so we don't break auto-reply functionality
        return True


async def record_auto_reply_sent(account_id: str, sender_id: int | str | None = None) -> None:
    """Record an auto-reply event, setting the cooldown and incrementing the hourly count."""
    try:
        current_hour = int(time.time() // 3600)
        rate_key = f"autoreply:rate:{account_id}:{current_hour}"

        async with redis_client.pipeline(transaction=True) as pipe:
            # Set per-sender cooldown if sender_id provided
            if sender_id is not None:
                pipe.setex(f"autoreply:cooldown:{account_id}:{sender_id}", COOLDOWN_SECONDS, "1")
            # Set short burst guard for account
            pipe.setex(f"autoreply:last_sent:{account_id}", 1, "1")

            # Increment hourly count
            pipe.incr(rate_key)
            pipe.expire(rate_key, 3600)
            await pipe.execute()
    except Exception as exc:
        logger.error("Failed to record auto-reply event in Redis: %s", exc)


# ── Auto-reply In-Memory / Redis Caching ─────────────────────────────────────

async def get_auto_reply_config(account_id: str) -> dict | None:
    """
    Get cached auto-reply configuration from Redis.
    
    Returns a dict with 'enabled' (bool) and 'text' (str | None), or None on cache miss.
    """
    try:
        key = f"account:autoreply:{account_id}"
        data = await redis_client.hgetall(key)
        if not data:
            return None
        return {
            "enabled": data.get("enabled") == "1",
            "text": data.get("text") or None,
        }
    except Exception as exc:
        logger.error("Failed to read auto-reply config from Redis for %s: %s", account_id, exc)
        return None


async def set_auto_reply_config(account_id: str, enabled: bool, text: str | None) -> None:
    """Cache auto-reply configuration in Redis with a 24-hour TTL."""
    try:
        key = f"account:autoreply:{account_id}"
        mapping = {
            "enabled": "1" if enabled else "0",
            "text": text or "",
        }
        await redis_client.hset(key, mapping=mapping)
        await redis_client.expire(key, 86400)
    except Exception as exc:
        logger.error("Failed to set auto-reply config in Redis for %s: %s", account_id, exc)


async def invalidate_auto_reply_config(account_id: str) -> None:
    """Invalidate cached auto-reply configuration in Redis."""
    try:
        await redis_client.delete(f"account:autoreply:{account_id}")
    except Exception as exc:
        logger.error("Failed to invalidate auto-reply config in Redis for %s: %s", account_id, exc)


async def is_auto_reply_sent_to_user(account_id: str, sender_id: int | str) -> bool:
    """Check if an auto-reply was already sent to this sender (cached in Redis)."""
    try:
        return bool(await redis_client.exists(f"autoreply:replied:{account_id}:{sender_id}"))
    except Exception as exc:
        logger.error("Failed to check replied cache in Redis: %s", exc)
        return False


async def mark_auto_reply_sent_to_user(
    account_id: str, sender_id: int | str, ttl_seconds: int = 86400 * 30
) -> None:
    """Cache that an auto-reply was sent to this sender for 30 days in Redis."""
    try:
        await redis_client.setex(f"autoreply:replied:{account_id}:{sender_id}", ttl_seconds, "1")
    except Exception as exc:
        logger.error("Failed to mark replied in Redis: %s", exc)

