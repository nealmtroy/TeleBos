"""Telethon client pool â€” manages concurrent Telegram client sessions."""

import logging
import time
from typing import Any

from telethon import TelegramClient
from telethon.sessions import StringSession

from app.config import get_settings
from app.utils.device_spoof import deterministic_ios_device, random_ios_device

logger = logging.getLogger(__name__)
settings = get_settings()

CLIENT_TTL_SECONDS = 3600  # Disconnect idle clients after 1 hour

class TelegramClientPool:
    """
    In-memory pool of authenticated Telethon clients.

    Clients are loaded on demand from encrypted session strings stored in the DB
    and kept in the `_clients` dict for reuse. Stale clients are periodically
    disconnected and removed to prevent memory leaks.
    """

    def __init__(self) -> None:
        import asyncio
        self._locks: dict[str, asyncio.Lock] = {}
        # dict[account_id, {"client": TelegramClient, "last_accessed": float}]
        self._clients: dict[str, dict[str, Any]] = {}

    async def _cleanup_stale_clients(self) -> None:
        """Disconnect and remove clients that haven't been accessed recently."""
        now = time.time()
        stale_keys = [
            acc_id for acc_id, data in self._clients.items()
            if now - data["last_accessed"] > CLIENT_TTL_SECONDS
        ]
        for acc_id in stale_keys:
            data = self._clients.pop(acc_id, None)
            if data and data["client"]:
                logger.info("Disconnecting idle Telegram client for account %s", acc_id)
                try:
                    await data["client"].disconnect()
                except Exception as e:
                    logger.debug("Error disconnecting idle client %s: %s", acc_id, e)

    async def get(self, account_id: str, session_string: str) -> TelegramClient | None:
        """Return an existing client or create a new one from a session string."""
        await self._cleanup_stale_clients()

        import asyncio
        if account_id not in self._locks:
            self._locks[account_id] = asyncio.Lock()
            
        async with self._locks[account_id]:
            # Return cached if still connected
            existing = self._clients.get(account_id)
            if existing is not None and existing["client"].is_connected():
                existing["last_accessed"] = time.time()
                return existing["client"]
    
            # Check for valid Telegram API configuration
            if not settings.TELEGRAM_API_ID or not settings.TELEGRAM_API_HASH:
                logger.warning("Telegram API ID or Hash is empty/unconfigured. Skipping client creation for account %s", account_id)
                return None
    
            # Create new client with iOS device spoofing
            try:
                ios_params = deterministic_ios_device(account_id)
                client = TelegramClient(
                    StringSession(session_string) if session_string else StringSession(),
                    api_id=settings.TELEGRAM_API_ID,
                    api_hash=settings.TELEGRAM_API_HASH,
                    device_model=ios_params["device_model"],
                    app_version=ios_params["app_version"],
                    system_version=ios_params["system_version"],
                    lang_code=ios_params["lang_code"],
                    system_lang_code=ios_params["system_lang_code"],
                    # Raise FloodWaitError immediately instead of silently sleeping —
                    # the broadcast service drives cooldown via FloodController so it
                    # needs to see every flood event, even short ones.
                    flood_sleep_threshold=0,
                )
                await client.connect()
                if not await client.is_user_authorized():
                    logger.warning("Session expired for account %s", account_id)
                    await client.disconnect()
                    self._clients.pop(account_id, None)
                    return None
                self._clients[account_id] = {"client": client, "last_accessed": time.time()}
                return client
            except Exception as exc:
                logger.error("Failed to connect account %s: %s", account_id, exc)
                return None

    async def remove(self, account_id: str) -> None:
        """Disconnect and remove a client from the pool."""
        data = self._clients.pop(account_id, None)
        if data is not None and data["client"]:
            try:
                await data["client"].disconnect()
            except Exception:
                pass

    async def get_connected_clients(self) -> dict[str, TelegramClient]:
        """Return dict of still-connected clients."""
        return {k: v["client"] for k, v in self._clients.items() if v["client"].is_connected()}

    async def get_session_string(self, account_id: str) -> str | None:
        """Get the current session string for a client."""
        data = self._clients.get(account_id)
        if data is None or not data["client"].is_connected():
            return None
        client = data["client"]
        if isinstance(client.session, StringSession):
            return client.session.save()
        return None

    async def create_unauth_client(self) -> TelegramClient:
        """Create an unauthenticated client for the OTP login flow."""
        if not settings.TELEGRAM_API_ID or not settings.TELEGRAM_API_HASH:
            raise ValueError("Telegram API ID or Hash is not configured in the backend .env file.")
        ios_params = random_ios_device()
        client = TelegramClient(
            StringSession(),
            api_id=settings.TELEGRAM_API_ID,
            api_hash=settings.TELEGRAM_API_HASH,
            device_model=ios_params["device_model"],
            app_version=ios_params["app_version"],
            system_version=ios_params["system_version"],
            lang_code=ios_params["lang_code"],
            system_lang_code=ios_params["system_lang_code"],
            flood_sleep_threshold=0,
        )
        await client.connect()
        return client


# Global singleton
client_pool = TelegramClientPool()
