"""Unit tests for the Redis sliding-window rate limiter without Redis."""

from collections import defaultdict

from app.utils import rate_limiter


class FakeRedis:
    def __init__(self):
        self.values = defaultdict(dict)
        self.expirations = {}
        self.fail = False

    def _maybe_fail(self):
        if self.fail:
            raise ConnectionError("Redis unavailable")

    async def zremrangebyscore(self, key, minimum, maximum):
        self._maybe_fail()
        upper = float(maximum)
        self.values[key] = {
            member: score for member, score in self.values[key].items() if score > upper
        }

    async def zcard(self, key):
        self._maybe_fail()
        return len(self.values[key])

    async def zadd(self, key, values):
        self._maybe_fail()
        self.values[key].update(values)

    async def expire(self, key, seconds):
        self._maybe_fail()
        self.expirations[key] = seconds

    async def zrange(self, key, start, end, withscores=False):
        self._maybe_fail()
        entries = sorted(self.values[key].items(), key=lambda entry: entry[1])
        return entries[start : end + 1]

    async def delete(self, key):
        self._maybe_fail()
        self.values.pop(key, None)


def limiter_with_redis(monkeypatch, redis, **kwargs):
    limiter = rate_limiter.RedisRateLimiter(**kwargs)

    async def get_redis():
        return redis

    monkeypatch.setattr(limiter, "_redis", get_redis)
    return limiter


async def test_allows_until_limit_then_rejects(monkeypatch):
    clock = [100.0]
    monkeypatch.setattr(rate_limiter.time, "time", lambda: clock[0])
    redis = FakeRedis()
    limiter = limiter_with_redis(monkeypatch, redis, max_requests=2, window_seconds=60)

    assert await limiter.check("login")
    clock[0] += 0.001
    assert await limiter.check("login")
    clock[0] += 0.001
    assert not await limiter.check("login")
    assert redis.expirations["ratelimit:login"] == 60


async def test_per_call_limits_and_wait_time(monkeypatch):
    clock = [100.0]
    monkeypatch.setattr(rate_limiter.time, "time", lambda: clock[0])
    redis = FakeRedis()
    limiter = limiter_with_redis(monkeypatch, redis, max_requests=10, window_seconds=100)

    assert await limiter.check("login", max_requests=1, window_seconds=30)
    assert not await limiter.check("login", max_requests=1, window_seconds=30)
    assert await limiter.wait_time("login", max_requests=1, window_seconds=30) == 30.0
    clock[0] = 131.0
    assert await limiter.wait_time("login", max_requests=1, window_seconds=30) == 0.0


async def test_reset_and_failure_mode(monkeypatch):
    monkeypatch.setattr(rate_limiter.time, "time", lambda: 100.0)
    redis = FakeRedis()
    limiter = limiter_with_redis(monkeypatch, redis, max_requests=1, fails_open=True)
    await limiter.check("login")
    await limiter.reset("login")
    assert "ratelimit:login" not in redis.values

    redis.fail = True
    assert await limiter.check("login")

    closed_limiter = limiter_with_redis(monkeypatch, redis, max_requests=1, fails_open=False)
    assert not await closed_limiter.check("login")
