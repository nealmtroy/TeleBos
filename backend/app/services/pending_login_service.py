"""Short-lived, server-authoritative Telegram login state."""

import asyncio
import logging
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)

LOGIN_TTL_SECONDS = 300


@dataclass
class PendingLogin:
    login_id: str
    user_id: str
    phone: str
    client: Any
    phone_code_hash: str
    sent_code: dict[str, Any]
    created_at: float = field(default_factory=time.time)
    last_activity_at: float = field(default_factory=time.time)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    disconnected: bool = False


class PendingLoginManager:
    """Owns unauthenticated Telethon clients for one process only.

    Clients cannot be put in Redis safely, so deployments with multiple backend
    workers must use sticky routing for these short-lived login endpoints.
    """

    def __init__(self) -> None:
        self._entries: dict[str, PendingLogin] = {}
        self._lock = asyncio.Lock()

    async def create(
        self,
        *,
        user_id: str,
        phone: str,
        client: Any,
        phone_code_hash: str,
        sent_code: dict[str, Any],
    ) -> PendingLogin:
        entry = PendingLogin(
            login_id=uuid.uuid4().hex,
            user_id=user_id,
            phone=phone,
            client=client,
            phone_code_hash=phone_code_hash,
            sent_code=sent_code,
        )
        async with self._lock:
            previous = [
                item for item in self._entries.values()
                if item.user_id == user_id and item.phone == phone
            ]
            self._entries[entry.login_id] = entry
        for item in previous:
            await self.discard(item.login_id, expected=item)
        return entry

    async def get(self, login_id: str, user_id: str) -> PendingLogin | None:
        async with self._lock:
            entry = self._entries.get(login_id)
            if entry is None or entry.user_id != user_id:
                return None
            if time.time() - entry.last_activity_at > LOGIN_TTL_SECONDS:
                self._entries.pop(login_id, None)
            else:
                return entry
        if entry is not None:
            await self._disconnect(entry)
        return None

    async def discard(self, login_id: str, *, expected: PendingLogin | None = None) -> None:
        async with self._lock:
            entry = self._entries.get(login_id)
            if entry is None or (expected is not None and entry is not expected):
                return
            self._entries.pop(login_id, None)
        await self._disconnect(entry)

    async def touch(self, entry: PendingLogin) -> None:
        entry.last_activity_at = time.time()

    async def sweep_expired(self) -> None:
        now = time.time()
        async with self._lock:
            expired = [
                entry for entry in self._entries.values()
                if now - entry.last_activity_at > LOGIN_TTL_SECONDS
            ]
            for entry in expired:
                self._entries.pop(entry.login_id, None)
        for entry in expired:
            await self._disconnect(entry)

    async def _disconnect(self, entry: PendingLogin) -> None:
        # Mark before awaiting so a concurrent terminal path cannot disconnect twice.
        # Do not acquire entry.lock here: callers may already hold it while ending a flow.
        if entry.disconnected:
            return
        entry.disconnected = True
        try:
            await entry.client.disconnect()
        except Exception:
            logger.warning("Failed to disconnect expired or completed pending login")


pending_login_manager = PendingLoginManager()
