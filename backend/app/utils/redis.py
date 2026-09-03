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


async def check_auto_reply_rate_limit(account_id: str) -> bool:
    """
    Check if an account is allowed to send an auto-reply.
    
    Verifies:
    1. Cooldown has passed (no auto-reply in last COOLDOWN_SECONDS).
    2. Hourly limit has not been exceeded.
    """
    try:
        # 1. Cooldown check
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


async def record_auto_reply_sent(account_id: str) -> None:
    """Record an auto-reply event, setting the cooldown and incrementing the hourly count."""
    try:
        # Set cooldown
        cooldown_key = f"autoreply:last_sent:{account_id}"
        await redis_client.setex(cooldown_key, COOLDOWN_SECONDS, "1")

        # Increment hourly count
        current_hour = int(time.time() // 3600)
        rate_key = f"autoreply:rate:{account_id}:{current_hour}"
        
        async with redis_client.pipeline(transaction=True) as pipe:
            await pipe.incr(rate_key)
            await pipe.expire(rate_key, 3600)
            await pipe.execute()
    except Exception as exc:
        logger.error("Failed to record auto-reply event in Redis: %s", exc)
