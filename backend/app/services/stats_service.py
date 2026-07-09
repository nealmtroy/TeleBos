"""Background stats service — daily refresh of dialog statistics for all accounts.

Stores pre-computed counts (contacts, groups, channels) directly on the
TelegramAccount model so the API never needs to fetch all dialogs from
Telegram on page load.
"""

import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


async def refresh_account_stats(db: AsyncSession, account) -> None:
    """Refresh cached stats for a single account by calling Telethon.

    This is the same logic as ``chat_service.get_dialog_stats()`` but writes
    results directly onto the ORM model so they persist in the database.
    """
    from app.services.chat_service import get_dialog_stats

    try:
        stats = await get_dialog_stats(account, db)
    except RuntimeError as exc:
        logger.warning("Skipping stats refresh for account %s: %s", account.id, exc)
        return

    account.contacts_count = stats["contacts_count"]
    account.total_groups = stats["total_groups"]
    account.owned_groups = stats["owned_groups"]
    account.total_channels = stats["total_channels"]
    account.owned_channels = stats["owned_channels"]
    account.stats_updated_at = datetime.now(timezone.utc)

    await db.flush()
    logger.info(
        "Refreshed stats for account %s: %d contacts, %d groups, %d channels",
        account.id,
        stats["contacts_count"],
        stats["total_groups"],
        stats["total_channels"],
    )


async def refresh_all_accounts(db: AsyncSession) -> int:
    """Refresh cached stats for every active Telegram account.

    Returns the number of accounts successfully refreshed.
    """
    from app.models.telegram_account import TelegramAccount
    from app.database import async_session_factory

    # Phase 1: Get all active account IDs with the caller's DB session
    result = await db.execute(
        select(TelegramAccount.id).where(TelegramAccount.is_active == True)
    )
    account_ids = [str(row[0]) for row in result.all()]

    refreshed = 0
    # Phase 2: Refresh each account with its own short-lived DB session
    for i, account_id in enumerate(account_ids):
        try:
            async with async_session_factory() as per_db:
                result = await per_db.execute(
                    select(TelegramAccount).where(TelegramAccount.id == account_id)
                )
                account = result.scalar_one_or_none()
                if account:
                    await refresh_account_stats(per_db, account)
                    await per_db.commit()
                    refreshed += 1
        except Exception:
            logger.exception("Failed to refresh stats for account %s", account_id)

        # Delay between accounts to avoid Telegram flood limits (no DB session held)
        if i < len(account_ids) - 1:
            await asyncio.sleep(60)

    logger.info("Daily stats refresh complete: %d / %d accounts", refreshed, len(account_ids))
    return refreshed


async def background_stats_updater() -> None:
    """Infinite background loop that refreshes account stats once per day.

    Runs every 24 hours.  On the very first iteration, also waits 60 seconds
    so the server has time to finish startup before hitting the Telegram API.
    """
    from app.database import async_session_factory

    # Give the server time to finish reconnecting accounts on startup
    await asyncio.sleep(60)

    while True:
        try:
            async with async_session_factory() as db:
                await refresh_all_accounts(db)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Unhandled error in background_stats_updater")

        # Wait 24 hours before the next refresh
        await asyncio.sleep(86400)
