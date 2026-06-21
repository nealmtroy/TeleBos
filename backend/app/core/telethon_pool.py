"""Telethon client pool — manage one TelegramClient per account."""

import asyncio
import logging
from typing import Dict, Optional

from telethon import TelegramClient, errors
from telethon.sessions import StringSession

from app.core.config import settings
from app.core.security import decrypt_session_string

logger = logging.getLogger(__name__)


class TelethonPool:
    """Pool of authenticated TelegramClient instances keyed by account ID."""

    def __init__(self) -> None:
        self._clients: Dict[str, TelegramClient] = {}
        self._lock = asyncio.Lock()

    async def get_or_create(
        self,
        account_id: str,
        session_string: str,
        phone: Optional[str] = None,
    ) -> TelegramClient:
        """Return existing client or create & connect a new one."""
        async with self._lock:
            if account_id in self._clients:
                client = self._clients[account_id]
                if client.is_connected():
                    return client
                # Reconnect
                try:
                    await client.connect()
                    return client
                except Exception:
                    pass  # fall through to recreate

            plain = decrypt_session_string(session_string)
            client = TelegramClient(
                StringSession(plain),
                settings.telegram_api_id or 2040,      # default test api_id
                settings.telegram_api_hash or "b18441a1ff607e10a989891a5462e627",
                base_logger=logging.getLogger(f"telethon.{account_id[:8]}"),
            )
            await client.connect()
            if not await client.is_user_authorized():
                if phone:
                    await client.send_code_request(phone)
                raise RuntimeError(f"Account {account_id} session expired — re-login required")

            self._clients[account_id] = client
            logger.info("Telethon client connected for account %s", account_id[:8])
            return client

    async def disconnect(self, account_id: str) -> None:
        """Disconnect and remove a client."""
        async with self._lock:
            client = self._clients.pop(account_id, None)
            if client:
                await client.disconnect()
                logger.info("Telethon client disconnected for account %s", account_id[:8])

    async def disconnect_all(self) -> None:
        """Gracefully disconnect every client (used at shutdown)."""
        async with self._lock:
            for aid, client in self._clients.items():
                try:
                    await client.disconnect()
                except Exception:
                    logger.exception("Error disconnecting %s", aid)
            self._clients.clear()

    def get(self, account_id: str) -> Optional[TelegramClient]:
        """Synchronously peek (only safe if you know it's connected)."""
        return self._clients.get(account_id)

    @property
    def active_count(self) -> int:
        return len(self._clients)


telethon_pool = TelethonPool()
