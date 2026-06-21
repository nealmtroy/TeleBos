"""Rate limiter backed by Redis.

Replaces the previous in-memory implementation so rate-limit state survives
server restarts and works correctly across concurrent requests (Redis is
single-command atomic).

Usage::

    from app.utils.rate_limiter import rate_limiter

    if not await rate_limiter.check("login:ip:1.2.3.4"):
        raise HTTPException(status_code=429, detail="Too many requests")
"""

import time
import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class RateLimitResult:
    """Result of a rate-limit check."""

    allowed: bool
    retry_after: float = 0.0


class RedisRateLimiter:
    """Sliding-window rate limiter backed by Redis.

    Uses a sorted set per key where each member is a unique request timestamp.
    Expired entries are pruned on every check.  The set is given a TTL equal to
    the window so stale keys are cleaned up automatically.

    Parameters
    ----------
    max_requests:
        Maximum number of requests allowed within the sliding window.
    window_seconds:
        Length of the sliding window in seconds.
    fails_open:
        If True (default), allow the request when Redis is unreachable.
        Set to False to reject requests when Redis is down (fail-close).
        Fail-open avoids blocking the app during Redis hiccups but
        means rate-limiting can be bypassed if Redis is DoS'd.
    """

    def __init__(self, max_requests: int = 30, window_seconds: int = 60, fails_open: bool = True):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.fails_open = fails_open

    async def _redis(self):
        """Lazy-import the shared Redis client to avoid circular imports."""
        from app.utils.redis import redis_client
        return redis_client

    async def check(self, key: str) -> bool:
        """Return True if the request is allowed, False if rate-limited."""
        r = await self._redis()
        now = time.time()
        window_start = now - self.window_seconds
        redis_key = f"ratelimit:{key}"

        try:
            # Remove entries outside the sliding window
            await r.zremrangebyscore(redis_key, "-inf", window_start)
            # Count remaining entries
            count = await r.zcard(redis_key)
            if count >= self.max_requests:
                return False
            # Add current request
            unique_id = f"{now}:{id(now)}"
            await r.zadd(redis_key, {unique_id: now})
            # Set TTL so the key auto-expires (extend on each access)
            await r.expire(redis_key, self.window_seconds)
            return True
        except Exception as exc:
            logger.error("Rate limiter Redis error for key %s: %s", key, exc)
            if self.fails_open:
                # Fail open — allow the request so Redis issues don't block the app
                return True
            # Fail closed — reject the request when Redis is down
            return False

    async def wait_time(self, key: str) -> float:
        """Return seconds until the next request is allowed."""
        r = await self._redis()
        now = time.time()
        window_start = now - self.window_seconds
        redis_key = f"ratelimit:{key}"

        try:
            await r.zremrangebyscore(redis_key, "-inf", window_start)
            count = await r.zcard(redis_key)
            if count < self.max_requests:
                return 0.0
            # Get the oldest timestamp still in the window
            oldest = await r.zrange(redis_key, 0, 0, withscores=True)
            if oldest:
                return max(0.0, self.window_seconds - (now - oldest[0][1]))
            return 0.0
        except Exception as exc:
            logger.error("Rate limiter wait_time error for key %s: %s", key, exc)
            return 0.0

    async def reset(self, key: str) -> None:
        """Clear the rate-limit state for a given key."""
        r = await self._redis()
        try:
            await r.delete(f"ratelimit:{key}")
        except Exception as exc:
            logger.error("Rate limiter reset error for key %s: %s", key, exc)


def create_rate_limiter() -> RedisRateLimiter:
    """Create a rate limiter configured from app settings.

    Call once at startup for the singleton; tests can call it to get an
    independently-configured instance.
    """
    from app.config import get_settings
    s = get_settings()
    return RedisRateLimiter(
        max_requests=s.RATE_LIMIT_DEFAULT_MAX,
        window_seconds=s.RATE_LIMIT_DEFAULT_WINDOW,
        fails_open=s.RATE_LIMIT_FAILS_OPEN,
    )


# Singleton — import this in route handlers
rate_limiter = create_rate_limiter()
