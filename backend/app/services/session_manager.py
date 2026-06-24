"""Session manager — auto-reconnect, expiry detection, periodic health checks,
and Telegram event handler attachment."""

import asyncio
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.telegram_client import client_pool
from app.services.event_relay import event_relay
from app.models.telegram_account import TelegramAccount
from app.utils.encryption import decrypt

logger = logging.getLogger(__name__)


_sync_semaphore = asyncio.Semaphore(3)  # Limit concurrent full syncs on startup


async def _background_chat_sync(account_id: str) -> None:
    """Run chat synchronization in the background using a fresh DB session."""
    from app.database import async_session_factory
    from app.services.chat_service import sync_chats_to_db

    async with _sync_semaphore:
        try:
            async with async_session_factory() as db:
                result = await db.execute(
                    select(TelegramAccount).where(TelegramAccount.id == account_id)
                )
                account = result.scalar_one_or_none()
                if account:
                    await sync_chats_to_db(account, db)
        except Exception as exc:
            logger.error("Error in background chat sync for account %s: %s", account_id, exc)


class SessionManager:
    """Manages Telethon client lifecycle including event handlers."""

    def __init__(self) -> None:
        self._running = False
        self._task: asyncio.Task | None = None
        self._last_spam_check = 0.0
        self._last_profile_sync = 0.0

    async def start(self) -> None:
        """Start the periodic health check loop."""
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._health_loop())
        logger.info("Session manager started")

    async def stop(self) -> None:
        """Stop the health check loop and detach all event handlers."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

        # Detach event relay from all accounts
        clients = await client_pool.get_connected_clients()
        for account_id in list(clients.keys()):
            await event_relay.detach(account_id)
        logger.info("Session manager stopped")

    async def _health_loop(self) -> None:
        """Periodically check all connected clients and re-attach event handlers if needed."""
        while self._running:
            try:
                await self._check_connections()
            except Exception as exc:
                logger.warning("Session health check error: %s", exc)

            # Periodic spam status check (runs every 1 hour)
            try:
                import time
                current_time = time.time()
                if self._last_spam_check == 0.0:
                    # Initialize last spam check to avoid heavy queries on immediate startup, run it after 60s
                    self._last_spam_check = current_time - 3540  # will trigger in 60s
                elif current_time - self._last_spam_check > 3600:
                    self._last_spam_check = current_time
                    asyncio.create_task(self._check_all_accounts_spam())
            except Exception as exc:
                logger.warning("Periodic spam check trigger error: %s", exc)

            await asyncio.sleep(30)  # Check every 30s

    async def _check_all_accounts_spam(self) -> None:
        """Periodically check spam status for accounts that haven't been checked recently (e.g. 12 hours)."""
        from app.database import async_session_factory
        from datetime import datetime, timedelta, timezone
        from app.services.account_service import check_spam_status

        logger.info("Starting periodic spam status checks for active accounts...")
        async with async_session_factory() as db:
            try:
                # Get all active accounts
                result = await db.execute(
                    select(TelegramAccount).where(TelegramAccount.is_active.is_(True))
                )
                accounts = result.scalars().all()

                twelve_hours_ago = datetime.now(timezone.utc) - timedelta(hours=12)
                for account in accounts:
                    if not self._running:
                        break
                    # Check if never checked, or checked more than 12 hours ago
                    last_checked = account.spam_last_checked_at
                    if last_checked and last_checked.tzinfo is None:
                        last_checked = last_checked.replace(tzinfo=timezone.utc)

                    if (
                        last_checked is None
                        or last_checked < twelve_hours_ago
                    ):
                        logger.info("Auto checking spam status for account: %s", account.phone)
                        try:
                            await check_spam_status(db, account)
                            await db.commit()
                        except Exception as e:
                            logger.error("Failed to auto-check spam status for %s: %s", account.phone, e)
                        # Wait between accounts to avoid rate limits
                        await asyncio.sleep(5.0)
            except Exception as exc:
                logger.error("Error in periodic spam check: %s", exc)

    async def _check_connections(self) -> None:
        """Ping each connected client; reconnect stale ones."""
        clients = await client_pool.get_connected_clients()

        # Track which accounts need reconnection
        stale_ids: list[str] = []

        for account_id, client in list(clients.items()):
            try:
                if not client.is_connected():
                    logger.warning("Client %s disconnected, will reconnect", account_id)
                    stale_ids.append(account_id)
                else:
                    me = await client.get_me()
                    if me is None:
                        logger.warning("Client %s returned no user", account_id)
                        stale_ids.append(account_id)
            except Exception as exc:
                logger.warning("Client %s ping failed: %s", account_id, exc)
                stale_ids.append(account_id)

        # Clean up stale clients first
        for account_id in stale_ids:
            await event_relay.detach(account_id)
            await client_pool.remove(account_id)

        # Reconnect stale accounts from database
        if stale_ids:
            from app.database import async_session_factory
            async with async_session_factory() as db:
                for account_id in stale_ids:
                    try:
                        result = await db.execute(
                            select(TelegramAccount).where(
                                TelegramAccount.id == account_id,
                                TelegramAccount.is_active.is_(True),
                            )
                        )
                        account = result.scalar_one_or_none()
                        if account is None:
                            continue
                        await self.attach_and_reconnect(db, account)
                    except Exception as exc:
                        logger.error(
                            "Failed to auto-reconnect account %s: %s", account_id, exc
                        )

    async def attach_and_reconnect(
        self, db: AsyncSession, account: TelegramAccount
    ) -> bool:
        """Load a specific account, reconnect, and attach event handlers.

        Returns True if successful.
        """
        if not account.is_active or not account.session_string:
            return False

        try:
            session_str = decrypt(account.session_string)
            if not session_str:
                raise ValueError("Decrypted session string is empty")
        except Exception as exc:
            logger.error(
                "Failed to decrypt session string for account %s (%s). "
                "This usually happens if the ENCRYPTION_KEY was changed. "
                "Deactivating account. Error: %s",
                account.id,
                account.phone,
                exc,
            )
            account.is_active = False
            try:
                await db.commit()
            except Exception as commit_exc:
                logger.error("Failed to commit deactivation of account %s: %s", account.id, commit_exc)
            return False

        try:
            client = await client_pool.get(str(account.id), session_str)
            if client is None:
                return False

            # Populate telegram_id if missing (e.g. accounts created before this field existed)
            if account.telegram_id is None:
                try:
                    me = await client.get_me()
                    if me and me.id:
                        account.telegram_id = me.id
                        logger.info("Account %s: populated telegram_id=%s", account.id, me.id)
                        await db.commit()
                except Exception as exc:
                    logger.warning("Account %s: failed to get telegram_id: %s", account.id, exc)

            # Attach event relay handlers
            success = await event_relay.attach(str(account.id), session_str)
            if success:
                logger.info("Account %s connected + event handlers attached", account.id)
                asyncio.create_task(_background_chat_sync(str(account.id)))

            return success
        except Exception as exc:
            logger.error("Error connecting/attaching account %s (%s): %s", account.id, account.phone, exc)
            return False

    async def reconnect_all(self, db: AsyncSession) -> int:
        """Reconnect all active accounts with event handlers attached."""
        result = await db.execute(
            select(TelegramAccount).where(TelegramAccount.is_active.is_(True))
        )
        accounts = list(result.scalars().all())
        success = 0
        for account in accounts:
            try:
                if await self.attach_and_reconnect(db, account):
                    success += 1
            except Exception as exc:
                logger.error("Unhandled error reconnecting account %s (%s): %s", account.id, account.phone, exc)
        logger.info("Reconnected %d/%d accounts", success, len(accounts))
        return success


# Singleton
session_manager = SessionManager()
