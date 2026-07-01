"""Account management business logic — login, logout, profile."""

import logging
import os
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from sqlalchemy import func

from app.models.telegram_account import TelegramAccount
from app.models.user import User
from app.services.telegram_client import client_pool
from app.utils.encryption import encrypt, decrypt
from app.utils.session_converter import convert_to_telethon

class DuplicateAccountError(Exception):
    """Raised when trying to add a Telegram account that already exists in the system."""
    pass


# ── Role-based account limits ──────────────────────────────────────────────

ROLE_ACCOUNT_LIMITS: dict[str, int] = {
    "basic": 1,
    "pro": 10,
    "premium": 100,
    "owner": 999999,
}


async def check_account_limit(db: AsyncSession, user: User) -> None:
    """Raise ValueError if the user has reached their role-based account limit."""
    limit = ROLE_ACCOUNT_LIMITS.get(user.role, 0)
    result = await db.execute(
        select(func.count()).select_from(TelegramAccount).where(TelegramAccount.user_id == user.id)
    )
    current_count = result.scalar() or 0
    if current_count >= limit:
        raise ValueError(
            f"Account limit reached for role '{user.role}': maximum {limit} account(s). "
            f"You currently have {current_count}."
        )

logger = logging.getLogger(__name__)


def detect_2fa_hint_from_error(error_message: str) -> tuple[bool, str | None]:
    """
    Detect if error indicates 2FA is required and extract hint.

    Returns:
        Tuple of (is_2fa_required, hint_message or None)
    """
    # Common Telegram 2FA error messages and indicators
    error_lower = error_message.lower()

    # Check for various 2FA-related errors
    if any(indicator in error_lower for indicator in [
        "password", "2fa", "two-step", "multifactor",
        "session_password", "requires password"
    ]):
        return True, "Akun ini memiliki verifikasi 2 langkah (V2L / 2FA). Password diperlukan."

    # Check for flood wait or rate limiting
    if "flood_wait" in error_lower or "sleep" in error_lower:
        import re
        match = re.search(r'second\s*[:=\s]*(\d+)', error_lower)
        seconds = int(match.group(1)) if match else 60
        return False, f"Flood wait aktif. Coba lagi dalam {seconds} detik."

    # Check for phone not found
    if any(indicator in error_lower for indicator in [
        "user_not_found", "phone number invalid", "not registered"
    ]):
        return False, None

    return False, None


async def check_account_hint(phone: str) -> dict[str, Any] | None:
    """
    Check for account hints like 2FA status before login.

    This sends a test code request to detect account state without completing login.

    Returns:
        Dict with hint info or None if no hints available.
    """
    client = await client_pool.create_unauth_client()
    try:
        try:
            # Request code - this will work for valid phones but may indicate 2FA issues
            result = await client.send_code_request(phone)

            # Code sent successfully means phone exists
            v2l_hint = {
                "has_2fa": False,
                "phone_exists": True,
                "flood_wait_sec": None,
            }

            # Check for rate limiting based on expires field
            expires = getattr(result, "expires", None)
            if expires and expires > 300:  # More than 5 minutes
                v2l_hint["flood_wait_sec"] = expires
                v2l_hint["has_2fa"] = False

            return v2l_hint

        except Exception as exc:
            error_str = str(exc)
            is_2fa, hint_msg = detect_2fa_hint_from_error(error_str)

            if "flood_wait" in error_str.lower() or "you are flooding" in error_str.lower():
                import re
                match = re.search(r'\d+', error_str)
                seconds = int(match.group()) if match else 60

                return {
                    "has_2fa": False,
                    "phone_exists": True,
                    "flood_wait_sec": seconds,
                    "error": f"Flood wait aktif. Coba lagi dalam {seconds} detik.",
                }

            if "user_not_found" in error_str.lower() or "invalid phone" in error_str.lower():
                return {
                    "has_2fa": False,
                    "phone_exists": False,
                    "flood_wait_sec": None,
                    "error": "Nomor tidak terdaftar di Telegram",
                }

            if is_2fa:
                return {
                    "has_2fa": True,
                    "phone_exists": True,
                    "flood_wait_sec": None,
                    "error": hint_msg,
                }

            logger.warning(f"Unexpected error checking hint for {phone}: {exc}")
            return None
    finally:
        try:
            await client.disconnect()
        except Exception:
            pass


async def start_login(phone: str) -> tuple[Any, str, int]:
    """
    Send the OTP code to the given phone number.

    Returns:
        Tuple of (client, phone_code_hash, timeout_seconds).

    The caller must keep the client reference to later call verify_code.
    """
    client = await client_pool.create_unauth_client()
    try:
        result = await client.send_code_request(phone)
        phone_code_hash = result.phone_code_hash
        timeout = getattr(result, "timeout", None)
        if timeout is None:
            timeout = 120
        return client, phone_code_hash, timeout
    except Exception:
        try:
            await client.disconnect()
        except Exception:
            pass
        raise


async def verify_code(
    unauth_client: Any,
    phone: str,
    code: str,
    phone_code_hash: str,
    twofa_password: str | None = None,
    db: AsyncSession | None = None,
    user: User | None = None,
) -> tuple[TelegramAccount | None, bool, str | None]:
    """
    Verify the OTP code (and optional 2FA password).

    Returns:
        Tuple of (account or None, requires_2fa bool, v2l_hint or None).

    Raises:
        ValueError: If the code is invalid or expired (retryable), or role account limit reached.
        Exception: For fatal errors where the pending login should be discarded.
    """
    # Verify the code (and optional 2FA password)
    try:
        await unauth_client.sign_in(
            phone=phone,
            code=code,
            phone_code_hash=phone_code_hash,
        )
    except Exception as exc:
        from telethon.errors import (
            SessionPasswordNeededError,
            PhoneCodeInvalidError,
            PhoneCodeExpiredError,
        )

        # Wrong or expired code — retryable, don't discard the pending login
        if isinstance(exc, PhoneCodeInvalidError):
            raise ValueError("Kode verifikasi salah. Silakan coba lagi.") from exc
        if isinstance(exc, PhoneCodeExpiredError):
            raise ValueError(
                "Kode verifikasi telah kedaluwarsa. Silakan minta kode baru."
            ) from exc

        if isinstance(exc, SessionPasswordNeededError):
            if twofa_password:
                try:
                    await unauth_client.sign_in(password=twofa_password)
                except Exception as pwd_exc:
                    from telethon.errors import PasswordHashInvalidError
                    if isinstance(pwd_exc, PasswordHashInvalidError) or "PASSWORD_HASH_INVALID" in str(pwd_exc):
                        raise ValueError("Password V2L/2FA salah. Silakan coba lagi.") from pwd_exc
                    raise
            else:
                # Try to get password hint for display
                try:
                    # Get password info to extract hint
                    password_info = await unauth_client.get_password()
                    hint_msg = password_info.hint if password_info.hint else None
                    hint_text = f"Verifikasi 2 langkah aktif. Password hint: {' '.join(hint_msg)}" if hint_msg else None
                except Exception:
                    hint_text = "Akun ini memiliki verifikasi 2 langkah (V2L / 2FA). Masukkan password Telegram Anda."

                return None, True, hint_text
        else:
            msg = str(exc)
            # Check for invalid/expired code from raw RPC error text (fallback)
            if "PHONE_CODE_INVALID" in msg:
                raise ValueError("Kode verifikasi salah. Silakan coba lagi.") from exc
            if "PHONE_CODE_EXPIRED" in msg:
                raise ValueError(
                    "Kode verifikasi telah kedaluwarsa. Silakan minta kode baru."
                ) from exc
            if "PASSWORD_HASH_REQUIRED" in msg or "2FA" in msg:
                if twofa_password:
                    try:
                        await unauth_client.sign_in(password=twofa_password)
                    except Exception as pwd_exc:
                        from telethon.errors import PasswordHashInvalidError
                        if isinstance(pwd_exc, PasswordHashInvalidError) or "PASSWORD_HASH_INVALID" in str(pwd_exc):
                            raise ValueError("Password V2L/2FA salah. Silakan coba lagi.") from pwd_exc
                        raise
                else:
                    return None, True, None
            else:
                raise

    # Save the session string
    session_string = ""
    if isinstance(unauth_client.session, type(unauth_client.session)):
        session_string = unauth_client.session.save()

    me = await unauth_client.get_me()
    if not me or not me.id:
        raise ValueError("Gagal mengambil informasi profil Telegram.")

    # Check live 2FA status from Telegram
    twofa_enabled = False
    try:
        from telethon.tl.functions.account import GetPasswordRequest
        pwd = await unauth_client(GetPasswordRequest())
        twofa_enabled = pwd.has_password
    except Exception:
        pass

    if db is not None and me.id:
        existing = await db.execute(
            select(TelegramAccount).where(TelegramAccount.telegram_id == me.id)
        )
        existing_acc = existing.scalar_one_or_none()
        if existing_acc:
            if user is None or existing_acc.user_id != user.id:
                raise DuplicateAccountError(
                    f"Akun Telegram (ID: {me.id}) sudah terdaftar di TeleBos oleh pengguna lain."
                )
            else:
                # Same user: update existing account and set active
                existing_acc.session_string = encrypt(session_string)
                existing_acc.phone = phone
                existing_acc.first_name = me.first_name
                existing_acc.last_name = me.last_name
                existing_acc.username = me.username
                existing_acc.twofa_enabled = twofa_enabled
                if twofa_password:
                    existing_acc.twofa_password = encrypt(twofa_password)
                existing_acc.is_active = True
                existing_acc.for_sale = False
                existing_acc.is_sold = False
                await remove_from_expired_folder(db, existing_acc.id, existing_acc.user_id)
                return existing_acc, False, None

    # New account registration — check account limit first
    if db is not None and user is not None:
        await check_account_limit(db, user)

    account = TelegramAccount(
        phone=phone,
        session_string=encrypt(session_string),
        phone_verified=True,
        first_name=me.first_name,
        last_name=me.last_name,
        username=me.username,
        telegram_id=me.id,
        twofa_enabled=twofa_enabled,
    )
    if twofa_password:
        account.twofa_password = encrypt(twofa_password)
    return account, False, None


async def login_with_session(
    db: AsyncSession,
    user: User,
    session_string: str,
) -> TelegramAccount:
    """Add an account by uploading an existing session string.
    Phone number is extracted automatically from Telegram after connecting.
    """
    # Convert session string to Telethon format (supports GramJS, Pyrogram, raw)
    try:
        session_string = convert_to_telethon(session_string)
    except ValueError as exc:
        raise ValueError(f"Session format error: {exc}")

    # Test the session — always create a fresh client to avoid cross-account caching
    from telethon import TelegramClient
    from telethon.sessions import StringSession
    from app.config import get_settings

    settings = get_settings()
    if not settings.TELEGRAM_API_ID or not settings.TELEGRAM_API_HASH:
        raise ValueError("Telegram API ID or Hash is not configured in the backend .env file.")
    from app.utils.device_spoof import random_ios_device
    ios_params = random_ios_device()
    test_client = TelegramClient(
        StringSession(session_string),
        api_id=settings.TELEGRAM_API_ID,
        api_hash=settings.TELEGRAM_API_HASH,
        device_model=ios_params["device_model"],
        app_version=ios_params["app_version"],
        system_version=ios_params["system_version"],
        lang_code=ios_params["lang_code"],
        system_lang_code=ios_params["system_lang_code"],
    )
    await test_client.connect()
    try:
        if not await test_client.is_user_authorized():
            raise ValueError("Session string is invalid or expired")
        me = await test_client.get_me()
    finally:
        try:
            await test_client.disconnect()
        except Exception:
            pass

    # Use phone from Telegram if available, fallback to placeholder
    phone = me.phone or ""

    if not me or not me.id:
        raise ValueError("Gagal mengambil informasi profil Telegram.")

    # Check for duplicate by telegram_id
    if me.id:
        existing = await db.execute(
            select(TelegramAccount).where(TelegramAccount.telegram_id == me.id)
        )
        existing_acc = existing.scalar_one_or_none()
        if existing_acc:
            if existing_acc.user_id != user.id:
                raise ValueError(
                    f"Akun Telegram (ID: {me.id}) sudah terdaftar di TeleBos oleh pengguna lain."
                )
            else:
                # Same user: update existing account and set active
                existing_acc.session_string = encrypt(session_string)
                existing_acc.phone = phone
                existing_acc.first_name = me.first_name
                existing_acc.last_name = me.last_name
                existing_acc.username = me.username
                existing_acc.is_active = True
                existing_acc.for_sale = False
                existing_acc.is_sold = False
                await remove_from_expired_folder(db, existing_acc.id, existing_acc.user_id)
                await db.flush()
                return existing_acc

    # New account registration — check account limit first
    await check_account_limit(db, user)

    # Check for duplicate by phone (skip if phone is empty)
    if phone:
        existing = await db.execute(
            select(TelegramAccount).where(
                TelegramAccount.user_id == user.id,
                TelegramAccount.phone == phone,
            )
        )
        if existing.scalar_one_or_none():
            raise ValueError(f"Account with phone {phone} already exists")

    account = TelegramAccount(
        user_id=user.id,
        phone=phone,
        session_string=encrypt(session_string),
        phone_verified=True,
        first_name=me.first_name,
        last_name=me.last_name,
        username=me.username,
        telegram_id=me.id,
        twofa_enabled=False,
    )
    db.add(account)
    await db.flush()
    return account


async def get_accounts_for_user(
    db: AsyncSession, user: User
) -> list[TelegramAccount]:
    result = await db.execute(
        select(TelegramAccount)
        .options(selectinload(TelegramAccount.folders))
        .where(TelegramAccount.user_id == user.id)
        .order_by(TelegramAccount.created_at.desc())
    )
    return list(result.scalars().all())


async def get_accounts_paginated(
    db: AsyncSession,
    user: User,
    page: int = 1,
    limit: int = 10,
    search: str | None = None,
    folder_id: str | None = None,
    status: str | None = None,
) -> tuple[list[TelegramAccount], int]:
    """Get paginated accounts for a user with optional search, folder and status filters."""
    from sqlalchemy import or_, cast, String, func
    from app.models.account_folder_member import AccountFolderMember

    # Base query select from TelegramAccount
    query = (
        select(TelegramAccount)
        .options(selectinload(TelegramAccount.folders))
        .where(TelegramAccount.user_id == user.id)
    )

    # Filter by folder
    if folder_id:
        query = query.join(
            AccountFolderMember,
            TelegramAccount.id == AccountFolderMember.account_id
        ).where(AccountFolderMember.folder_id == folder_id)

    # Apply search filter
    if search:
        search_term = f"%{search.strip()}%"
        conditions = [
            TelegramAccount.first_name.ilike(search_term),
            TelegramAccount.last_name.ilike(search_term),
            TelegramAccount.phone.ilike(search_term),
            TelegramAccount.username.ilike(search_term),
        ]
        # Also check if search query is a number to match telegram_id directly
        if search.strip().isdigit():
            conditions.append(TelegramAccount.telegram_id == int(search.strip()))
        else:
            conditions.append(cast(TelegramAccount.telegram_id, String).ilike(search_term))
            
        query = query.where(or_(*conditions))

    # Apply status filter
    if status:
        if status == "active":
            query = query.where(
                TelegramAccount.is_active == True,
                or_(
                    TelegramAccount.spam_status != "limited",
                    TelegramAccount.spam_status.is_(None)
                )
            )
        elif status == "limited":
            query = query.where(
                TelegramAccount.is_active == True,
                TelegramAccount.spam_status == "limited"
            )
        elif status == "inactive":
            query = query.where(TelegramAccount.is_active == False)

    # Get total count (before pagination limit/offset)
    count_query = select(func.count()).select_from(query.subquery())
    total = await db.scalar(count_query) or 0

    # Apply ordering, limit and offset
    query = query.order_by(TelegramAccount.created_at.desc())
    
    # Calculate offset
    offset = (page - 1) * limit
    query = query.offset(offset).limit(limit)

    result = await db.execute(query)
    accounts = list(result.scalars().all())
    return accounts, total


async def get_accounts_in_folder(
    db: AsyncSession, user: User, folder_id: str
) -> list[TelegramAccount]:
    """Return accounts that belong to the given folder (and user)."""
    from app.models.account_folder import AccountFolder
    from app.models.account_folder_member import AccountFolderMember

    # Verify folder belongs to user
    folder_result = await db.execute(
        select(AccountFolder).where(
            AccountFolder.id == folder_id,
            AccountFolder.user_id == user.id,
        )
    )
    folder = folder_result.scalar_one_or_none()
    if not folder:
        return []

    # Get accounts via membership join with eager-loaded folders
    result = await db.execute(
        select(TelegramAccount)
        .options(selectinload(TelegramAccount.folders))
        .join(AccountFolderMember, TelegramAccount.id == AccountFolderMember.account_id)
        .where(
            AccountFolderMember.folder_id == folder_id,
            TelegramAccount.user_id == user.id,
        )
        .order_by(TelegramAccount.created_at.desc())
    )
    return list(result.scalars().all())


async def get_account(db: AsyncSession, account_id: str, user_id: str) -> TelegramAccount | None:
    result = await db.execute(
        select(TelegramAccount)
        .options(selectinload(TelegramAccount.folders))
        .where(
            TelegramAccount.id == account_id,
            TelegramAccount.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()


async def update_profile(
    db: AsyncSession,
    account: TelegramAccount,
    first_name: str | None,
    last_name: str | None,
    username: str | None,
    bio: str | None,
) -> TelegramAccount:
    """Update Telegram profile and DB cache."""
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")

    from telethon.tl.functions.account import UpdateProfileRequest, UpdateUsernameRequest
    from telethon.errors import (
        UsernameOccupiedError,
        UsernameInvalidError,
        AboutTooLongError,
        FloodWaitError,
        RPCError,
    )

    tg_first_name = first_name if first_name is not None else (account.first_name or "")
    tg_last_name = last_name if last_name is not None else (account.last_name or "")
    tg_bio = bio if bio is not None else (account.bio or "")

    try:
        await client(UpdateProfileRequest(
            first_name=tg_first_name,
            last_name=tg_last_name,
            about=tg_bio,
        ))

        if username is not None and username != account.username:
            await client(UpdateUsernameRequest(username=username))
    except UsernameOccupiedError:
        raise RuntimeError("Username sudah digunakan oleh akun lain.")
    except UsernameInvalidError:
        raise RuntimeError("Format username tidak valid. Username minimal 5 karakter, hanya boleh berisi huruf, angka, dan underscore.")
    except AboutTooLongError:
        raise RuntimeError("Bio terlalu panjang.")
    except FloodWaitError as exc:
        raise RuntimeError(f"Terlalu banyak permintaan. Silakan coba lagi setelah {exc.seconds} detik.")
    except RPCError as exc:
        raise RuntimeError(f"Gagal memperbarui profil: {exc.message}")

    if first_name is not None:
        account.first_name = first_name
    if last_name is not None:
        account.last_name = last_name
    if username is not None:
        account.username = username if username != "" else None
    if bio is not None:
        account.bio = bio

    await db.flush()
    return account


def resize_to_avatar(image_bytes: bytes, size: tuple[int, int] = (320, 320)) -> bytes:
    """Resize image bytes to the target size, keeping aspect ratio and cropping to square if necessary."""
    from PIL import Image
    import io

    img = Image.open(io.BytesIO(image_bytes))
    
    # Convert to RGB if not already (PNGs might be RGBA, we want JPEG)
    if img.mode != "RGB":
        img = img.convert("RGB")
        
    # Crop to square first if it's not square
    width, height = img.size
    if width != height:
        min_dim = min(width, height)
        left = (width - min_dim) // 2
        top = (height - min_dim) // 2
        right = (width + min_dim) // 2
        bottom = (height + min_dim) // 2
        img = img.crop((left, top, right, bottom))
        
    # Resize to target size
    img = img.resize(size, Image.Resampling.LANCZOS)
    
    # Save to bytes
    out_buf = io.BytesIO()
    img.save(out_buf, format="JPEG", quality=85)
    return out_buf.getvalue()


async def upload_photo(db: AsyncSession, account: TelegramAccount, photo_bytes: bytes) -> None:
    """Upload profile photo to Telegram and cache locally."""
    from telethon.tl.functions.photos import UploadProfilePhotoRequest

    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")

    import tempfile
    with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as tmp:
        tmp.write(photo_bytes)
        tmp_path = tmp.name

    try:
        # Telethon — upload file first, then set as profile photo
        file = await client.upload_file(tmp_path)
        await client(UploadProfilePhotoRequest(file=file))
        # After uploading to Telegram, download and cache locally
        _ensure_photo_dir()
        photo_path = _photo_path(str(account.id))
        me = await client.get_me()
        if me:
            import io
            buf = io.BytesIO()
            downloaded = await client.download_profile_photo(me, file=buf)
            if downloaded:
                buf.seek(0)
                data = buf.read()
                try:
                    data = resize_to_avatar(data)
                except Exception as e:
                    logger.warning("Failed to resize uploaded profile photo for %s: %s", account.id, e)
                with open(photo_path, "wb") as f:
                    f.write(data)
                account.profile_photo_path = photo_path
            else:
                account.profile_photo_path = None
        else:
            account.profile_photo_path = None
        account.photo_version += 1
        await db.flush()
    finally:
        os.unlink(tmp_path)


async def delete_photo(db: AsyncSession, account: TelegramAccount) -> None:
    """Delete profile photo from Telegram and remove local cache."""
    from telethon.tl.functions.photos import DeletePhotosRequest

    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")

    # Get current profile photos and delete them
    from telethon.tl.functions.photos import GetUserPhotosRequest
    result = await client(GetUserPhotosRequest(user_id=await client.get_me(), offset=0, max_id=0, limit=1))
    if result.photos:
        await client(DeletePhotosRequest(id=result.photos))

    # Delete local cache
    photo_path = _photo_path(str(account.id))
    if os.path.exists(photo_path):
        os.remove(photo_path)

    account.profile_photo_path = None
    account.photo_version += 1
    await db.flush()


async def get_cached_photo_path(account_id: str) -> str | None:
    """Return the local cached photo path if it exists."""
    path = _photo_path(account_id)
    if os.path.exists(path):
        return path
    return None


async def download_and_cache_photo(account: TelegramAccount) -> bytes | None:
    """Download the profile photo from Telegram, cache it, and return bytes."""
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        return None

    import io
    buf = io.BytesIO()
    me = await client.get_me()
    if not me:
        return None

    downloaded = await client.download_profile_photo(me, file=buf)
    if not downloaded:
        return None

    buf.seek(0)
    data = buf.read()
    try:
        data = resize_to_avatar(data)
    except Exception as e:
        logger.warning("Failed to resize profile photo for %s: %s", account.id, e)

    # Cache locally
    _ensure_photo_dir()
    photo_path = _photo_path(str(account.id))
    with open(photo_path, "wb") as f:
        f.write(data)

    account.profile_photo_path = photo_path
    account.photo_version += 1
    return data


_PHOTO_DIR = os.path.join(
    os.path.dirname(os.path.dirname(__file__)), "uploads", "profile_photos"
)


def _ensure_photo_dir() -> None:
    """Create the profile photos directory if it doesn't exist."""
    os.makedirs(_PHOTO_DIR, exist_ok=True)


def _photo_path(account_id: str) -> str:
    """Return the local file path for an account's cached profile photo."""
    return os.path.join(_PHOTO_DIR, f"{account_id}.jpg")


async def remove_account(db: AsyncSession, account: TelegramAccount) -> None:
    """Disconnect client, clean up cached photo, clear flood state, and delete account from DB."""
    # Detach event relay handlers first to clean up listeners and references
    from app.services.event_relay import event_relay
    await event_relay.detach(str(account.id))

    await client_pool.remove(str(account.id))

    # Clean up flood control state for this account
    from app.utils.flood_control import flood_controller
    flood_controller.reset(str(account.id))

    # Clean up cached profile photo
    photo_path = _photo_path(str(account.id))
    if os.path.exists(photo_path):
        os.remove(photo_path)

    await db.delete(account)


async def check_spam_status(db: AsyncSession, account: TelegramAccount) -> TelegramAccount:
    """
    Check the spam limit status of the Telegram account by sending a message to @SpamBot.
    Updates account.spam_status, account.spam_detail, and account.spam_last_checked_at.
    """
    import asyncio
    from datetime import datetime, timezone

    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")

    try:
        # 1. Send /start to @SpamBot
        sent_msg = await client.send_message("SpamBot", "/start")

        # 2. Poll for response messages for up to 5 seconds
        response_msg = None
        for _ in range(5):
            messages = await client.get_messages("SpamBot", limit=5)
            for msg in messages:
                # incoming message (not sent by us)
                if not msg.out:
                    # Verify it's after the sent message
                    if sent_msg and msg.date >= sent_msg.date:
                        response_msg = msg
                        break
            if response_msg:
                break
            await asyncio.sleep(1.0)

        # Fallback to the latest incoming message if no exact date match found
        if not response_msg:
            messages = await client.get_messages("SpamBot", limit=5)
            for msg in messages:
                if not msg.out:
                    response_msg = msg
                    break

        if response_msg and response_msg.text:
            text_lower = response_msg.text.lower()
            # Common keywords indicating no limits
            clean_keywords = [
                "good news", "no limits", "free as a bird",
                "kabar baik", "tidak ada batasan", "bebas terbang"
            ]

            is_limited = True
            for kw in clean_keywords:
                if kw in text_lower:
                    is_limited = False
                    break

            account.spam_status = "limited" if is_limited else "normal"
            account.spam_detail = response_msg.text
        else:
            account.spam_status = "unknown"
            account.spam_detail = "Failed to receive response from @SpamBot"

    except Exception as exc:
        logger.error("Error checking spam status for account %s: %s", account.id, exc)
        account.spam_status = "unknown"
        account.spam_detail = f"Error: {str(exc)}"

    account.spam_last_checked_at = datetime.now(timezone.utc)
    await db.flush()
    return account


async def remove_from_expired_folder(db: AsyncSession, account_id: Any, user_id: Any) -> None:
    """Remove account from the 'Expired' folder if it exists for the user."""
    from app.models.account_folder import AccountFolder
    from app.models.account_folder_member import AccountFolderMember
    from sqlalchemy import select, delete
    
    # Find the user's Expired folder
    folder_result = await db.execute(
        select(AccountFolder).where(
            AccountFolder.user_id == user_id,
            AccountFolder.name == "Expired"
        )
    )
    folder = folder_result.scalar_one_or_none()
    if folder:
        # Delete membership from the Expired folder
        await db.execute(
            delete(AccountFolderMember).where(
                AccountFolderMember.folder_id == folder.id,
                AccountFolderMember.account_id == account_id
            )
        )
        await db.flush()


async def move_to_expired_folder(db: AsyncSession, account_id: Any, user_id: Any) -> None:
    """Deactivate account and move it to the 'Expired' folder, removing it from other folders."""
    from app.models.telegram_account import TelegramAccount
    from app.models.account_folder import AccountFolder
    from app.models.account_folder_member import AccountFolderMember
    from sqlalchemy import select, delete, update

    # 1. Deactivate account
    await db.execute(
        update(TelegramAccount)
        .where(TelegramAccount.id == account_id)
        .values(is_active=False)
    )

    # 2. Get or create 'Expired' folder
    folder_result = await db.execute(
        select(AccountFolder).where(
            AccountFolder.user_id == user_id,
            AccountFolder.name == "Expired"
        )
    )
    folder = folder_result.scalar_one_or_none()
    if not folder:
        folder = AccountFolder(user_id=user_id, name="Expired")
        db.add(folder)
        await db.flush()
        await db.refresh(folder)

    # 3. Remove from all other folders
    await db.execute(
        delete(AccountFolderMember).where(
            AccountFolderMember.account_id == account_id
        )
    )

    # 4. Add to 'Expired' folder
    db.add(AccountFolderMember(folder_id=folder.id, account_id=account_id))
    await db.flush()
    logger.info("Account %s marked as expired and moved to 'Expired' folder", account_id)
