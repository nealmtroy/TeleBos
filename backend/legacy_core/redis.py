"""Redis helper — connection, pub/sub, caching."""

import json
import logging
from typing import Any, Optional

import redis.asyncio as aioredis

from app.core.config import settings

logger = logging.getLogger(__name__)


class RedisClient:
    """Async Redis wrapper with pub/sub, cache set/get, and JSON helpers."""

    def __init__(self) -> None:
        self._connection: Optional[aioredis.Redis] = None
        self._pubsub: Optional[aioredis.client.PubSub] = None

    async def connect(self) -> None:
        self._connection = aioredis.from_url(settings.redis_url, decode_responses=True)
        self._pubsub = self._connection.pubsub()
        logger.info("Connected to Redis at %s", settings.redis_host)

    async def disconnect(self) -> None:
        if self._pubsub:
            await self._pubsub.close()
        if self._connection:
            await self._connection.close()
            logger.info("Redis connection closed")

    @property
    def conn(self) -> aioredis.Redis:
        assert self._connection is not None, "Redis not connected"
        return self._connection

    # ── Cache ───────────────────────────────────────────────────────

    async def cache_set(self, key: str, value: Any, ttl: int = 300) -> None:
        await self.conn.setex(key, ttl, json.dumps(value))

    async def cache_get(self, key: str) -> Optional[Any]:
        raw = await self.conn.get(key)
        if raw is None:
            return None
        try:
            return json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            return raw

    async def cache_delete(self, key: str) -> None:
        await self.conn.delete(key)

    # ── Pub/Sub ─────────────────────────────────────────────────────

    async def publish(self, channel: str, message: Any) -> None:
        payload = json.dumps(message) if not isinstance(message, str) else message
        await self.conn.publish(channel, payload)

    async def subscribe(self, channel: str) -> aioredis.client.PubSub:
        await self._pubsub.subscribe(channel)
        return self._pubsub

    # ── Temp state (OTP, locks, etc.) ───────────────────────────────

    async def set_temp(self, key: str, value: Any, ttl: int = 120) -> None:
        await self.conn.setex(key, ttl, json.dumps(value))

    async def get_temp(self, key: str) -> Optional[Any]:
        return await self.cache_get(key)

    async def delete_temp(self, key: str) -> None:
        await self.conn.delete(key)


redis_client = RedisClient()
