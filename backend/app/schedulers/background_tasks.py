"""Background synchronization and maintenance loops for TeleBos."""

import asyncio
from datetime import datetime, timezone, timedelta
import logging
from sqlalchemy import select

from app.database import async_session_factory
from app.models.telegram_account import TelegramAccount
from app.services.admin_smm_service import fetch_services, refresh_all_pending_smart, sync_services
from app.services.chat_service import sync_all_chats_to_db
from app.services.profile_sync_service import sync_account_profile
from app.services.telegram_reg_date_service import reg_date_service
from app.utils.timezone import ensure_utc

logger = logging.getLogger(__name__)


async def adaptive_sequential_sync_loop() -> None:
    """Periodically sync profiles, chats, groups, channels, and registration dates sequentially."""
    await asyncio.sleep(60)  # Initial delay — let accounts connect first

    while True:
        try:
            # 1. Fetch the active account with the oldest last_sync_at (or None)
            async with async_session_factory() as db:
                stmt = select(TelegramAccount).where(
                    TelegramAccount.is_active == True,
                    TelegramAccount.session_string != "",
                ).order_by(
                    TelegramAccount.last_sync_at.asc().nullsfirst()
                ).limit(1)
                res = await db.execute(stmt)
                account = res.scalar_one_or_none()

                if not account:
                    logger.info("Adaptive Sync: No active accounts found. Sleeping for 30 seconds.")
                    await asyncio.sleep(30)
                    continue

                # 2. Check if the oldest account needs a sync.
                # We sync an account if it hasn't been synced in the last hour, or if last_sync_at is None.
                one_hour_ago = datetime.now(timezone.utc) - timedelta(hours=1)
                last_sync = ensure_utc(account.last_sync_at)

                if last_sync and last_sync >= one_hour_ago:
                    # Even the oldest account is fresh (< 1 hour old). Wait before checking again.
                    logger.debug(
                        "Adaptive Sync: All accounts are fresh (oldest last_sync_at was %s). Sleeping for 30 seconds.",
                        last_sync,
                    )
                    await asyncio.sleep(30)
                    continue

                account_id = str(account.id)

            # 3. Process the sync for this account
            logger.info("Adaptive Sync: Starting sync for account %s (%s)...", account_id, account.phone)

            sync_succeeded = False
            try:
                async with async_session_factory() as db_session:
                    # Reload the account object in this transaction
                    acc_res = await db_session.execute(
                        select(TelegramAccount).where(TelegramAccount.id == account_id)
                    )
                    db_acc = acc_res.scalar_one_or_none()
                    if db_acc:
                        # Step A: Sync Profile Info
                        try:
                            await sync_account_profile(db_session, db_acc)
                        except Exception as profile_exc:
                            logger.error("Adaptive Sync: Error syncing profile for %s: %s", db_acc.phone, profile_exc)

                        # Step B: Consolidated Sync (Chats, Groups, Channels, & last_sync_at / groups_channels_synced_at)
                        dialogs = []
                        try:
                            # We use skip_details=True for periodic background sync to avoid heavy API hits
                            dialogs = await sync_all_chats_to_db(db_acc, db_session, skip_details=True)
                        except Exception as chat_exc:
                            logger.error("Adaptive Sync: Error syncing chats for %s: %s", db_acc.phone, chat_exc)

                        # Step C: Sync Registration Dates (re-uses already fetched dialogs, zero extra network calls)
                        try:
                            await reg_date_service.sync_datapoints_from_account(db_session, db_acc.id, limit=500, dialogs=dialogs)
                        except Exception as reg_exc:
                            logger.debug("Adaptive Sync: Skip reg date sync for %s (e.g. client inactive): %s", db_acc.phone, reg_exc)

                        # Step D: Save all changes
                        db_acc.last_sync_at = datetime.now(timezone.utc)
                        await db_session.commit()
                        sync_succeeded = True
                        logger.info("Adaptive Sync: Completed sync for account %s (%s).", account_id, db_acc.phone)

                        # Step E: Broadcast WS notifications to invalidate frontend query caches
                        from app.api.ws import manager as ws_manager
                        try:
                            await ws_manager.broadcast(
                                f"chats:{account_id}",
                                {"type": "chats_synced", "account_id": account_id}
                            )
                            await ws_manager.broadcast(
                                f"chats:{account_id}",
                                {"type": "folders_synced", "account_id": account_id}
                            )
                            await ws_manager.broadcast(
                                f"chats:{account_id}",
                                {"type": "profile_sync", "account_id": account_id}
                            )
                        except Exception as ws_exc:
                            logger.warning("Adaptive Sync: WS push failed for %s: %s", account_id, ws_exc)

            except Exception as sync_err:
                logger.error("Adaptive Sync: Error syncing account %s: %s", account_id, sync_err)

            # INF-03: If sync failed, ensure last_sync_at is advanced in an isolated transaction
            # so this failing account doesn't starve all other accounts.
            if not sync_succeeded:
                try:
                    async with async_session_factory() as recovery_session:
                        rec_res = await recovery_session.execute(
                            select(TelegramAccount).where(TelegramAccount.id == account_id)
                        )
                        rec_acc = rec_res.scalar_one_or_none()
                        if rec_acc:
                            rec_acc.last_sync_at = datetime.now(timezone.utc)
                            await recovery_session.commit()
                            logger.warning(
                                "Adaptive Sync: Advanced last_sync_at for failed account %s to avoid loop starvation",
                                account_id,
                            )
                except Exception as rec_err:
                    logger.error(
                        "Adaptive Sync: Failed recovery commit for account %s: %s",
                        account_id,
                        rec_err,
                    )

        except Exception as exc:
            logger.warning("Adaptive Sync: Loop error: %s", exc)

        # Wait cooldown interval between accounts to prevent rate limits
        await asyncio.sleep(15)


async def smm_services_sync_loop() -> None:
    """Periodically sync SMM services from the panel API (every 12 hours)."""
    # Wait a little bit after startup to avoid database contention on initialization
    await asyncio.sleep(10)
    while True:
        try:
            logger.info("Background task: Syncing SMM services...")
            services = await fetch_services()
            async with async_session_factory() as db:
                count = await sync_services(db, services)
                await db.commit()
            logger.info("Background task: Synced %d SMM services.", count)
        except Exception as exc:
            logger.warning("Background SMM services sync loop error: %s", exc)
        # Sync every 12 hours (43200 seconds)
        await asyncio.sleep(43200)


async def smm_orders_poll_loop() -> None:
    """Periodically auto-refresh active SMM order statuses (every minute)."""
    await asyncio.sleep(15)  # Wait 15s after startup
    while True:
        try:
            async with async_session_factory() as db:
                count = await refresh_all_pending_smart(db)
                await db.commit()
                if count > 0:
                    logger.info("Background task: Auto-refreshed %d SMM order statuses.", count)
        except Exception as exc:
            logger.warning("Background SMM orders poll loop error: %s", exc)
        await asyncio.sleep(60)  # Polling interval: every minute
