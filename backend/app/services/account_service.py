"""Account management business logic — login, logout, profile."""

import logging
import os
from dataclasses import dataclass
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
from app.services.twofa_service import get_live_2fa_status

class DuplicateAccountError(Exception):
    """Raised when trying to add a Telegram account that already exists in the system.

    Carries a user-facing message: ``sanitize_exception`` passes it through
    verbatim (no traceback logged) instead of masking it as an unexpected error.
    """
    user_facing = True


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
    client = await client_pool.create_unauth_client(phone)
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


@dataclass(frozen=True)
class LoginStartResult:
    client: Any
    phone_code_hash: str
    sent_code: dict[str, Any]


def _type_name(value: Any) -> str | None:
    if value is None:
        return None
    name = type(value).__name__.removeprefix("SentCodeType").removeprefix("CodeType")
    return name.replace("Sms", "sms_").replace("Email", "email_").replace("Fragment", "fragment_").replace("Firebase", "firebase_").replace("Missed", "missed_").replace("Flash", "flash_").replace("App", "app").lower().strip("_") or "unknown"


def sent_code_metadata(result: Any) -> dict[str, Any]:
    """Normalize public, server-selected auth.SentCode metadata for the UI."""
    sent_type = getattr(result, "type", None)
    delivery_type = _type_name(sent_type)
    is_setup = type(sent_type).__name__ == "SentCodeTypeSetUpEmailRequired"
    length = getattr(sent_type, "length", None)
    pattern = getattr(sent_type, "pattern", None)
    input_mode = "numeric"
    if delivery_type in {"sms_word", "sms_phrase"}:
        input_mode = "alphabetic"
    elif pattern:
        input_mode = "pattern"
    elif delivery_type == "email_code":
        input_mode = "alphanumeric"

    return {
        "stage": "setup_email" if is_setup else "enter_code",
        "delivery_type": delivery_type,
        "next_delivery_type": _type_name(getattr(result, "next_type", None)),
        "timeout": getattr(result, "timeout", None),
        "code_length": length,
        "input_mode": input_mode if length or pattern else None,
        "input_pattern": pattern,
        "email_pattern": getattr(sent_type, "email_pattern", None),
        "reset_available_period": getattr(sent_type, "reset_available_period", None),
        "reset_pending_date": getattr(sent_type, "reset_pending_date", None),
        "setup_url": getattr(sent_type, "url", None) if is_setup else None,
        "google_signin_allowed": bool(getattr(sent_type, "google_signin_allowed", False)),
        "apple_signin_allowed": bool(getattr(sent_type, "apple_signin_allowed", False)),
    }


async def start_login(phone: str) -> LoginStartResult:
    """Create an unauthenticated client and ask Telegram to select delivery."""
    client = await client_pool.create_unauth_client(phone)
    try:
        result = await client.send_code_request(phone)
        return LoginStartResult(
            client=client,
            phone_code_hash=result.phone_code_hash,
            sent_code=sent_code_metadata(result),
        )
    except Exception:
        try:
            await client.disconnect()
        except Exception:
            pass
        raise


async def resend_login_code(client: Any, phone: str, phone_code_hash: str) -> tuple[str, dict[str, Any]]:
    """Ask Telegram to progress the current server-authoritative login flow."""
    from telethon.tl.functions.auth import ResendCodeRequest

    result = await client(ResendCodeRequest(phone_number=phone, phone_code_hash=phone_code_hash))
    return result.phone_code_hash, sent_code_metadata(result)


async def send_login_setup_email(client: Any, phone: str, phone_code_hash: str, email: str) -> dict[str, Any]:
    """Send a login-email setup confirmation using the pending phone login."""
    from telethon.tl.functions.account import SendVerifyEmailCodeRequest
    from telethon.tl.types import EmailVerifyPurposeLoginSetup

    result = await client(SendVerifyEmailCodeRequest(
        purpose=EmailVerifyPurposeLoginSetup(phone_number=phone, phone_code_hash=phone_code_hash),
        email=email,
    ))
    return {
        "stage": "setup_email_code",
        "email_pattern": getattr(result, "email_pattern", None),
        "code_length": getattr(result, "length", None),
        "timeout": getattr(result, "timeout", None),
        "input_mode": "alphanumeric",
    }


async def verify_login_setup_email(client: Any, phone: str, phone_code_hash: str, code: str) -> tuple[str, dict[str, Any]]:
    """Verify login-email setup and return Telegram's next auth.SentCode."""
    from telethon.tl.functions.account import VerifyEmailRequest
    from telethon.tl.types import EmailVerificationCode, EmailVerifyPurposeLoginSetup

    verified = await client(VerifyEmailRequest(
        purpose=EmailVerifyPurposeLoginSetup(phone_number=phone, phone_code_hash=phone_code_hash),
        verification=EmailVerificationCode(code=code),
    ))
    sent_code = getattr(verified, "sent_code", None)
    if sent_code is None:
        raise RuntimeError("Telegram did not return a login code after email verification.")
    return sent_code.phone_code_hash, sent_code_metadata(sent_code)


def validate_login_code(code: str, metadata: dict[str, Any]) -> None:
    expected_length = metadata.get("code_length")
    if expected_length is not None and len(code) != expected_length:
        raise ValueError("Panjang kode verifikasi tidak sesuai.")
    mode = metadata.get("input_mode")
    if mode == "numeric" and not code.isdigit():
        raise ValueError("Kode verifikasi harus berupa angka.")
    if mode == "alphabetic" and not code.isalpha():
        raise ValueError("Kode verifikasi harus berupa huruf.")
    if len(code) > 64:
        raise ValueError("Kode verifikasi tidak valid.")


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

    return await finalize_authenticated_login(unauth_client, phone, twofa_password, db, user)


async def verify_twofa(
    unauth_client: Any,
    phone: str,
    twofa_password: str,
    db: AsyncSession | None = None,
    user: User | None = None,
) -> tuple[TelegramAccount | None, bool, str | None]:
    """Finish a pending login after Telegram requested a 2FA password."""
    try:
        await unauth_client.sign_in(password=twofa_password)
    except Exception as exc:
        from telethon.errors import PasswordHashInvalidError
        if isinstance(exc, PasswordHashInvalidError) or "PASSWORD_HASH_INVALID" in str(exc):
            raise ValueError("Password V2L/2FA salah. Silakan coba lagi.") from exc
        raise
    return await finalize_authenticated_login(unauth_client, phone, twofa_password, db, user)


async def finalize_authenticated_login(
    unauth_client: Any,
    phone: str,
    twofa_password: str | None = None,
    db: AsyncSession | None = None,
    user: User | None = None,
) -> tuple[TelegramAccount | None, bool, str | None]:
    """Persist an already-authorized unauthenticated client as a TeleBos account."""
    session_string = ""
    if isinstance(unauth_client.session, type(unauth_client.session)):
        session_string = unauth_client.session.save()

    me = await unauth_client.get_me()
    if not me or not me.id:
        raise ValueError("Gagal mengambil informasi profil Telegram.")

    # A failed lookup is unknown, not evidence that 2FA is disabled.
    live_twofa_status = await get_live_2fa_status(unauth_client)

    if db is not None and me.id:
        existing = await db.execute(
            select(TelegramAccount).where(TelegramAccount.telegram_id == me.id)
        )
        existing_acc = existing.scalar_one_or_none()
        if existing_acc:
            if existing_acc.for_sale:
                raise DuplicateAccountError(
                    "Akun Telegram ini sedang dijual di marketplace dan tidak dapat disambungkan kembali."
                )
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
                existing_acc.phone_verified = True
                if live_twofa_status is not None:
                    existing_acc.twofa_enabled = live_twofa_status["enabled"]
                if twofa_password:
                    existing_acc.twofa_password = encrypt(twofa_password)
                existing_acc.is_active = True
                existing_acc.for_sale = False
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
        twofa_enabled=live_twofa_status["enabled"] if live_twofa_status is not None else False,
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
    import asyncio
    try:
        await asyncio.wait_for(test_client.connect(), timeout=15.0)
    except asyncio.TimeoutError:
        raise ValueError("Koneksi ke server Telegram timeout. Silakan periksa jaringan internet server atau IP proxy.")
    try:
        if not await test_client.is_user_authorized():
            raise ValueError("Session string is invalid or expired")
        me = await test_client.get_me()
        live_twofa_status = await get_live_2fa_status(test_client)
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
            if existing_acc.for_sale:
                raise ValueError(
                    f"Akun Telegram (ID: {me.id}) sedang dijual di marketplace dan tidak dapat disambungkan kembali."
                )
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
                existing_acc.phone_verified = True
                if live_twofa_status is not None:
                    existing_acc.twofa_enabled = live_twofa_status["enabled"]
                existing_acc.is_active = True
                existing_acc.for_sale = False
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
        twofa_enabled=live_twofa_status["enabled"] if live_twofa_status is not None else False,
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
        .where(
            TelegramAccount.user_id == user.id,
            TelegramAccount.for_sale == False,
        )
        .order_by(TelegramAccount.created_at.desc())
    )
    return list(result.scalars().all())


async def get_accounts_paginated(
    db: AsyncSession,
    user: User,
    page: int = 1,
    limit: int = 12,
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
        .where(
            TelegramAccount.user_id == user.id,
        )
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
                TelegramAccount.for_sale == False,
                or_(
                    TelegramAccount.spam_status != "limited",
                    TelegramAccount.spam_status.is_(None)
                )
            )
        elif status == "limited":
            query = query.where(
                TelegramAccount.is_active == True,
                TelegramAccount.for_sale == False,
                TelegramAccount.spam_status == "limited"
            )
        elif status == "inactive":
            query = query.where(TelegramAccount.for_sale == True)
        elif status == "expired":
            query = query.where(
                TelegramAccount.is_active == False,
                TelegramAccount.for_sale == False
            )

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
            TelegramAccount.for_sale == False,
        )
        .order_by(TelegramAccount.created_at.desc())
    )
    return list(result.scalars().all())


async def get_account(
    db: AsyncSession, account_id: str, user_id: str, allow_for_sale: bool = False
) -> TelegramAccount | None:
    query = (
        select(TelegramAccount)
        .options(selectinload(TelegramAccount.folders))
        .where(
            TelegramAccount.id == account_id,
            TelegramAccount.user_id == user_id,
        )
    )
    if not allow_for_sale:
        query = query.where(TelegramAccount.for_sale == False)

    result = await db.execute(query)
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
                photo = getattr(me, "photo", None)
                account.profile_photo_id = getattr(photo, "photo_id", None) if photo else None
            else:
                account.profile_photo_path = None
                account.profile_photo_id = None
        else:
            account.profile_photo_path = None
            account.profile_photo_id = None
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
    account.profile_photo_id = None
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


from app.utils.photo_helper import (
    ensure_photo_dir as _ensure_photo_dir,
    get_photo_path as _photo_path,
)


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
        # 1. Send /start to @SpamBot using conversation API
        response_msg = None
        try:
            async with client.conversation("SpamBot") as conv:
                try:
                    await conv.send_message("/start")
                except Exception as e:
                    from telethon.errors import YouBlockedUserError
                    if isinstance(e, YouBlockedUserError) or "you blocked this user" in str(e).lower():
                        logger.info("SpamBot is blocked for account %s. Unblocking...", account.phone)
                        from telethon import functions
                        try:
                            await client(functions.contacts.UnblockRequest(id="SpamBot"))
                            await conv.send_message("/start")
                        except Exception as unblock_err:
                            logger.error("Failed to unblock SpamBot for account %s: %s", account.phone, unblock_err)
                            raise e
                    else:
                        raise e
                response_msg = await conv.get_response(timeout=10)
        except Exception as conv_exc:
            logger.error("Conversation with SpamBot failed for account %s: %s", account.phone, conv_exc)
            
        # Fallback to the latest incoming message if conversation fails or returns no response
        if not response_msg:
            logger.info("SpamBot conversation returned no response for %s, falling back to get_messages...", account.phone)
            messages = await client.get_messages("SpamBot", limit=5)
            for msg in messages:
                if not msg.out:
                    response_msg = msg
                    break

        if response_msg and response_msg.text:
            from app.utils.spambot_helper import is_clean_status, is_temporary_limit

            is_limited = not is_clean_status(response_msg.text)
            account.spam_status = "limited" if is_limited else "normal"
            account.spam_detail = response_msg.text

            # --- AUTO APPEAL LOGIC FOR PERMANENT LIMIT ---
            if is_limited:
                from app.services.appeal_service import has_submitted_appeal_recently, start_spam_appeal
                if not is_temporary_limit(response_msg.text):
                    logger.info("Account %s has a permanent limit. Checking if we can auto-appeal...", account.phone)
                    try:
                        recent_appeal = await has_submitted_appeal_recently(client, hours=24)
                        if not recent_appeal:
                            logger.info("No recent appeal in the last 24h for %s. Submitting auto-appeal...", account.phone)
                            res = await start_spam_appeal(client, reason="", preset_id="ai_indonesian", force=True)
                            if res["status"] == "completed":
                                logger.info("Auto-appeal completed successfully for %s", account.phone)
                                account.spam_detail = res["message"]
                                # Re-check if new message means normal status
                                account.spam_status = "limited" if not is_clean_status(res["message"]) else "normal"
                            elif res["status"] == "captcha_required":
                                logger.info("Auto-appeal for %s requires captcha. Waiting for manual user action.", account.phone)
                                account.spam_detail = f"Auto-appeal initiated but requires captcha: {res.get('captcha_url', '')}"
                            else:
                                logger.warning("Auto-appeal for %s returned status: %s", account.phone, res["status"])
                        else:
                            logger.info("An appeal was already submitted in the last 24h for %s. Skipping auto-appeal.", account.phone)
                    except Exception as appeal_exc:
                        logger.error("Failed to execute auto-appeal for %s: %s", account.phone, appeal_exc)
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
    """Deactivate account when its session expires (no longer moving it to an 'Expired' folder)."""
    from app.models.telegram_account import TelegramAccount
    from sqlalchemy import update

    # Deactivate account
    await db.execute(
        update(TelegramAccount)
        .where(TelegramAccount.id == account_id)
        .values(is_active=False)
    )
    await db.flush()
    logger.info("Account %s marked as inactive due to expired session", account_id)


async def get_profile_colors(account: TelegramAccount) -> dict:
    """Retrieve the set of accent color palettes available for profile backgrounds."""
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")

    from telethon.tl.functions.help import GetPeerProfileColorsRequest
    from telethon.tl.types.help import PeerColors

    result = await client(GetPeerProfileColorsRequest(hash=0))

    colors_list = []
    if isinstance(result, PeerColors):
        for option in result.colors:
            colors_list.append({
                "color_id": option.color_id,
                "hidden": option.hidden or False,
                "channel_min_level": option.channel_min_level,
                "group_min_level": option.group_min_level,
                "colors": getattr(option.colors, "colors", []) if option.colors else [],
                "dark_colors": getattr(option.dark_colors, "colors", []) if option.dark_colors else [],
            })
    return {
        "hash": getattr(result, "hash", 0),
        "colors": colors_list
    }


async def update_profile_color(
    account: TelegramAccount,
    color_id: int,
    background_emoji_id: int | None = None
) -> None:
    """Update profile accent color palette and background pattern on Telegram."""
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")

    from telethon.tl.functions.account import UpdateColorRequest
    from telethon.tl.types import PeerColor

    await client(UpdateColorRequest(
        for_profile=True,
        color=PeerColor(
            color=color_id,
            background_emoji_id=background_emoji_id
        )
    ))
