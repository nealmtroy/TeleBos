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
    """Run profile, chat, and folder synchronization in the background using a fresh DB session."""
    from app.database import async_session_factory
    from app.services.chat_service import sync_chats_to_db, sync_folders_from_telegram
    from app.services.profile_sync_service import sync_account_profile
    from app.api.ws import manager

    async with _sync_semaphore:
        try:
            async with async_session_factory() as db:
                result = await db.execute(
                    select(TelegramAccount).where(TelegramAccount.id == account_id)
                )
                account = result.scalar_one_or_none()
                if account:
                    # Debounce Reconnection Storm: check if last_sync_at is within the last 15 minutes
                    import datetime
                    now = datetime.datetime.now(datetime.timezone.utc)
                    if account.last_sync_at and (now - account.last_sync_at).total_seconds() < 900:
                        logger.info("Skipping background chat/profile sync for account %s: debounced (last sync was %s)", account_id, account.last_sync_at)
                        return

                    # 1. Sync profile info (e.g. name, username, bio, photo)
                    try:
                        await sync_account_profile(db, account)
                    except Exception as profile_exc:
                        logger.error("Error in background profile sync for account %s: %s", account_id, profile_exc)

                    # 2. Sync chats (e.g. users/dialogs)
                    await sync_chats_to_db(account, db)

                    # 3. Sync folders (e.g. folder categories)
                    try:
                        await sync_folders_from_telegram(account, db)
                    except Exception as folders_exc:
                        logger.warning("Error in background folders sync for account %s: %s", account_id, folders_exc)

                    # Explicitly commit all synced data
                    await db.commit()

                    # Broadcast WS notifications to invalidate frontend query caches
                    try:
                        await manager.broadcast(
                            f"chats:{account_id}",
                            {"type": "chats_synced", "account_id": account_id}
                        )
                        await manager.broadcast(
                            f"chats:{account_id}",
                            {"type": "folders_synced", "account_id": account_id}
                        )
                        await manager.broadcast(
                            f"chats:{account_id}",
                            {"type": "profile_sync", "account_id": account_id}
                        )
                    except Exception as ws_exc:
                        logger.warning("WS sync status push failed for %s: %s", account_id, ws_exc)
        except Exception as exc:
            logger.error("Error in background chat/profile sync for account %s: %s", account_id, exc)


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

        # Phase 1: Short DB session to get accounts needing spam check
        accounts_to_check: list[tuple[str, str]] = []  # (account_id, phone)
        try:
            async with async_session_factory() as db:
                result = await db.execute(
                    select(
                        TelegramAccount.id,
                        TelegramAccount.phone,
                        TelegramAccount.spam_last_checked_at,
                    ).where(TelegramAccount.is_active.is_(True))
                )
                rows = result.all()

                twelve_hours_ago = datetime.now(timezone.utc) - timedelta(hours=12)
                for row in rows:
                    account_id, phone, last_checked = str(row[0]), row[1], row[2]
                    if last_checked and last_checked.tzinfo is None:
                        last_checked = last_checked.replace(tzinfo=timezone.utc)
                    if last_checked is None or last_checked < twelve_hours_ago:
                        accounts_to_check.append((account_id, phone))
        except Exception as exc:
            logger.error("Error fetching accounts for spam check: %s", exc)
            return

        # Phase 2: Check each account with its own short-lived DB session
        for account_id, phone in accounts_to_check:
            if not self._running:
                break
            logger.info("Auto checking spam status for account: %s", phone)
            try:
                async with async_session_factory() as db:
                    result = await db.execute(
                        select(TelegramAccount).where(TelegramAccount.id == account_id)
                    )
                    account = result.scalar_one_or_none()
                    if account:
                        await check_spam_status(db, account)
                        await db.commit()
            except Exception as e:
                logger.error("Failed to auto-check spam status for %s: %s", phone, e)
            # Wait between accounts to avoid rate limits (no DB session held)
            await asyncio.sleep(5.0)

    async def is_account_in_active_job(self, db: AsyncSession, account_id: str) -> bool:
        """Check if an account is currently assigned to an active broadcast or invite job."""
        from app.models.broadcast_job import BroadcastJob
        from app.models.invite_job import InviteJob
        import uuid
        try:
            acc_uuid = uuid.UUID(account_id)
        except ValueError:
            return False

        # 1. Check active BroadcastJobs
        try:
            broadcast_query = await db.execute(
                select(BroadcastJob.account_ids).where(
                    BroadcastJob.status.in_(["pending", "running", "paused"])
                )
            )
            for job_accs in broadcast_query.scalars():
                if isinstance(job_accs, list) and (account_id in job_accs or str(acc_uuid) in job_accs or acc_uuid in job_accs):
                    return True
        except Exception as e:
            logger.debug("Failed to check BroadcastJob for account %s: %s", account_id, e)

        # 2. Check active InviteJobs
        try:
            invite_query = await db.execute(
                select(InviteJob.id).where(
                    InviteJob.account_id == acc_uuid,
                    InviteJob.status.in_(["pending", "running", "paused"])
                )
            )
            if invite_query.first() is not None:
                return True
        except Exception as e:
            logger.debug("Failed to check InviteJob for account %s: %s", account_id, e)

        return False

    async def ensure_connected_on_demand(self, account_id: str) -> bool:
        """Ensure an account is connected and its event relay is attached (on-demand)."""
        clients = await client_pool.get_connected_clients()
        if account_id in clients:
            return True

        logger.info("Lazy Connection: connecting account %s on-demand", account_id)
        from app.database import async_session_factory
        import uuid
        try:
            async with async_session_factory() as db:
                result = await db.execute(
                    select(TelegramAccount).where(
                        TelegramAccount.id == uuid.UUID(account_id),
                        TelegramAccount.is_active.is_(True)
                    )
                )
                account = result.scalar_one_or_none()
                if account:
                    return await self.attach_and_reconnect(db, account)
        except Exception as exc:
            logger.error("Failed to connect account %s on-demand: %s", account_id, exc)
        return False

    async def _check_connections(self) -> None:
        """Ping each connected client; reconnect stale ones, and disconnect unneeded ones (Lazy Connection)."""
        clients = await client_pool.get_connected_clients()
        from app.database import async_session_factory
        from app.api.ws import manager as ws_manager

        # Track which accounts need reconnection
        stale_ids: list[str] = []
        healthy_ids: list[str] = []

        # Phase 1: Ping clients WITHOUT holding a DB session (get_me is a Telegram API call, can be slow)
        for account_id, client in list(clients.items()):
            try:
                if not client.is_connected():
                    logger.warning("Client %s disconnected, will reconnect if needed", account_id)
                    stale_ids.append(account_id)
                    continue

                me = await client.get_me()
                if me is None:
                    logger.warning("Client %s returned no user", account_id)
                    stale_ids.append(account_id)
                    continue

                healthy_ids.append(account_id)

            except Exception as exc:
                logger.warning("Client %s ping failed: %s", account_id, exc)
                stale_ids.append(account_id)

        # Phase 2: Short DB session for lazy disconnect checks on healthy clients
        lazy_disconnect_ids: list[str] = []
        if healthy_ids:
            try:
                async with async_session_factory() as db:
                    for account_id in healthy_ids:
                        try:
                            result = await db.execute(
                                select(TelegramAccount).where(
                                    TelegramAccount.id == account_id,
                                    TelegramAccount.is_active.is_(True)
                                )
                            )
                            account = result.scalar_one_or_none()
                            if account:
                                has_auto_reply = account.auto_reply_enabled
                                has_active_ws = ws_manager._connections.get(f"chats:{account_id}") is not None
                                has_active_job = await self.is_account_in_active_job(db, account_id)

                                if not (has_auto_reply or has_active_ws or has_active_job):
                                    logger.info("Lazy Connection: disconnecting unneeded client for account %s", account_id)
                                    lazy_disconnect_ids.append(account_id)
                        except Exception as exc:
                            logger.warning("Lazy disconnect check failed for %s: %s", account_id, exc)
            except Exception as exc:
                logger.warning("DB session error during lazy disconnect check: %s", exc)

        # Clean up stale clients
        for account_id in stale_ids:
            await event_relay.detach(account_id)
            await client_pool.remove(account_id)

        # Disconnect unneeded clients
        for account_id in lazy_disconnect_ids:
            await client_pool.remove(account_id)

        # Phase 3: Short DB session for reconnecting stale accounts
        if stale_ids:
            try:
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

                            # Only reconnect if required
                            has_auto_reply = account.auto_reply_enabled
                            has_active_ws = ws_manager._connections.get(f"chats:{account_id}") is not None
                            has_active_job = await self.is_account_in_active_job(db, account_id)

                            if has_auto_reply or has_active_ws or has_active_job:
                                await self.attach_and_reconnect(db, account)
                        except Exception as exc:
                            logger.error("Failed to auto-reconnect account %s: %s", account_id, exc)
            except Exception as exc:
                logger.warning("DB session error during stale reconnect: %s", exc)

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
            try:
                from app.services.account_service import move_to_expired_folder
                await move_to_expired_folder(db, account.id, account.user_id)
                await db.commit()
            except Exception as folder_exc:
                logger.error("Failed to move account %s to Expired folder: %s", account.id, folder_exc)
                account.is_active = False
                await db.commit()
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
        """Reconnect only active accounts with auto-reply enabled on startup (Lazy Connection)."""
        result = await db.execute(
            select(TelegramAccount).where(
                TelegramAccount.is_active.is_(True),
                TelegramAccount.auto_reply_enabled.is_(True)
            )
        )
        accounts = list(result.scalars().all())
        success = 0
        for account in accounts:
            try:
                if await self.attach_and_reconnect(db, account):
                    success += 1
            except Exception as exc:
                logger.error("Unhandled error reconnecting account %s (%s): %s", account.id, account.phone, exc)
        logger.info("Lazy reconnect complete. Reconnected %d of %d active accounts (auto-reply enabled)", success, len(accounts))
        return success


# Singleton
session_manager = SessionManager()
