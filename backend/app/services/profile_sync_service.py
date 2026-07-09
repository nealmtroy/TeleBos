"""Profile sync service — detects changes made directly on Telegram
(name, username, phone, profile picture) and updates TeleBos DB.

Telegram does NOT push real-time events for self-profile changes, so
this service uses periodic polling via client.get_me() to detect diffs.
"""

import asyncio
import io
import logging
import os
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session_factory
from app.models.telegram_account import TelegramAccount
from app.services.telegram_client import client_pool
from app.utils.encryption import decrypt
from app.api.ws import manager
from telethon.tl.functions.users import GetFullUserRequest

logger = logging.getLogger(__name__)

# Interval between individual account syncs to avoid Telegram rate limits
_INTER_ACCOUNT_DELAY = 2.0  # seconds

# Photo cache directory (same as account_service.py)
_PHOTO_DIR = os.path.join(
    os.path.dirname(os.path.dirname(__file__)), "uploads", "profile_photos"
)


def _ensure_photo_dir() -> None:
    os.makedirs(_PHOTO_DIR, exist_ok=True)


def _photo_path(account_id: str) -> str:
    return os.path.join(_PHOTO_DIR, f"{account_id}.jpg")


async def sync_account_profile(
    db: AsyncSession,
    account: TelegramAccount,
) -> dict | None:
    """Compare account profile in DB against live Telegram data.

    Returns a dict of changed fields if any, or None if nothing changed.
    Does NOT commit — caller must commit the session.
    """
    account_id = str(account.id)

    # Get the connected client from the pool (don't create new)
    clients = await client_pool.get_connected_clients()
    client = clients.get(account_id)
    if client is None or not client.is_connected():
        return None

    try:
        full = await client(GetFullUserRequest("me"))
        if not full or not full.users:
            return None
        me = full.users[0]
        bio = getattr(full.full_user, "about", "") or ""
    except Exception as exc:
        logger.debug("Profile sync: failed GetFullUserRequest() for %s: %s", account_id, exc)
        return None

    changes: dict[str, dict] = {}

    # ── Compare text fields ──────────────────────────────────────────────
    field_map = {
        "first_name": me.first_name,
        "last_name": me.last_name,
        "username": me.username,
        "phone": me.phone or "",
        "bio": bio,
    }

    for field, tg_value in field_map.items():
        db_value = getattr(account, field, None)
        # Normalize None vs empty string
        db_norm = (db_value or "").strip() if db_value is not None else ""
        tg_norm = (tg_value or "").strip() if tg_value is not None else ""

        if db_norm != tg_norm:
            changes[field] = {"old": db_value, "new": tg_value}
            setattr(account, field, tg_value)

    # ── Compare profile photo ────────────────────────────────────────────
    tg_photo_id: int | None = None
    if me.photo and hasattr(me.photo, "photo_id"):
        tg_photo_id = me.photo.photo_id

    db_photo_id = account.profile_photo_id

    photo_changed = False
    if tg_photo_id != db_photo_id:
        photo_changed = True
        changes["profile_photo"] = {
            "old": str(db_photo_id) if db_photo_id else None,
            "new": str(tg_photo_id) if tg_photo_id else None,
        }
        account.profile_photo_id = tg_photo_id

        if tg_photo_id is not None:
            # Photo was added or changed — download & cache
            try:
                _ensure_photo_dir()
                buf = io.BytesIO()
                downloaded = await client.download_profile_photo(me, file=buf)
                if downloaded:
                    buf.seek(0)
                    photo_path = _photo_path(account_id)
                    with open(photo_path, "wb") as f:
                        f.write(buf.read())
                    account.profile_photo_path = photo_path
                    account.photo_version += 1
            except Exception as exc:
                logger.warning(
                    "Profile sync: failed to download photo for %s: %s",
                    account_id,
                    exc,
                )
        else:
            # Photo was removed
            photo_path = _photo_path(account_id)
            if os.path.exists(photo_path):
                try:
                    os.remove(photo_path)
                except OSError:
                    pass
            account.profile_photo_path = None
            account.photo_version += 1

    if not changes:
        return None

    # Update sync timestamp
    account.last_sync_at = datetime.now(timezone.utc)
    await db.flush()

    # ── Log changes ──────────────────────────────────────────────────────
    change_summary = ", ".join(
        f"{k}: '{v['old']}' → '{v['new']}'" for k, v in changes.items()
    )
    logger.info(
        "Profile sync: account %s (%s) changed — %s",
        account_id,
        account.phone,
        change_summary,
    )

    # ── Push WebSocket notification ──────────────────────────────────────
    try:
        channel = f"chats:{account_id}"
        ws_payload = {
            "type": "profile_sync",
            "account_id": account_id,
            "changes": {
                k: v["new"] for k, v in changes.items()
                if k != "profile_photo"
            },
        }
        if photo_changed:
            ws_payload["photo_changed"] = True
            ws_payload["photo_version"] = account.photo_version
        await manager.broadcast(channel, ws_payload)
    except Exception as exc:
        logger.warning("Profile sync: WS push failed for %s: %s", account_id, exc)

    return changes


async def sync_all_profiles() -> int:
    """Sync profile data for all active, connected accounts.

    Returns the number of accounts that had changes.
    """
    changed_count = 0

    # Phase 1: Short DB session to get account IDs
    account_ids: list[str] = []
    try:
        async with async_session_factory() as db:
            result = await db.execute(
                select(TelegramAccount.id).where(
                    TelegramAccount.is_active.is_(True),
                    TelegramAccount.session_string != "",
                )
            )
            account_ids = [str(row[0]) for row in result.all()]
    except Exception as exc:
        logger.error("Profile sync: failed to fetch accounts: %s", exc)
        return 0

    # Phase 2: Sync each account with its own short-lived DB session
    for account_id in account_ids:
        try:
            async with async_session_factory() as db:
                result = await db.execute(
                    select(TelegramAccount).where(TelegramAccount.id == account_id)
                )
                account = result.scalar_one_or_none()
                if account:
                    changes = await sync_account_profile(db, account)
                    if changes:
                        changed_count += 1
                    await db.commit()
        except Exception as exc:
            logger.warning(
                "Profile sync: error syncing account %s: %s",
                account_id,
                exc,
            )
        # Rate limit: wait between accounts (no DB session held during sleep)
        await asyncio.sleep(_INTER_ACCOUNT_DELAY)

    if changed_count > 0:
        logger.info("Profile sync: %d account(s) updated", changed_count)

    return changed_count
