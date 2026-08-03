"""Rate-limited background synchronization for cached Telegram 2FA metadata."""

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.database import async_session_factory
from app.models.telegram_account import TelegramAccount
from app.services.telegram_client import client_pool
from app.services.twofa_service import get_live_2fa_status
from app.api.ws import manager

logger = logging.getLogger(__name__)

SYNC_INTERVAL_SECONDS = 6 * 60 * 60
ACCOUNT_DELAY_SECONDS = 15
INITIAL_DELAY_SECONDS = 60


def _status_payload(account: TelegramAccount, status: dict | None = None) -> dict:
    status = status or {
        "enabled": account.twofa_enabled,
        "has_recovery": account.twofa_has_recovery,
        "hint": account.twofa_hint,
        "login_email_pattern": account.login_email_pattern,
        "unconfirmed_email_pattern": account.unconfirmed_email_pattern,
    }
    return {
        "type": "twofa_status_sync",
        "account_id": str(account.id),
        "enabled": bool(status["enabled"]),
        "has_recovery": status.get("has_recovery"),
        "hint": status.get("hint"),
        "login_email_pattern": status.get("login_email_pattern"),
        "unconfirmed_email_pattern": status.get("unconfirmed_email_pattern"),
        "synced_at": account.twofa_status_synced_at.isoformat() if account.twofa_status_synced_at else None,
    }


async def broadcast_cached_twofa_status(account: TelegramAccount) -> None:
    """Push safe cached 2FA metadata after an account-scoped mutation."""
    await manager.broadcast(f"chats:{account.id}", _status_payload(account))


async def sync_account_twofa(account_id: str) -> bool:
    """Refresh one account's safe 2FA cache using an already connected client."""
    import uuid

    try:
        account_uuid = uuid.UUID(account_id)
    except ValueError:
        return False

    now = datetime.now(timezone.utc)
    stale_before = now - timedelta(seconds=SYNC_INTERVAL_SECONDS)
    async with async_session_factory() as db:
        result = await db.execute(select(TelegramAccount).where(TelegramAccount.id == account_uuid))
        account = result.scalar_one_or_none()
        if account is None or not account.is_active:
            return False
        if account.twofa_status_synced_at and account.twofa_status_synced_at >= stale_before:
            return False
        if account.twofa_status_retry_at and account.twofa_status_retry_at > now:
            return False

        clients = await client_pool.get_connected_clients()
        client = clients.get(str(account.id))
        if client is None or not client.is_connected():
            return False

        try:
            status = await get_live_2fa_status(client)
            if status is None:
                account.twofa_status_retry_at = now + timedelta(hours=1)
                await db.commit()
                return False
            account.twofa_enabled = bool(status["enabled"])
            account.twofa_has_recovery = status.get("has_recovery")
            account.twofa_hint = status.get("hint")
            account.login_email_pattern = status.get("login_email_pattern")
            account.unconfirmed_email_pattern = status.get("unconfirmed_email_pattern")
            account.twofa_status_synced_at = now
            account.twofa_status_retry_at = None
            await db.commit()
            await manager.broadcast(f"chats:{account.id}", _status_payload(account, status))
            logger.info("2FA metadata cache refreshed for account %s", account.id)
            return True
        except Exception as exc:
            logger.warning("2FA metadata sync failed for account %s: %s", account.id, type(exc).__name__)
            account.twofa_status_retry_at = now + timedelta(hours=1)
            await db.commit()
            return False


async def sync_due_accounts() -> int:
    """Refresh accounts whose cache is missing or older than six hours."""
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=SYNC_INTERVAL_SECONDS)
    async with async_session_factory() as db:
        result = await db.execute(
            select(TelegramAccount.id).where(
                TelegramAccount.is_active.is_(True),
                TelegramAccount.session_string != "",
                (TelegramAccount.twofa_status_synced_at.is_(None) | (TelegramAccount.twofa_status_synced_at < cutoff)),
                (TelegramAccount.twofa_status_retry_at.is_(None) | (TelegramAccount.twofa_status_retry_at <= datetime.now(timezone.utc))),
            )
        )
        account_ids = [str(row[0]) for row in result.all()]

    refreshed = 0
    for index, account_id in enumerate(account_ids):
        if await sync_account_twofa(account_id):
            refreshed += 1
        if index < len(account_ids) - 1:
            await asyncio.sleep(ACCOUNT_DELAY_SECONDS)
    return refreshed


async def background_twofa_updater() -> None:
    """Synchronize cached 2FA metadata every six hours without request-path Telegram calls."""
    await asyncio.sleep(INITIAL_DELAY_SECONDS)
    while True:
        try:
            count = await sync_due_accounts()
            logger.info("Background 2FA sync complete: %d account(s) refreshed", count)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Unhandled background 2FA sync error")
        await asyncio.sleep(SYNC_INTERVAL_SECONDS)
