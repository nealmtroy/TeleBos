"""Privacy and 2FA settings business logic."""

import logging
import os

from app.models.telegram_account import TelegramAccount
from app.services.telegram_client import client_pool
from app.utils.encryption import decrypt, encrypt

logger = logging.getLogger(__name__)


# ── Privacy ──────────────────────────────────────────────────────────────────

_PRIVACY_KEY_MAP = {
    "last_seen": "status",
    "profile_photo": "profile_photo",
    "bio": "about",
    "phone_number": "phone_number",
}

_PRIVACY_VALUE_MAP = {
    "everybody": 0,
    "contacts": 1,
    "nobody": 2,
}


async def get_privacy_settings(account: TelegramAccount) -> dict:
    """Fetch current privacy settings from Telegram."""
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")

    from telethon.tl.functions.account import GetPrivacyRequest
    from telethon.tl.types import (
        InputPrivacyKeyStatusTimestamp,
        InputPrivacyKeyProfilePhoto,
        InputPrivacyKeyAbout,
        InputPrivacyKeyPhoneNumber,
        InputPrivacyKeyPhoneCall,
        InputPrivacyKeyAddedByPhone,
        InputPrivacyKeyVoiceMessages,
        InputPrivacyKeyChatInvite,
        InputPrivacyKeyForwards,
        InputPrivacyKeyBirthday,
    )

    key_map = {
        "last_seen": InputPrivacyKeyStatusTimestamp,
        "profile_photo": InputPrivacyKeyProfilePhoto,
        "bio": InputPrivacyKeyAbout,
        "phone_number": InputPrivacyKeyPhoneNumber,
        "phone_call": InputPrivacyKeyPhoneCall,
        "added_by_phone": InputPrivacyKeyAddedByPhone,
        "voice_messages": InputPrivacyKeyVoiceMessages,
        "chat_invite": InputPrivacyKeyChatInvite,
        "forwards": InputPrivacyKeyForwards,
        "birthday": InputPrivacyKeyBirthday,
    }

    settings = {}
    for name, key_cls in key_map.items():
        try:
            rules = await client(GetPrivacyRequest(key_cls()))
            rule = rules.rules[0] if rules.rules else None
            settings[name] = _parse_privacy_rule(rule)
        except Exception as exc:
            logger.warning("Failed to get privacy %s: %s", name, exc)
            settings[name] = "everybody"

    try:
        from telethon.tl.functions.contacts import GetContactsRequest
        contacts = await client(GetContactsRequest(0))
        settings["suggest_frequent_contacts"] = True  # default
    except Exception:
        settings["suggest_frequent_contacts"] = True

    return settings


def _parse_privacy_rule(rule) -> str:
    """Convert a Telethon privacy rule to a string value."""
    if rule is None:
        return "everybody"
    from telethon.tl.types import (
        PrivacyValueAllowAll,
        PrivacyValueDisallowAll,
        PrivacyValueAllowContacts,
        PrivacyValueAllowCloseFriends,
    )
    if isinstance(rule, PrivacyValueAllowAll):
        return "everybody"
    if isinstance(rule, PrivacyValueDisallowAll):
        return "nobody"
    if isinstance(rule, PrivacyValueAllowContacts):
        return "contacts"
    if isinstance(rule, PrivacyValueAllowCloseFriends):
        return "close_friends"
    return "everybody"


async def update_privacy_settings(account: TelegramAccount, updates: dict) -> dict:
    """Update privacy settings on Telegram."""
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")

    from telethon.tl.functions.account import SetPrivacyRequest
    from telethon.tl.types import (
        InputPrivacyKeyStatusTimestamp,
        InputPrivacyKeyProfilePhoto,
        InputPrivacyKeyAbout,
        InputPrivacyKeyPhoneNumber,
        InputPrivacyKeyPhoneCall,
        InputPrivacyKeyAddedByPhone,
        InputPrivacyKeyVoiceMessages,
        InputPrivacyKeyChatInvite,
        InputPrivacyKeyForwards,
        InputPrivacyKeyBirthday,
        InputPrivacyValueAllowAll,
        InputPrivacyValueDisallowAll,
        InputPrivacyValueAllowContacts,
        InputPrivacyValueAllowCloseFriends,
    )

    key_map = {
        "last_seen": InputPrivacyKeyStatusTimestamp,
        "profile_photo": InputPrivacyKeyProfilePhoto,
        "bio": InputPrivacyKeyAbout,
        "phone_number": InputPrivacyKeyPhoneNumber,
        "phone_call": InputPrivacyKeyPhoneCall,
        "added_by_phone": InputPrivacyKeyAddedByPhone,
        "voice_messages": InputPrivacyKeyVoiceMessages,
        "chat_invite": InputPrivacyKeyChatInvite,
        "forwards": InputPrivacyKeyForwards,
        "birthday": InputPrivacyKeyBirthday,
    }

    value_map = {
        "everybody": InputPrivacyValueAllowAll(),
        "contacts": InputPrivacyValueAllowContacts(),
        "nobody": InputPrivacyValueDisallowAll(),
        "close_friends": InputPrivacyValueAllowCloseFriends(),
    }

    for name, value in updates.items():
        if name not in key_map or value not in value_map:
            continue
        key = key_map[name]()
        rule_val = value_map[value]
        try:
            await client(SetPrivacyRequest(key, [rule_val]))
        except Exception as exc:
            logger.warning("Failed to set privacy %s: %s", name, exc)

    # Suggest frequent contacts
    if "suggest_frequent_contacts" in updates:
        try:
            from telethon.tl.functions.contacts import ResetSavedRequest
            if not updates["suggest_frequent_contacts"]:
                await client(ResetSavedRequest())
        except Exception as exc:
            logger.warning("Failed to set suggest contacts: %s", exc)

    return await get_privacy_settings(account)


async def delete_synced_contacts(account: TelegramAccount) -> None:
    """Delete all synced Telegram contacts."""
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")

    from telethon.tl.functions.contacts import ResetSavedRequest
    await client(ResetSavedRequest())


# ── 2FA ──────────────────────────────────────────────────────────────────────


async def get_2fa_status(account: TelegramAccount) -> dict:
    """Check if 2FA is enabled and return password-related info."""
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")

    try:
        from telethon.tl.functions.account import GetPasswordRequest
        pwd = await client(GetPasswordRequest())
        return {
            "enabled": pwd.has_password,
            "has_recovery": pwd.has_recovery,
            "hint": pwd.hint or None,
            "login_email_pattern": pwd.login_email_pattern or None,
            "unconfirmed_email_pattern": pwd.email_unconfirmed_pattern or None,
        }
    except Exception:
        return {"enabled": False}


async def enable_2fa(account: TelegramAccount, password: str) -> None:
    """Enable two-factor authentication."""
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")

    await client.edit_2fa(new_password=password)

    # Store encrypted 2FA password
    account.twofa_password = encrypt(password)
    account.twofa_enabled = True
    from sqlalchemy.ext.asyncio import AsyncSession
    # Note: caller must flush


async def disable_2fa(account: TelegramAccount, password: str) -> None:
    """Disable two-factor authentication."""
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")

    await client.edit_2fa(password, new_password=None)

    account.twofa_password = ""
    account.twofa_enabled = False


async def set_2fa_email(
    account: TelegramAccount, password: str, email: str
) -> dict:
    """Set recovery email for 2FA.

    Uses the raw Telethon API for fine-grained control over the
    email confirmation flow. Returns either success or a signal that
    the user must confirm via a code sent to the email.
    """
    from telethon.tl.functions.account import GetPasswordRequest
    from telethon.tl.functions.account import UpdatePasswordSettingsRequest
    from telethon.tl import types
    import telethon.errors

    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")

    pwd = await client(GetPasswordRequest())

    # Compute current password check
    import telethon.password as pwd_mod

    pwd.new_algo.salt1 += os.urandom(32)
    if pwd.has_password:
        if not password:
            raise ValueError("Password is required")
        current_password_check = pwd_mod.compute_check(pwd, password)
    else:
        current_password_check = types.InputCheckPasswordEmpty()

    # Build new settings — we're only changing the email, not the password.
    # We MUST recompute the new_password_hash using the current password,
    # otherwise Telegram interprets b"" as "clear the password" which
    # disables 2FA. The new algo (pwd.new_algo) may differ from the
    # existing one, so we use the new algo + the user-provided password.
    new_password_hash = pwd_mod.compute_digest(pwd.new_algo, password)
    new_settings = types.account.PasswordInputSettings(
        new_algo=pwd.new_algo,
        new_password_hash=new_password_hash,
        hint=pwd.hint or "",
        email=email,
        new_secure_settings=None,
    )

    try:
        await client(
            UpdatePasswordSettingsRequest(
                password=current_password_check, new_settings=new_settings
            )
        )
        return {"message": "Recovery email set", "needs_confirmation": False}
    except telethon.errors.EmailUnconfirmedError as e:
        return {
            "message": "Confirmation code sent to email",
            "needs_confirmation": True,
            "code_length": e.code_length,
        }


async def confirm_2fa_email(account: TelegramAccount, code: str) -> None:
    """Confirm the recovery email with the code sent during set_2fa_email."""
    from telethon.tl.functions.account import ConfirmPasswordEmailRequest

    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")

    await client(ConfirmPasswordEmailRequest(code))


async def change_2fa_password(account: TelegramAccount, old_password: str, new_password: str) -> None:
    """Change the 2FA password."""
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")

    await client.edit_2fa(current_password=old_password, new_password=new_password)

    # Update encrypted stored password
    account.twofa_password = encrypt(new_password)
    # Note: caller must flush


async def request_2fa_recovery(account: TelegramAccount) -> dict:
    """Request 2FA recovery code (sent to the recovery email)."""
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")

    from telethon.tl.functions.account import GetPasswordRequest
    pwd = await client(GetPasswordRequest())

    if not pwd.has_recovery:
        raise RuntimeError("No recovery email is set for this account.")

    from telethon.tl.functions.auth import RequestPasswordRecoveryRequest
    result = await client(RequestPasswordRecoveryRequest())
    return {
        "email_pattern": result.email_pattern,
        "message": "Recovery code sent to your email.",
    }


async def recover_2fa(account: TelegramAccount, recovery_code: str, new_password: str) -> None:
    """Recover 2FA with a recovery code and set a new password."""
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")

    from telethon.tl.functions.auth import RecoverPasswordRequest
    await client(RecoverPasswordRequest(code=recovery_code, new_settings=None))
    # Now set a new password (no current_password since we just recovered)
    await client.edit_2fa(new_password=new_password)

    account.twofa_password = encrypt(new_password)
    account.twofa_enabled = True
    # Note: caller must flush


async def set_login_email(account: TelegramAccount, email: str) -> dict:
    """Set the login email (where OTP codes are sent during login).

    Sends a verification code to the new email. The user must enter
    the code received to confirm the change.
    """
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")

    from telethon.tl.functions.account import SendVerifyEmailCodeRequest
    from telethon.tl.types import EmailVerifyPurposeLoginChange

    purpose = EmailVerifyPurposeLoginChange()
    result = await client(SendVerifyEmailCodeRequest(purpose=purpose, email=email))
    return {
        "email": email,
    }


async def verify_login_email(account: TelegramAccount, email: str, code: str) -> None:
    """Verify a login email change with the code sent by Telegram."""
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")

    from telethon.tl.functions.account import VerifyEmailRequest
    from telethon.tl.types import EmailVerifyPurposeLoginChange, EmailVerificationCode

    purpose = EmailVerifyPurposeLoginChange()
    verification = EmailVerificationCode(code=code)
    await client(VerifyEmailRequest(purpose=purpose, verification=verification))
