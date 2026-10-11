"""Service for Telegram Bot authenticator-style linking and status management.

Provides cryptographically secure, single-use, time-limited linking tokens
to connect TeleBos user accounts with Telegram Bot without exposing passwords in chat.
"""

import json
import logging
import secrets
import time
from datetime import datetime, timezone
from typing import Optional, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.user import User
from app.utils.redis import redis_client

logger = logging.getLogger(__name__)
settings = get_settings()

# Base alphabet for token: uppercase alphanumeric excluding ambiguous characters (0, O, 1, I, L)
TOKEN_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
TOKEN_LENGTH = 6
TOKEN_TTL_SECONDS = 600  # 10 minutes
MAX_GENERATION_PER_WINDOW = 5
GENERATION_WINDOW_SECONDS = 600  # 10 minutes
MAX_VERIFICATION_ATTEMPTS = 5
LOCKOUT_WINDOW_SECONDS = 900  # 15 minutes


async def get_bot_username() -> str:
    """Retrieve the bot username from Redis cache or configuration."""
    try:
        cached_username = await redis_client.get("telebos_bot:username")
        if cached_username:
            return cached_username.strip().lstrip("@")
    except Exception as exc:
        logger.warning("Failed to fetch bot username from Redis: %s", exc)

    configured = getattr(settings, "TELEGRAM_BOT_USERNAME", "")
    if configured:
        return configured.strip().lstrip("@")
    return "TeleBosBot"


async def set_bot_username(username: str) -> None:
    """Cache the active bot username in Redis."""
    try:
        clean_username = username.strip().lstrip("@")
        await redis_client.set("telebos_bot:username", clean_username)
    except Exception as exc:
        logger.warning("Failed to cache bot username in Redis: %s", exc)


def _generate_secure_token() -> str:
    """Generate a high-entropy, human-friendly linking token."""
    rand_part = "".join(secrets.choice(TOKEN_ALPHABET) for _ in range(TOKEN_LENGTH))
    return f"TB-{rand_part}"


async def generate_linking_token(db: AsyncSession, user: User) -> dict:
    """Generate a single-use authenticator-style token for the given user.

    Enforces rate limits and revokes any previously active token for this user.
    """
    if not user.is_active:
        raise ValueError("Akun dinonaktifkan.")

    user_id_str = str(user.id)

    # 1. Rate limiting check (max 5 token generations per 10 minutes)
    gen_key = f"tg_gen_rate:{user_id_str}"
    current_count = await redis_client.incr(gen_key)
    if current_count == 1:
        await redis_client.expire(gen_key, GENERATION_WINDOW_SECONDS)
    elif current_count > MAX_GENERATION_PER_WINDOW:
        ttl = await redis_client.ttl(gen_key)
        raise ValueError(f"Terlalu banyak permintaan token. Silakan tunggu {ttl} detik.")

    # 2. Invalidate any previously active token for this user
    active_token_key = f"user_tg_link_token:{user_id_str}"
    old_token = await redis_client.get(active_token_key)
    if old_token:
        await redis_client.delete(f"tg_link_token:{old_token}")

    # 3. Generate new cryptographically secure token
    token = _generate_secure_token()
    token_payload = {
        "user_id": user_id_str,
        "email": user.email,
        "created_at": time.time(),
    }

    # 4. Save in Redis with strict TTL
    await redis_client.setex(
        f"tg_link_token:{token}",
        TOKEN_TTL_SECONDS,
        json.dumps(token_payload),
    )
    await redis_client.setex(active_token_key, TOKEN_TTL_SECONDS, token)

    bot_username = await get_bot_username()
    deep_link = f"https://t.me/{bot_username}?start={token}" if bot_username else None

    logger.info("Generated Telegram linking token for user %s (expires in %ds)", user.email, TOKEN_TTL_SECONDS)

    return {
        "token": token,
        "expires_in": TOKEN_TTL_SECONDS,
        "bot_username": bot_username,
        "deep_link": deep_link,
    }


async def verify_and_link_token(
    db: AsyncSession,
    raw_token: str,
    telegram_chat_id: int,
) -> Tuple[bool, str, Optional[User]]:
    """Verify a linking token and bind the Telegram chat ID to the user account.

    Guarantees:
    - Atomicity & Single-Use (consumed immediately)
    - Brute-force lockout per Telegram chat ID
    - 1-to-1 unique mapping (cleans up any stale mapping)
    """
    if not raw_token or not telegram_chat_id:
        return False, "Token atau Telegram Chat ID tidak valid.", None

    chat_id_str = str(telegram_chat_id)
    fail_key = f"tg_link_fail:{chat_id_str}"

    # 1. Check brute-force lockout
    fails_raw = await redis_client.get(fail_key)
    if fails_raw and int(fails_raw) >= MAX_VERIFICATION_ATTEMPTS:
        ttl = await redis_client.ttl(fail_key)
        minutes = max(1, ttl // 60)
        return False, f"Terlalu banyak percobaan gagal. Silakan coba lagi dalam {minutes} menit.", None

    # 2. Normalize token
    norm_token = raw_token.strip().upper()
    if not norm_token.startswith("TB-") and len(norm_token) == TOKEN_LENGTH:
        norm_token = f"TB-{norm_token}"

    token_key = f"tg_link_token:{norm_token}"

    # 3. Atomic single-use consumption (GET and DELETE)
    # Using pipeline/Lua or getdel if available
    try:
        raw_data = await redis_client.getdel(token_key)
    except Exception:
        # Fallback for Redis versions that do not support GETDEL
        raw_data = await redis_client.get(token_key)
        if raw_data:
            await redis_client.delete(token_key)

    if not raw_data:
        fails = await redis_client.incr(fail_key)
        if fails == 1:
            await redis_client.expire(fail_key, LOCKOUT_WINDOW_SECONDS)
        remaining = max(0, MAX_VERIFICATION_ATTEMPTS - fails)
        msg = f"Token tidak valid atau sudah kedaluwarsa. Sisa kesempatan: {remaining} kali."
        if remaining == 0:
            msg = "Batas percobaan terlampaui. Akun Anda dibatasi selama 15 menit."
        return False, msg, None

    try:
        payload = json.loads(raw_data)
        user_id_str = payload.get("user_id")
    except Exception as exc:
        logger.error("Failed to parse link token payload: %s", exc)
        return False, "Token rusak atau tidak valid.", None

    # Delete reverse lookup
    await redis_client.delete(f"user_tg_link_token:{user_id_str}")

    # 4. Bind in Database
    import uuid
    try:
        user_uuid = uuid.UUID(user_id_str)
    except ValueError:
        return False, "ID pengguna tidak valid.", None

    res_user = await db.execute(
        select(User).where(User.id == user_uuid).with_for_update()
    )
    user = res_user.scalar_one_or_none()

    if not user:
        return False, "Pengguna TeleBos tidak ditemukan.", None
    if not user.is_active:
        return False, "Akun TeleBos dinonaktifkan.", None

    # Check 1-to-1 mapping: if another user was linked to this telegram_chat_id, detach them
    res_other = await db.execute(
        select(User).where(User.telegram_chat_id == telegram_chat_id, User.id != user.id).with_for_update()
    )
    other_user = res_other.scalar_one_or_none()
    if other_user:
        other_user.telegram_chat_id = None
        await db.flush()
        logger.info("Detached Telegram chat ID %d from user %s to link to %s", telegram_chat_id, other_user.email, user.email)

    user.telegram_chat_id = telegram_chat_id
    await db.commit()
    await db.refresh(user)

    # Clear fail counter on success
    await redis_client.delete(fail_key)

    logger.info("Successfully linked Telegram chat ID %d to user %s (%s)", telegram_chat_id, user.email, user.id)
    return True, "Akun berhasil dihubungkan!", user


async def unlink_telegram(db: AsyncSession, user: User) -> bool:
    """Disconnect Telegram chat ID from the user account."""
    res = await db.execute(
        select(User).where(User.id == user.id).with_for_update()
    )
    u = res.scalar_one_or_none()
    if not u:
        return False

    old_chat_id = u.telegram_chat_id
    u.telegram_chat_id = None

    # Also clean up any active token in Redis
    user_id_str = str(user.id)
    active_token = await redis_client.get(f"user_tg_link_token:{user_id_str}")
    if active_token:
        await redis_client.delete(f"tg_link_token:{active_token}")
        await redis_client.delete(f"user_tg_link_token:{user_id_str}")

    await db.commit()
    logger.info("Unlinked Telegram chat ID %s from user %s", old_chat_id, user.email)
    return True


async def get_telegram_status(db: AsyncSession, user: User) -> dict:
    """Get the current Telegram connection status and bot username."""
    # Re-fetch user to ensure latest database state
    res = await db.execute(select(User).where(User.id == user.id))
    u = res.scalar_one_or_none() or user

    bot_username = await get_bot_username()
    user_id_str = str(u.id)

    active_token = await redis_client.get(f"user_tg_link_token:{user_id_str}")
    token_ttl = 0
    if active_token:
        token_ttl = await redis_client.ttl(f"tg_link_token:{active_token}")
        if token_ttl <= 0:
            active_token = None
            token_ttl = 0

    return {
        "is_connected": u.telegram_chat_id is not None,
        "telegram_chat_id": u.telegram_chat_id,
        "bot_username": bot_username,
        "has_active_token": bool(active_token),
        "active_token": active_token,
        "token_ttl": max(0, token_ttl),
    }
