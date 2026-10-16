"""Background synchronization and maintenance loops for TeleBos."""

import asyncio
from datetime import datetime, timezone, timedelta
import logging
from sqlalchemy import select

from app.core.sharding import is_account_in_current_shard
from app.database import async_session_factory
from app.models.telegram_account import TelegramAccount
from app.services.admin_smm_service import (
    fetch_services,
    get_services_last_sync_time,
    refresh_all_pending_smart,
    sync_services,
)
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
            # 1. Pick the candidate account, then CLOSE the session before any
            # sleep. Sleeping inside `async with async_session_factory()` left the
            # connection "idle in transaction" for the full 30s (it showed up as a
            # multi-second slow query in system health). Only the columns this
            # loop actually needs are selected — not the whole row (which carries
            # the encrypted session string).
            account_id = None
            account_phone = None
            skip_reason = None
            async with async_session_factory() as db:
                from app.models.broadcast_job import BroadcastJob
                from app.models.invite_job import InviteJob
                from app.models.auto_join_job import AutoJoinJob
                import uuid

                busy_ids: set[uuid.UUID] = set()
                for job_model in (BroadcastJob, InviteJob, AutoJoinJob):
                    job_res = await db.execute(
                        select(job_model.account_ids).where(
                            job_model.status.in_(["pending", "running", "paused"])
                        )
                    )
                    for acc_list in job_res.scalars():
                        if isinstance(acc_list, list):
                            for a in acc_list:
                                try:
                                    busy_ids.add(uuid.UUID(str(a)))
                                except (ValueError, TypeError):
                                    pass

                stmt = select(
                    TelegramAccount.id,
                    TelegramAccount.phone,
                    TelegramAccount.last_sync_at,
                ).where(
                    TelegramAccount.is_active == True,
                    TelegramAccount.session_string != "",
                )
                if busy_ids:
                    stmt = stmt.where(TelegramAccount.id.not_in(busy_ids))

                stmt = stmt.order_by(
                    TelegramAccount.last_sync_at.asc().nullsfirst()
                ).limit(200)
                res = await db.execute(stmt)
                rows = res.all()
                candidate = next(
                    (r for r in rows if is_account_in_current_shard(r[0])), None
                )

                if candidate is None:
                    skip_reason = "no_eligible"
                else:
                    one_hour_ago = datetime.now(timezone.utc) - timedelta(hours=1)
                    last_sync = ensure_utc(candidate[2])
                    if last_sync and last_sync >= one_hour_ago:
                        skip_reason = "all_fresh"
                    else:
                        account_id = str(candidate[0])
                        account_phone = candidate[1]
            # ── session closed: safe to sleep without pinning a connection ──

            if skip_reason == "no_eligible":
                logger.debug("Adaptive Sync: No eligible active accounts found for this shard (or all busy). Sleeping for 30s.")
                await asyncio.sleep(30)
                continue
            if skip_reason == "all_fresh":
                logger.debug(
                    "Adaptive Sync: All accounts are fresh. Sleeping for 30 seconds.",
                )
                await asyncio.sleep(30)
                continue

            # 3. Process the sync for this account
            logger.info("Adaptive Sync: Starting sync for account %s (%s)...", account_id, account_phone)

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
                        # Dispatch via Redis so webserver relays it to frontend WebSockets across processes
                        from app.utils.redis_dispatcher import publish_ws_event
                        from app.api.ws import manager as ws_manager
                        try:
                            channel = f"chats:{account_id}"
                            for event_payload in [
                                {"type": "chats_synced", "account_id": account_id},
                                {"type": "folders_synced", "account_id": account_id},
                                {"type": "profile_sync", "account_id": account_id},
                            ]:
                                await publish_ws_event(channel, event_payload)
                                if ws_manager.has_channel(channel):
                                    await ws_manager.broadcast(channel, event_payload)
                        except Exception as ws_exc:
                            logger.warning("Adaptive Sync: WS push failed for %s: %s", account_id, ws_exc)

                        # Step F: Immediately release client after background sync to prevent idle socket accumulation,
                        # UNLESS auto-reply is enabled for this account (needs to stay connected for incoming messages).
                        from app.services.telegram_client import client_pool
                        if not getattr(db_acc, "auto_reply_enabled", False):
                            await client_pool.remove(account_id, save_state=True)
                        else:
                            client_pool.touch_client(account_id)
                            from app.services.event_relay import event_relay
                            from app.utils.encryption import decrypt
                            if not event_relay.is_attached(account_id):
                                decrypted_session = decrypt(db_acc.session_string)
                                if decrypted_session:
                                    await event_relay.attach(account_id, decrypted_session)

            except Exception as sync_err:
                err_msg = str(sync_err) or type(sync_err).__name__
                if any(k in err_msg.lower() for k in ("connection is closed", "temporary failure in name resolution", "closed in the middle", "cannot call transaction.rollback")):
                    logger.warning("Adaptive Sync: Transient connection error syncing account %s: %s", account_id, err_msg)
                else:
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
                    err_msg = str(rec_err) or type(rec_err).__name__
                    if any(k in err_msg.lower() for k in ("connection is closed", "temporary failure in name resolution", "closed in the middle", "cannot call transaction.rollback")):
                        logger.warning(
                            "Adaptive Sync: Transient connection error during recovery commit for account %s: %s",
                            account_id,
                            err_msg,
                        )
                    else:
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
    interval_seconds = 43200  # 12 hours
    while True:
        try:
            # Check last sync time from DB to prevent re-syncing on every backend restart
            async with async_session_factory() as db:
                last_sync = await get_services_last_sync_time(db)

            now = datetime.now(timezone.utc)
            if last_sync:
                if last_sync.tzinfo is None:
                    last_sync = last_sync.replace(tzinfo=timezone.utc)
                elapsed = (now - last_sync).total_seconds()
                if elapsed < interval_seconds:
                    wait_time = max(60, interval_seconds - elapsed)
                    logger.info(
                        "SMM services were synced recently (%.1f hours ago, last: %s). Sleeping for %.1f hours before next sync.",
                        elapsed / 3600,
                        last_sync.isoformat(),
                        wait_time / 3600,
                    )
                    await asyncio.sleep(wait_time)
                    continue

            logger.info("Background task: Syncing allowed Telegram SMM services...")
            services = await fetch_services()
            async with async_session_factory() as db:
                count = await sync_services(db, services)
                await db.commit()
            logger.info("Background task: Synced %d allowed SMM services.", count)
        except Exception as exc:
            logger.warning("Background SMM services sync loop error: %s", exc)
        # Sync every 12 hours
        await asyncio.sleep(interval_seconds)


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
