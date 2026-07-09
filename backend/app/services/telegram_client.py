"""Telethon client pool â manages concurrent Telegram client sessions."""

import logging
import time
import asyncio
from typing import Any

from telethon import TelegramClient
from telethon.sessions import StringSession
from telethon.errors import (
    AuthKeyUnregisteredError,
    AuthKeyDuplicatedError,
    SessionRevokedError,
    UserDeactivatedBanError,
)

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
        """Disconnect and remove clients that haven't been accessed recently,
        unless they have auto-reply enabled or are active in broadcast jobs.
        """
        now = time.time()
        stale_keys = [
            acc_id for acc_id, data in self._clients.items()
            if now - data["last_accessed"] > CLIENT_TTL_SECONDS
        ]
        
        if stale_keys:
            from app.database import async_session_factory
            from app.models.telegram_account import TelegramAccount
            from app.models.broadcast_job import BroadcastJob
            from sqlalchemy import select
            import uuid
            
            protected_keys = set()
            try:
                # Convert string keys to UUID objects for SQLAlchemy query compatibility
                stale_uuids = []
                for k in stale_keys:
                    try:
                        stale_uuids.append(uuid.UUID(k))
                    except ValueError:
                        pass
                
                if stale_uuids:
                    async with async_session_factory() as db:
                        # 1. Protect active accounts with auto-reply enabled
                        auto_reply_query = await db.execute(
                            select(TelegramAccount.id).where(
                                TelegramAccount.id.in_(stale_uuids),
                                TelegramAccount.is_active.is_(True),
                                TelegramAccount.auto_reply_enabled.is_(True)
                            )
                        )
                        for row in auto_reply_query.scalars():
                            protected_keys.add(str(row))
                        
                        # 2. Protect accounts in active broadcast jobs (pending, running, paused)
                        active_jobs_query = await db.execute(
                            select(BroadcastJob.account_ids).where(
                                BroadcastJob.status.in_(["pending", "running", "paused"])
                            )
                        )
                        active_job_accounts = active_jobs_query.scalars().all()
                        for acc_list in active_job_accounts:
                            if isinstance(acc_list, list):
                                for acc_id in acc_list:
                                    if acc_id in stale_keys:
                                        protected_keys.add(str(acc_id))
            except Exception as exc:
                logger.error("Error checking protected clients in DB: %s", exc)
                # Play safe on DB error, protect everyone
                protected_keys = set(stale_keys)

            # Filter out protected keys
            stale_keys = [k for k in stale_keys if k not in protected_keys]
            
            # Update last_accessed for protected keys so we don't query DB on every get()
            for k in protected_keys:
                if k in self._clients:
                    self._clients[k]["last_accessed"] = now

        for acc_id in stale_keys:
            # Detach event handlers first to prevent memory leak
            try:
                from app.services.event_relay import event_relay
                await event_relay.detach(acc_id)
            except Exception as e:
                logger.warning("Error detaching event handlers during cleanup for account %s: %s", acc_id, e)

            data = self._clients.pop(acc_id, None)
            if data and data["client"]:
                logger.info("Disconnecting idle Telegram client for account %s", acc_id)
                try:
                    await asyncio.wait_for(data["client"].disconnect(), timeout=2.0)
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
                phone = None
                try:
                    from app.database import async_session_factory
                    from app.models.telegram_account import TelegramAccount
                    from sqlalchemy import select
                    import uuid
                    async with async_session_factory() as db:
                        res = await db.execute(
                            select(TelegramAccount.phone).where(TelegramAccount.id == uuid.UUID(account_id))
                        )
                        phone = res.scalar_one_or_none()
                except Exception as db_exc:
                    logger.debug("Failed to query phone for spoofing locale: %s", db_exc)

                ios_params = deterministic_ios_device(account_id, phone=phone)
                client = TelegramClient(
                    StringSession(session_string) if session_string else StringSession(),
                    api_id=settings.TELEGRAM_API_ID,
                    api_hash=settings.TELEGRAM_API_HASH,
                    device_model=ios_params["device_model"],
                    app_version=ios_params["app_version"],
                    system_version=ios_params["system_version"],
                    lang_code=ios_params["lang_code"],
                    system_lang_code=ios_params["system_lang_code"],
                    # Raise FloodWaitError immediately instead of silently sleeping 
                    # the broadcast service drives cooldown via FloodController so it
                    # needs to see every flood event, even short ones.
                    flood_sleep_threshold=0,
                )
                await client.connect()
                if not await client.is_user_authorized():
                    logger.warning("Session expired for account %s", account_id)
                    await asyncio.wait_for(client.disconnect(), timeout=2.0)
                    self._clients.pop(account_id, None)
                    await self._handle_expired_session(account_id)
                    return None
                self._clients[account_id] = {"client": client, "last_accessed": time.time()}
                return client
            except (AuthKeyUnregisteredError, AuthKeyDuplicatedError, SessionRevokedError, UserDeactivatedBanError) as exc:
                logger.warning("Session expired for account %s: %s", account_id, exc)
                self._clients.pop(account_id, None)
                await self._handle_expired_session(account_id)
                return None
            except Exception as exc:
                logger.error("Failed to connect account %s: %s", account_id, exc)
                exc_str = str(exc).lower()
                if any(k in exc_str for k in ["auth_key", "session_revoked", "user_deactivated", "session expired"]):
                    self._clients.pop(account_id, None)
                    await self._handle_expired_session(account_id)
                return None

    async def _handle_expired_session(self, account_id: str) -> None:
        """Mark the account as inactive and move it to the 'Expired' folder in the database."""
        try:
            from app.database import async_session_factory
            from app.models.telegram_account import TelegramAccount
            from sqlalchemy import select
            import uuid

            acc_uuid = uuid.UUID(account_id)
            async with async_session_factory() as db:
                result = await db.execute(
                    select(TelegramAccount).where(TelegramAccount.id == acc_uuid)
                )
                account = result.scalar_one_or_none()
                if not account:
                    return

                # Import helper and run it
                from app.services.account_service import move_to_expired_folder
                await move_to_expired_folder(db, account.id, account.user_id)
                await db.commit()
        except Exception as e:
            logger.error("Failed to handle expired session for account %s: %s", account_id, e)

    async def remove(self, account_id: str) -> None:
        """Disconnect and remove a client from the pool."""
        # Detach event handlers first to prevent memory leak
        try:
            from app.services.event_relay import event_relay
            await event_relay.detach(account_id)
        except Exception as e:
            logger.warning("Error detaching event handlers during remove for account %s: %s", account_id, e)

        data = self._clients.pop(account_id, None)
        if data is not None and data["client"]:
            try:
                await asyncio.wait_for(data["client"].disconnect(), timeout=2.0)
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

    async def create_unauth_client(self, phone: str | None = None) -> TelegramClient:
        """Create an unauthenticated client for the OTP login flow."""
        if not settings.TELEGRAM_API_ID or not settings.TELEGRAM_API_HASH:
            raise ValueError("Telegram API ID or Hash is not configured in the backend .env file.")
        ios_params = random_ios_device(phone)
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
