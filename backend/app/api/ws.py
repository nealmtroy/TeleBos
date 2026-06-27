"""WebSocket manager for real-time broadcast progress and chat updates.

Validates connections via Better Auth session tokens (opaque string, not JWT).
The frontend sends the session token as the first WS message:
    {"type": "auth", "token": "<session_token>"}
"""

import asyncio
import json
import logging
import uuid
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status
from sqlalchemy import select, text

from app.database import async_session_factory
from app.models.user import User as UserModel
from app.utils.rate_limiter import rate_limiter

logger = logging.getLogger(__name__)

router = APIRouter()


class ConnectionManager:
    """Manages WebSocket connections grouped by channel.

    Limits concurrent connections per channel to prevent socket exhaustion.
    """

    def __init__(self, max_per_channel: int = 10) -> None:
        # channel_name -> set of WebSocket connections
        self._connections: dict[str, set[WebSocket]] = {}
        self.max_per_channel = max_per_channel

    async def connect(self, channel: str, ws: WebSocket) -> bool:
        """Register a WebSocket connection.

        The WebSocket must already be accepted before calling this.
        Returns True if connected, False if the channel is at capacity.
        """
        conns = self._connections.get(channel, set())
        if len(conns) >= self.max_per_channel:
            await ws.close(code=status.WS_1008_POLICY_VIOLATION, reason="Too many connections for this channel")
            return False
        self._connections.setdefault(channel, set()).add(ws)
        return True

    def disconnect(self, channel: str, ws: WebSocket) -> None:
        conns = self._connections.get(channel, set())
        conns.discard(ws)
        if not conns:
            self._connections.pop(channel, None)

    async def broadcast(self, channel: str, data: dict) -> None:
        """Send a JSON message to all clients in a channel."""
        conns = list(self._connections.get(channel, set()))
        payload = json.dumps(data)
        for ws in conns:
            try:
                await ws.send_text(payload)
            except Exception:
                self.disconnect(channel, ws)

    async def send_progress(self, job_id: str, data: dict) -> None:
        await self.broadcast(f"broadcast:{job_id}", data)


manager = ConnectionManager()


async def _ws_rate_limit(websocket: WebSocket, key: str) -> bool:
    """Check rate limit for a WebSocket connection.

    The WebSocket must already be accepted before calling this.
    Returns True if allowed, False if rate-limited (websocket already closed).
    """
    from app.config import get_settings
    s = get_settings()
    if not await rate_limiter.check(
        f"ws:{key}",
        max_requests=s.RATE_LIMIT_WS_MAX,
        window_seconds=s.RATE_LIMIT_WS_WINDOW
    ):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Too many connection attempts. Try later.")
        return False
    return True


async def _wait_for_auth_message(websocket: WebSocket) -> UserModel | None:
    """Accept connection and wait for first message containing JWT token.

    Expected format: {"type": "auth", "token": "<jwt>"}
    Returns the authenticated User or None on failure.
    """
    # Must accept before we can receive
    await websocket.accept()

    try:
        data = await asyncio.wait_for(websocket.receive_text(), timeout=10.0)
    except asyncio.TimeoutError:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Authentication timeout")
        return None

    try:
        msg = json.loads(data)
    except json.JSONDecodeError:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid auth message")
        return None

    if not isinstance(msg, dict) or msg.get("type") != "auth":
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Expected auth message")
        return None

    token = msg.get("token")
    if not token:
        # Fallback to cookies
        token = websocket.cookies.get("better-auth.session_token") or websocket.cookies.get("__Secure-better-auth.session_token")
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Token missing")
        return None

    # Rate-limit by IP
    client_host = websocket.client.host if websocket.client else "unknown"
    if not await _ws_rate_limit(websocket, f"connect:ip:{client_host}"):
        return None

    # Validate the token against Better Auth's session table
    # (same pattern as dependencies.py — raw SQL against BA tables)
    async with async_session_factory() as db:
        result = await db.execute(
            text("""
                SELECT s."userId" AS user_id, s."expiresAt" AS expires_at, u.email
                FROM session s
                JOIN "user" u ON u.id = s."userId"
                WHERE s.token = :token
                LIMIT 1
            """),
            {"token": token},
        )
        row = result.one_or_none()

        if row is None:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid token payload")
            return None

        from datetime import datetime, timezone
        expires_at = row.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < datetime.now(timezone.utc):
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Session expired")
            return None

        # Load the User model via email (same bridge as dependencies.py —
        # BA uses UUID strings, our legacy users table uses PostgreSQL UUID type)
        user_result = await db.execute(
            select(UserModel).where(UserModel.email == row.email)
        )
        user = user_result.scalar_one_or_none()
        if user is None or not user.is_active:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="User not found or inactive")
            return None

        # Per-user rate limit
        from app.config import get_settings
        s = get_settings()
        if not await rate_limiter.check(
            f"ws:user:{user.id}",
            max_requests=s.RATE_LIMIT_WS_MAX,
            window_seconds=s.RATE_LIMIT_WS_WINDOW
        ):
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Too many connection attempts. Try later.")
            return None

        return user


@router.websocket("/ws/broadcast/{job_id}")
async def ws_broadcast(websocket: WebSocket, job_id: str):
    """Listen for real-time progress updates on a broadcast job."""
    channel = f"broadcast:{job_id}"

    user = await _wait_for_auth_message(websocket)
    if not user:
        return

    # Enforce ownership check
    try:
        job_uuid = uuid.UUID(job_id)
    except ValueError:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid job ID")
        return

    from app.models.broadcast_job import BroadcastJob
    async with async_session_factory() as db:
        result = await db.execute(select(BroadcastJob).where(BroadcastJob.id == job_uuid))
        job = result.scalar_one_or_none()
        if job is None or job.user_id != user.id:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Unauthorized or job not found")
            return

    if not await manager.connect(channel, websocket):
        return
    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            if msg.get("type") == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.warning("WS %s error: %s", channel, exc)
    finally:
        manager.disconnect(channel, websocket)


@router.websocket("/ws/chats/{account_id}")
async def ws_chats(websocket: WebSocket, account_id: str):
    """Listen for real-time chat updates for an account."""
    channel = f"chats:{account_id}"

    user = await _wait_for_auth_message(websocket)
    if not user:
        return

    # Enforce ownership check
    try:
        account_uuid = uuid.UUID(account_id)
    except ValueError:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid account ID")
        return

    from app.models.telegram_account import TelegramAccount
    async with async_session_factory() as db:
        result = await db.execute(select(TelegramAccount).where(TelegramAccount.id == account_uuid))
        account = result.scalar_one_or_none()
        if account is None or account.user_id != user.id:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Unauthorized or account not found")
            return

    if not await manager.connect(channel, websocket):
        return
    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            if msg.get("type") == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.warning("WS chats %s error: %s", channel, exc)
    finally:
        manager.disconnect(channel, websocket)


@router.websocket("/ws/invite/{job_id}")
async def ws_invite(websocket: WebSocket, job_id: str):
    """Listen for real-time progress updates on an invite job."""
    channel = f"invite:{job_id}"

    user = await _wait_for_auth_message(websocket)
    if not user:
        return

    # Enforce ownership check
    try:
        job_uuid = uuid.UUID(job_id)
    except ValueError:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid job ID")
        return

    from app.models.invite_job import InviteJob
    async with async_session_factory() as db:
        result = await db.execute(select(InviteJob).where(InviteJob.id == job_uuid))
        job = result.scalar_one_or_none()
        if job is None or job.user_id != user.id:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Unauthorized or job not found")
            return

    if not await manager.connect(channel, websocket):
        return
    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            if msg.get("type") == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.warning("WS invite %s error: %s", channel, exc)
    finally:
        manager.disconnect(channel, websocket)
