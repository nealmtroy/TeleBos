"""Account management routes."""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from telethon import errors as telethon_errors
from telethon.sessions import StringSession
from telethon.tl.functions.account import (
    DeleteAccountRequest,
    GetAuthorizationsRequest,
    GetPrivacyRequest,
    ResetAuthorizationRequest,
    SetPrivacyRequest,
)
from telethon.tl.types import (
    InputPrivacyKeyAbout,
    InputPrivacyKeyPhoneNumber,
    InputPrivacyKeyProfilePhoto,
    InputPrivacyKeyStatusP2P,
    InputPrivacyValueAllowAll,
    InputPrivacyValueAllowContacts,
    InputPrivacyValueDisallowAll,
)

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.redis import redis_client
from app.core.security import decrypt_session_string, encrypt_session_string
from app.core.telethon_pool import telethon_pool
from app.models.telegram_account import TelegramAccount
from app.models.user import User
from app.schemas.account import (
    AccountLoginRequest,
    AccountResponse,
    ImportSessionRequest,
    PrivacySettings,
    TwoFAEmailRequest,
    TwoFAEnableRequest,
    UpdateProfileRequest,
    VerifyCodeRequest,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/accounts", tags=["accounts"])

PRIVACY_MAP = {
    "everybody": lambda: InputPrivacyValueAllowAll(),
    "contacts": lambda: InputPrivacyValueAllowContacts(),
    "nobody": lambda: InputPrivacyValueDisallowAll(),
}

PRIVACY_KEY_MAP = {
    "last_seen": InputPrivacyKeyStatusP2P,
    "profile_photo": InputPrivacyKeyProfilePhoto,
    "bio": InputPrivacyKeyAbout,
    "phone_number": InputPrivacyKeyPhoneNumber,
}


async def _get_account(account_id: str, user: User, db: AsyncSession) -> TelegramAccount:
    result = await db.execute(
        select(TelegramAccount).where(
            TelegramAccount.id == account_id,
            TelegramAccount.user_id == user.id,
        )
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    return account


async def _get_client(account: TelegramAccount) -> "TelegramClient":
    """Get or create a connected Telethon client for an account."""
    return await telethon_pool.get_or_create(
        account_id=account.id,
        session_string=account.session_string,
        phone=account.phone,
    )


# ── Login / Register accounts ──────────────────────────────────────


@router.post("/login", response_model=dict)
async def login_account(body: AccountLoginRequest, user: User = Depends(get_current_user)):
    """Step 1: send code request. Returns account_id and phone_code_hash for step 2."""
    account = TelegramAccount(user_id=user.id, phone=body.phone)
    # Temporary client for code request
    from telethon import TelegramClient as TC

    tmp_client = TC(
        StringSession(),
        settings.telegram_api_id or 2040,
        settings.telegram_api_hash or "b18441a1ff607e10a989891a5462e627",
    )
    await tmp_client.connect()
    try:
        sent = await tmp_client.send_code_request(body.phone)
        phone_code_hash = sent.phone_code_hash
        # Store temp session + hash in Redis
        session_str = StringSession.save(tmp_client.session)
        await redis_client.set_temp(
            f"otp:{user.id}:{body.phone}",
            {"session_string": session_str, "phone_code_hash": phone_code_hash},
            ttl=300,
        )
        return {"message": "Code sent", "phone_code_hash": phone_code_hash}
    finally:
        await tmp_client.disconnect()


@router.post("/verify-code", response_model=AccountResponse)
async def verify_code(body: VerifyCodeRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Step 2: submit OTP code and complete login."""
    # Get account from DB
    account = await _get_account(body.account_id, user, db) if body.account_id else None
    redis_key = f"otp:{user.id}:{account.phone}" if account else None

    # Build client from temp session
    temp_data = await redis_client.get_temp(redis_key) if redis_key else None
    if not temp_data:
        raise HTTPException(status_code=400, detail="Login session expired. Please start login again.")

    from telethon import TelegramClient as TC

    tmp_client = TC(
        StringSession(temp_data["session_string"]),
        settings.telegram_api_id or 2040,
        settings.telegram_api_hash or "b18441a1ff607e10a989891a5462e627",
    )
    await tmp_client.connect()
    try:
        await tmp_client.sign_in(phone=account.phone, code=body.code, phone_code_hash=temp_data["phone_code_hash"])
        saved = StringSession.save(tmp_client.session)
        account.session_string = encrypt_session_string(saved)
        # Fetch profile
        me = await tmp_client.get_me()
        account.first_name = me.first_name or ""
        account.last_name = me.last_name or ""
        account.username = me.username or ""
        account.photo_url = None  # will be fetched later
    except telethon_errors.SessionPasswordNeededError:
        if not body.password:
            raise HTTPException(status_code=400, detail="2FA password required")
        try:
            await tmp_client.sign_in(password=body.password)
            saved = StringSession.save(tmp_client.session)
            account.session_string = encrypt_session_string(saved)
            me = await tmp_client.get_me()
            account.first_name = me.first_name or ""
            account.last_name = me.last_name or ""
            account.username = me.username or ""
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"2FA verification failed: {e}")
    finally:
        await tmp_client.disconnect()
        if redis_key:
            await redis_client.delete_temp(redis_key)

    db.add(account)
    await db.flush()
    return account


@router.post("/import-session", response_model=AccountResponse, status_code=201)
async def import_session(body: ImportSessionRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Import a session string directly."""
    account = TelegramAccount(
        user_id=user.id,
        phone=body.phone,
        session_string=encrypt_session_string(body.session_string),
    )
    db.add(account)
    await db.flush()

    # Verify connection
    try:
        client = await _get_client(account)
        me = await client.get_me()
        account.first_name = me.first_name or ""
        account.last_name = me.last_name or ""
        account.username = me.username or ""
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid session: {e}")

    await db.flush()
    return account


# ── CRUD ────────────────────────────────────────────────────────────


@router.get("", response_model=list[AccountResponse])
async def list_accounts(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(TelegramAccount).where(TelegramAccount.user_id == user.id)
    )
    return result.scalars().all()


@router.get("/{account_id}", response_model=AccountResponse)
async def get_account(account_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await _get_account(account_id, user, db)


@router.put("/{account_id}/profile", response_model=AccountResponse)
async def update_profile(
    account_id: str,
    body: UpdateProfileRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    account = await _get_account(account_id, user, db)
    client = await _get_client(account)

    from telethon.tl.functions.account import UpdateProfileRequest as TGUpdateProfile

    await client(TGUpdateProfile(
        first_name=body.first_name,
        last_name=body.last_name,
        about=body.bio,
    ))
    if body.username is not None:
        from telethon.tl.functions.account import UpdateUsernameRequest
        await client(UpdateUsernameRequest(body.username))

    me = await client.get_me()
    account.first_name = me.first_name or ""
    account.last_name = me.last_name or ""
    account.username = me.username or ""

    # Bio via GetFullUser
    try:
        full = await client(GetFullUserRequest("me"))
        account.bio = getattr(full.full_user, "about", "") or ""
    except Exception:
        pass

    await db.flush()
    return account


@router.delete("/{account_id}", status_code=204)
async def delete_account(account_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    account = await _get_account(account_id, user, db)
    await telethon_pool.disconnect(account_id)
    await db.delete(account)


# ── 2FA ─────────────────────────────────────────────────────────────


@router.get("/{account_id}/2fa-status")
async def get_2fa_status(account_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    account = await _get_account(account_id, user, db)
    client = await _get_client(account)
    try:
        pwd = await client.get_password()
        return {"enabled": pwd.has_password, "has_recovery": bool(pwd.email_unconfirmed_pattern or pwd.has_recovery)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{account_id}/2fa/enable")
async def enable_2fa(account_id: str, body: TwoFAEnableRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    account = await _get_account(account_id, user, db)
    client = await _get_client(account)
    try:
        await client.edit_2fa(new_password=body.password)
        return {"message": "2FA enabled"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{account_id}/2fa/disable")
async def disable_2fa(account_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    account = await _get_account(account_id, user, db)
    client = await _get_client(account)
    try:
        await client.edit_2fa(current_password="", new_password="")
        return {"message": "2FA disabled"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{account_id}/2fa/email")
async def set_2fa_email(account_id: str, body: TwoFAEmailRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    account = await _get_account(account_id, user, db)
    client = await _get_client(account)
    try:
        await client.edit_2fa(email=body.email)
        return {"message": "Recovery email set"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Privacy ─────────────────────────────────────────────────────────


@router.get("/{account_id}/privacy")
async def get_privacy(account_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    account = await _get_account(account_id, user, db)
    client = await _get_client(account)
    result = {}
    for key_name, key_type in PRIVACY_KEY_MAP.items():
        try:
            rules = await client(GetPrivacyRequest(key_type()))
            # Simplified: just check the top-level rule
            if rules.rules:
                rule = rules.rules[0]
                if isinstance(rule, InputPrivacyValueAllowAll):
                    result[key_name] = "everybody"
                elif isinstance(rule, InputPrivacyValueAllowContacts):
                    result[key_name] = "contacts"
                elif isinstance(rule, InputPrivacyValueDisallowAll):
                    result[key_name] = "nobody"
                else:
                    result[key_name] = "custom"
            else:
                result[key_name] = "everybody"
        except Exception:
            result[key_name] = "unknown"
    return result


@router.put("/{account_id}/privacy")
async def update_privacy(
    account_id: str,
    body: PrivacySettings,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    account = await _get_account(account_id, user, db)
    client = await _get_client(account)
    field_map = {
        "last_seen": "last_seen",
        "profile_photo": "profile_photo",
        "bio": "bio",
        "phone_number": "phone_number",
    }
    for field_name, body_key in field_map.items():
        value = getattr(body, body_key, None)
        if value and value in PRIVACY_MAP:
            key_cls = PRIVACY_KEY_MAP[field_name]
            rule = PRIVACY_MAP[value]()
            try:
                await client(SetPrivacyRequest(key_cls(), [rule]))
            except Exception as e:
                logger.warning("Failed to set %s: %s", field_name, e)

    if body.suggest_contacts is not None:
        from telethon.tl.functions.account import SetGlobalPrivacySettingsRequest
        from telethon.tl.types import GlobalPrivacySettings
        await client(SetGlobalPrivacySettingsRequest(
            GlobalPrivacySettings(
                suggest_contacts=body.suggest_contacts,
            )
        ))
    return {"message": "Privacy settings updated"}


# ── Safety ────────────────────────────────────────────────────────────


@router.post("/{account_id}/delete-contacts")
async def delete_synced_contacts(account_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    account = await _get_account(account_id, user, db)
    client = await _get_client(account)
    try:
        from telethon.tl.functions.contacts import DeleteContactsRequest
        contacts = await client.get_contacts()
        if contacts:
            await client(DeleteContactsRequest(id=contacts))
        return {"message": f"Deleted {len(contacts)} synced contacts"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{account_id}/terminate-sessions")
async def terminate_other_sessions(account_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    account = await _get_account(account_id, user, db)
    client = await _get_client(account)
    try:
        # Terminate all other sessions
        auths_result = await client(GetAuthorizationsRequest())
        for auth in auths_result.authorizations:
            await client(ResetAuthorizationRequest(hash=auth.hash))
        return {"message": "All other sessions terminated"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
