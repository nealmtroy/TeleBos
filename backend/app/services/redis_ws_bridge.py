"""Redis to WebSocket bridge service.

Listens to Redis Pub/Sub events emitted by background workers (or other API nodes)
and forwards them to connected frontend clients via FastAPI's native WebSocket ConnectionManager.
"""

import asyncio
import json
import logging
from app.utils.redis import redis_client
from app.utils.redis_dispatcher import WS_EVENTS_CHANNEL

logger = logging.getLogger(__name__)


async def redis_ws_bridge_loop() -> None:
    """Continuously listen to Redis Pub/Sub and relay events to WebSocket clients."""
    from app.api.ws import manager

    logger.info("Redis WebSocket bridge task started (subscribing to %s)", WS_EVENTS_CHANNEL)
    while True:
        try:
            pubsub = redis_client.pubsub()
            await pubsub.subscribe(WS_EVENTS_CHANNEL)
            try:
                async for message in pubsub.listen():
                    if message and message.get("type") == "message":
                        data_raw = message.get("data")
                        if not data_raw:
                            continue
                        try:
                            parsed = json.loads(data_raw)
                            channel = parsed.get("channel")
                            event_data = parsed.get("event_data", {})
                            if channel and event_data:
                                await manager.broadcast(channel, event_data)
                        except Exception as parse_exc:
                            logger.warning("Error parsing/broadcasting Redis WS message: %s", parse_exc)
            finally:
                try:
                    await pubsub.unsubscribe(WS_EVENTS_CHANNEL)
                    await pubsub.close()
                except Exception:
                    pass
        except asyncio.CancelledError:
            logger.info("Redis WebSocket bridge task cancelled")
            break
        except Exception as conn_exc:
            logger.warning("Redis WebSocket bridge disconnected: %s. Reconnecting in 3s...", conn_exc)
            await asyncio.sleep(3.0)
