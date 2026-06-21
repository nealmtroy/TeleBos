"""WebSocket endpoint for real-time updates (chat events, broadcast progress)."""

import asyncio
import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.dependencies import decode_access_token
from app.core.redis import redis_client

logger = logging.getLogger(__name__)
router = APIRouter()

# Active WebSocket connections: {user_id: [WebSocket, ...]}
_active_connections: dict[str, list[WebSocket]] = {}


async def _listen_redis(user_id: str, websocket: WebSocket):
    """Background task: listen to Redis pub/sub channels for a user and forward to WS."""
    loop = asyncio.get_running_loop()
    # Subscribe to broadcast progress channel (pattern: broadcast_progress:*)
    # In production we'd use PSUBSCRIBE, but for simplicity we'll subscribe
    # to user-specific channels
    try:
        # Listen for user-specific messages from Redis
        pubsub = await redis_client.subscribe(f"user:{user_id}")
        while True:
            message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=30.0)
            if message and message.get("data"):
                try:
                    data = json.loads(message["data"])
                    await websocket.send_json(data)
                except (json.JSONDecodeError, Exception):
                    await websocket.send_text(message["data"])
            # Check if websocket is still connected
            try:
                await websocket.send_json({"type": "ping"})
            except Exception:
                break
    except asyncio.CancelledError:
        pass
    except Exception as e:
        logger.error("Redis listener error: %s", e)


@router.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str, token: str = ""):
    """WebSocket endpoint for real-time updates.

    Query parameter: ?token=<jwt_token>
    """
    # Validate token from query param
    query_token = websocket.query_params.get("token", "")
    if not query_token:
        await websocket.close(code=4001, reason="Missing token")
        return

    payload = decode_access_token(query_token)
    if not payload or payload.get("sub") != user_id:
        await websocket.close(code=4001, reason="Invalid token")
        return

    await websocket.accept()
    logger.info("WebSocket connected for user %s", user_id)

    if user_id not in _active_connections:
        _active_connections[user_id] = []
    _active_connections[user_id].append(websocket)

    # Start Redis listener
    redis_task = asyncio.create_task(_listen_redis(user_id, websocket))

    try:
        while True:
            # Client messages (keepalive)
            data = await websocket.receive_text()
            msg = json.loads(data)
            if msg.get("type") == "pong":
                pass  # keepalive
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected for user %s", user_id)
    except Exception as e:
        logger.error("WebSocket error for user %s: %s", user_id, e)
    finally:
        redis_task.cancel()
        if user_id in _active_connections:
            try:
                _active_connections[user_id].remove(websocket)
            except ValueError:
                pass
            if not _active_connections[user_id]:
                del _active_connections[user_id]


async def send_to_user(user_id: str, message: dict):
    """Send a JSON message to all connected WebSocket clients of a user."""
    if user_id not in _active_connections:
        return
    dead = []
    for ws in _active_connections[user_id]:
        try:
            await ws.send_json(message)
        except Exception:
            dead.append(ws)
    for ws in dead:
        try:
            _active_connections[user_id].remove(ws)
        except ValueError:
            pass


async def broadcast_progress(job_id: str, user_id: str, data: dict):
    """Convenience: publish progress to both Redis and direct WS."""
    # Also publish to Redis for persistence/other services
    await redis_client.publish(f"broadcast_progress:{job_id}", data)
    # Send to user's active WS connections
    await send_to_user(user_id, {"type": "broadcast_progress", "job_id": job_id, **data})
