"""Telethon client pool compatibility layer.

DEPRECATED: Use ``app.services.telegram_client.client_pool`` or
``app.utils.telethon_helpers.get_active_client`` directly.

This module delegates to the canonical singleton ``client_pool`` so that
all client connections share the same TTL eviction, device spoofing,
and event-relay management without leaking memory or file descriptors.
"""

import logging
from typing import Optional

from telethon import TelegramClient

from app.services.telegram_client import client_pool
from app.utils.encryption import decrypt

logger = logging.getLogger(__name__)


class TelethonPool:
    """Compatibility wrapper delegating to canonical ``client_pool``."""

    async def get_or_create(
        self,
        account_id: str,
        session_string: str,
        phone: Optional[str] = None,
    ) -> TelegramClient:
        """Return existing client or create & connect via canonical client_pool."""
        logger.debug("TelethonPool.get_or_create called for %s (delegating to client_pool)", account_id)
        plain = decrypt(session_string)
        client = await client_pool.get(str(account_id), plain)
        if client is None:
            raise RuntimeError(f"Account {account_id} session expired or disconnected — re-login required")
        return client

    async def disconnect(self, account_id: str) -> None:
        """Disconnect and remove a client via canonical client_pool."""
        await client_pool.remove(str(account_id))

    async def disconnect_all(self) -> None:
        """Gracefully disconnect every client via canonical client_pool."""
        await client_pool.stop()

    def get(self, account_id: str) -> Optional[TelegramClient]:
        """Synchronously peek at connected clients."""
        client_data = client_pool._clients.get(str(account_id))
        if client_data and client_data.get("client") and client_data["client"].is_connected():
            return client_data["client"]
        return None

    @property
    def active_count(self) -> int:
        return len(client_pool._clients)


telethon_pool = TelethonPool()
