"""Telegram account endpoints — login, upload, list, detail, profile."""

import asyncio
import logging
import time
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Request, Query, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, require_role
from app.models.user import User
from app.schemas.account import (
    SendCodeRequest,
    SendCodeResponse,
    VerifyCodeRequest,
    VerifyCodeResponse,
    UploadSessionRequest,
    AccountResponse,
    AccountListResponse,
    ProfileUpdateRequest,
    AutoReplyUpdateRequest,
    BulkAutoReplyUpdateRequest,
    AccountHintRequest,
    AccountHintResponse,
    SpamAppealStartRequest,
    SpamAppealResponse,
    QRInitResponse,
    QRStatusResponse,
    QR2FALoginRequest,
)
from app.schemas.account_stats import AccountStatsResponse
from app.services import account_service
from app.utils.rate_limiter import rate_limiter

logger = logging.getLogger(__name__)


router = APIRouter(prefix="/accounts", tags=["accounts"])

# Temporary in-memory store for OTP login flows: user_id -> phone -> (client, created_at)
_pending_logins: dict[str, dict[str, tuple[object, float]]] = {}

# Temporary in-memory store for QR code login flows: qr_id -> details dict
_pending_qr_logins: dict[str, dict[str, Any]] = {}


async def clean_pending_logins_task():
    """Background task to clean up expired pending logins and disconnect their Telethon clients."""
    from typing import Any
    while True:
        try:
            await asyncio.sleep(60)
            now = time.time()
            # 1. Clean OTP logins
            for uid, phone_map in list(_pending_logins.items()):
                for phone, (client, created_at) in list(phone_map.items()):
                    if now - created_at > 300:  # 5 minutes expiration
                        del phone_map[phone]
                        try:
                            await client.disconnect()
                            logger.info("Disconnected and removed expired pending login for user %s phone %s", uid, phone)
                        except Exception as e:
                            logger.warning("Error disconnecting expired client for %s: %s", phone, e)
                if not phone_map:
                    del _pending_logins[uid]

            # 2. Clean QR logins
            for qrid, details in list(_pending_qr_logins.items()):
                if now - details["created_at"] > 300:  # 5 minutes expiration
                    _pending_qr_logins.pop(qrid, None)
                    client = details.get("client")
                    if client:
                        try:
                            await client.disconnect()
                            logger.info("Disconnected and removed expired QR login %s", qrid)
                        except Exception as e:
                            logger.warning("Error disconnecting expired QR client %s: %s", qrid, e)
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.exception("Error in clean_pending_logins_task: %s", e)


from telethon.errors import SessionPasswordNeededError
from app.services.telegram_client import client_pool
from app.utils.encryption import encrypt
from app.services.account_service import check_account_limit, DuplicateAccountError
from app.models.telegram_account import TelegramAccount
import uuid

async def watch_qr_login(qr_id: str, client: Any, qr_login: Any, user_id: Any):
    """Background task to watch QR code scan state and authorize client."""
    try:
        # This blocks until authorized in the Telegram app
        await qr_login.wait()
        
        # Once scanned successfully:
        from app.database import async_session_factory
        from sqlalchemy import select
        
        async with async_session_factory() as db:
            # 1. Fetch user to verify active session
            result = await db.execute(select(User).where(User.id == user_id))
            user = result.scalar_one_or_none()
            if not user:
                raise ValueError("User not found")
                
            # 2. Get client info
            me = await client.get_me()
            phone = me.phone
            first_name = me.first_name
            last_name = me.last_name
            username = me.username
            
            # 3. Check role limits
            await check_account_limit(db, user)
            
            # 4. Check if account already exists
            acc_result = await db.execute(
                select(TelegramAccount).where(TelegramAccount.phone == phone)
            )
            existing = acc_result.scalar_one_or_none()
            if existing:
                if existing.user_id != user.id:
                    raise DuplicateAccountError("Nomor HP ini sudah digunakan oleh pengguna lain.")
                account = existing
                account.is_active = True
            else:
                account = TelegramAccount(
                    id=uuid.uuid4(),
                    user_id=user.id,
                    phone=phone,
                    is_active=True,
                )
                db.add(account)
                
            account.first_name = first_name
            account.last_name = last_name
            account.username = username
            
            # Encrypt session
            session_str = client.session.save()
            account.session_string = encrypt(session_str)
            
            await db.commit()
            await db.refresh(account)
            
            # Attach and reconnect
            from app.services.session_manager import session_manager
            await session_manager.attach_and_reconnect(db, account)
            
            # Update status to success!
            if qr_id in _pending_qr_logins:
                _pending_qr_logins[qr_id]["status"] = "success"
                _pending_qr_logins[qr_id]["account_id"] = str(account.id)
                
    except SessionPasswordNeededError:
        logger.info("QR Login %s requires 2FA password", qr_id)
        if qr_id in _pending_qr_logins:
            _pending_qr_logins[qr_id]["status"] = "requires_2fa"
    except Exception as exc:
        logger.error("QR Login %s watching failed: %s", qr_id, exc)
        if qr_id in _pending_qr_logins:
            _pending_qr_logins[qr_id]["status"] = "failed"
            _pending_qr_logins[qr_id]["error"] = str(exc)
        try:
            await client.disconnect()
        except Exception:
            pass


@router.post("/qr-login/init", response_model=QRInitResponse)
async def qr_login_init(user: User = Depends(get_current_user)):
    """Initialize a Telegram QR login flow."""
    qr_id = str(uuid.uuid4())
    try:
        # Create unauth client
        client = await client_pool.create_unauth_client()
        
        # Initiate QR login
        qr_login = await client.qr_login()
        expires_at = time.time() + 300  # 5 minutes TTL
        
        _pending_qr_logins[qr_id] = {
            "client": client,
            "qr_login": qr_login,
            "user_id": user.id,
            "created_at": time.time(),
            "status": "pending",
            "account_id": None,
            "error": None,
        }
        
        # Start background task to watch scan
        asyncio.create_task(watch_qr_login(qr_id, client, qr_login, user.id))
        
        return QRInitResponse(
            qr_id=qr_id,
            qr_url=qr_login.url,
            expires_at=expires_at
        )
    except Exception as exc:
        logger.error("Failed to initialize QR login: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/qr-login/status/{qr_id}", response_model=QRStatusResponse)
async def qr_login_status(qr_id: str, user: User = Depends(get_current_user)):
    """Get the current status of a QR login flow."""
    details = _pending_qr_logins.get(qr_id)
    if not details or details["user_id"] != user.id:
        raise HTTPException(status_code=404, detail="QR login session not found or expired")
        
    return QRStatusResponse(
        status=details["status"],
        account_id=details["account_id"],
        error=details["error"]
    )


@router.post("/qr-login/2fa", response_model=QRStatusResponse)
async def qr_login_2fa(
    payload: QR2FALoginRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Finalize QR login by submitting the 2FA password."""
    qr_id = payload.qr_id
    details = _pending_qr_logins.get(qr_id)
    if not details or details["user_id"] != user.id:
        raise HTTPException(status_code=404, detail="QR login session not found or expired")
        
    if details["status"] != "requires_2fa":
        raise HTTPException(status_code=400, detail="2FA password is not required for this session")
        
    client = details["client"]
    try:
        # Submit the 2FA password
        await client.sign_in(password=payload.twofa_password)
        
        # Save to database
        me = await client.get_me()
        phone = me.phone
        first_name = me.first_name
        last_name = me.last_name
        username = me.username
        
        await check_account_limit(db, user)
        
        acc_result = await db.execute(
            select(TelegramAccount).where(TelegramAccount.phone == phone)
        )
        existing = acc_result.scalar_one_or_none()
        if existing:
            if existing.user_id != user.id:
                raise DuplicateAccountError("Nomor HP ini sudah digunakan oleh pengguna lain.")
            account = existing
            account.is_active = True
        else:
            account = TelegramAccount(
                id=uuid.uuid4(),
                user_id=user.id,
                phone=phone,
                is_active=True,
            )
            db.add(account)
            
        account.first_name = first_name
        account.last_name = last_name
        account.username = username
        
        # Encrypt session
        session_str = client.session.save()
        account.session_string = encrypt(session_str)
        
        await db.commit()
        await db.refresh(account)
        
        # Attach and reconnect
        from app.services.session_manager import session_manager
        await session_manager.attach_and_reconnect(db, account)
        
        # Update details status
        details["status"] = "success"
        details["account_id"] = str(account.id)
        
        return QRStatusResponse(
            status="success",
            account_id=str(account.id)
        )
    except Exception as exc:
        logger.error("QR 2FA login failed: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/cancel-login")
async def cancel_login(payload: SendCodeRequest, user: User = Depends(get_current_user)):
    """Cancel a pending OTP login and disconnect the Telethon client."""
    uid = str(user.id)
    phone_map = _pending_logins.get(uid)
    if phone_map:
        entry = phone_map.pop(payload.phone, None)
        if not phone_map:
            del _pending_logins[uid]
        if entry:
            client, _ = entry
            try:
                await client.disconnect()
                logger.info("Cancelled pending login for user %s phone %s", uid, payload.phone)
            except Exception as e:
                logger.warning("Error disconnecting client during cancel for %s: %s", payload.phone, e)
            return {"message": "Login cancelled"}
    return {"message": "No pending login for this phone"}


@router.post("/send-code", response_model=SendCodeResponse)
async def send_code(request: Request, payload: SendCodeRequest, user: User = Depends(get_current_user)):
    ip = request.client.host
    phone = payload.phone
    uid = str(user.id)
    if not await rate_limiter.check(f"send_code:ip:{ip}") or not await rate_limiter.check(f"send_code:phone:{phone}"):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many verification attempts. Please try again later.",
        )
    try:
        client, phone_code_hash, timeout, next_action, email_pattern = await account_service.start_login(payload.phone)
        _pending_logins.setdefault(uid, {})[payload.phone] = (client, time.time())
        return SendCodeResponse(
            phone_code_hash=phone_code_hash,
            timeout=timeout,
            next_action=next_action,
            email_pattern=email_pattern
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/verify-code", response_model=VerifyCodeResponse)
async def verify_code(
    request: Request,
    payload: VerifyCodeRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ip = request.client.host
    if not await rate_limiter.check(f"verify_code:ip:{ip}") or not await rate_limiter.check(f"verify_code:phone:{payload.phone}"):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many verification attempts. Please try again later.",
        )

    uid = str(user.id)
    phone_map = _pending_logins.get(uid)
    if phone_map is None or payload.phone not in phone_map:
        raise HTTPException(status_code=400, detail="No pending login for this phone")
    client, _ = phone_map[payload.phone]

    try:
        account, requires_2fa, v2l_hint = await account_service.verify_code(
            client, payload.phone, payload.code, payload.phone_code_hash, payload.twofa_password,
            db=db, user=user,
        )
    except ValueError as exc:
        # Retryable: wrong/expired code — keep pending login alive so user can retry
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        # Fatal error — discard pending login
        phone_map = _pending_logins.get(uid)
        if phone_map:
            phone_map.pop(payload.phone, None)
            if not phone_map:
                del _pending_logins[uid]
        try:
            await client.disconnect()
        except Exception:
            pass
        raise HTTPException(status_code=400, detail=str(exc))

    if requires_2fa:
        return VerifyCodeResponse(
            account_id="",
            phone=payload.phone,
            first_name=None,
            last_name=None,
            username=None,
            requires_2fa=True,
            v2l_hint=v2l_hint,
        )

    # Login flow finished (either success or fallback fail) - clean up
    phone_map = _pending_logins.get(uid)
    if phone_map:
        phone_map.pop(payload.phone, None)
        if not phone_map:
            del _pending_logins[uid]
    try:
        await client.disconnect()
    except Exception:
        pass

    if account is None:
        raise HTTPException(status_code=400, detail="Login failed")

    account.user_id = user.id
    db.add(account)
    await db.flush()

    # Attach real-time event handlers and trigger background synchronization
    from app.services.session_manager import session_manager
    await session_manager.attach_and_reconnect(db, account)

    return VerifyCodeResponse(
        account_id=str(account.id),
        phone=account.phone,
        first_name=account.first_name,
        last_name=account.last_name,
        username=account.username,
    )



@router.post("/upload-session", response_model=AccountResponse, status_code=status.HTTP_201_CREATED)
async def upload_session(
    request: Request,
    payload: UploadSessionRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ip = request.client.host
    if not await rate_limiter.check(f"upload_session:ip:{ip}"):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many session upload attempts. Please try again later.",
        )
    try:
        account = await account_service.login_with_session(
            db, user, payload.session_string
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Session error: {exc}")

    # Attach real-time event handlers and trigger background synchronization
    from app.services.session_manager import session_manager
    await session_manager.attach_and_reconnect(db, account)

    from app.services.user_account_price_service import resolve_telegram_id_price
    account.sell_price = await resolve_telegram_id_price(db, account)
    return account


@router.get("", response_model=AccountListResponse)
async def list_accounts(
    folder_id: str | None = Query(None),
    page: int | None = Query(None),
    limit: int | None = Query(None),
    search: str | None = Query(None),
    status: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from app.services.user_account_price_service import resolve_prices_for_accounts

    if page is not None or limit is not None or search is not None or status is not None:
        p = page or 1
        lim = limit or 10
        accounts, total = await account_service.get_accounts_paginated(
            db, user, page=p, limit=lim, search=search, folder_id=folder_id, status=status
        )
        import math
        pages = math.ceil(total / lim) if lim > 0 else 0
        
        await resolve_prices_for_accounts(db, accounts)
        
        return AccountListResponse(
            accounts=accounts,
            total=total,
            page=p,
            pages=pages,
            limit=lim
        )
    else:
        if folder_id:
            accounts = await account_service.get_accounts_in_folder(db, user, folder_id)
        else:
            accounts = await account_service.get_accounts_for_user(db, user)
            
        await resolve_prices_for_accounts(db, accounts)
        
        return AccountListResponse(
            accounts=accounts,
            total=len(accounts),
            page=1,
            pages=1,
            limit=len(accounts)
        )


@router.get("/{account_id}", response_model=AccountResponse)
async def get_account(
    account_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    account = await account_service.get_account(db, account_id, str(user.id), allow_for_sale=True)
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    from app.services.user_account_price_service import resolve_telegram_id_price
    account.sell_price = await resolve_telegram_id_price(db, account)
    return account


@router.put("/{account_id}/profile", response_model=AccountResponse)
async def update_profile(
    request: Request,
    account_id: str,
    payload: ProfileUpdateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ip = request.client.host
    if not await rate_limiter.check(f"profile:ip:{ip}"):
        raise HTTPException(status_code=429, detail="Too many profile update requests. Try later.")
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")

    try:
        account = await account_service.update_profile(
            db, account, payload.first_name, payload.last_name,
            payload.username, payload.bio,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    from app.services.user_account_price_service import resolve_telegram_id_price
    account.sell_price = await resolve_telegram_id_price(db, account)
    return account


@router.put("/{account_id}/auto-reply", response_model=AccountResponse)
async def update_auto_reply(
    request: Request,
    account_id: str,
    payload: AutoReplyUpdateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(["pro", "premium", "owner"])),
):
    """Enable/disable auto-reply and set the reply text for this account."""
    ip = request.client.host
    if not await rate_limiter.check(f"autoreply:ip:{ip}"):
        raise HTTPException(status_code=429, detail="Too many requests. Try later.")
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")

    account.auto_reply_enabled = payload.auto_reply_enabled
    account.auto_reply_text = payload.auto_reply_text or None
    await db.flush()
    from app.services.user_account_price_service import resolve_telegram_id_price
    account.sell_price = await resolve_telegram_id_price(db, account)
    return account


@router.post("/auto-reply/bulk")
async def bulk_update_auto_reply(
    request: Request,
    payload: BulkAutoReplyUpdateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(["pro", "premium", "owner"])),
):
    """Enable/disable auto-reply for multiple accounts at once."""
    ip = request.client.host
    if not await rate_limiter.check(f"autoreply:ip:{ip}"):
        raise HTTPException(status_code=429, detail="Too many requests. Try later.")
    from sqlalchemy import select
    from app.models.telegram_account import TelegramAccount

    result = await db.execute(
        select(TelegramAccount).where(
            TelegramAccount.id.in_(payload.account_ids),
            TelegramAccount.user_id == user.id,
            TelegramAccount.for_sale == False,
        )
    )
    accounts = result.scalars().all()

    updated = 0
    for account in accounts:
        if account.user_id != user.id:
            continue
        account.auto_reply_enabled = payload.auto_reply_enabled
        account.auto_reply_text = payload.auto_reply_text or None
        updated += 1

    await db.flush()
    return {"updated": updated, "total": len(payload.account_ids)}


@router.post("/{account_id}/photo")
async def upload_profile_photo(
    request: Request,
    account_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ip = request.client.host if request.client else "unknown"
    if not await rate_limiter.check(f"photo_upload:ip:{ip}", max_requests=10, window_seconds=60):
        raise HTTPException(status_code=429, detail="Too many photo requests. Try later.")
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    if file.content_type is None or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    data = await file.read()
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (max 5MB)")

    from PIL import Image
    import io
    try:
        Image.open(io.BytesIO(data)).verify()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image content")

    try:
        await account_service.upload_photo(db, account, data)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"message": "Photo updated"}


@router.get("/{account_id}/photo")
async def get_profile_photo(
    request: Request,
    account_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get the account's profile photo.

    Public endpoint — Telegram profile photos are public data.
    Protected by per-IP rate limiting and browser
    caching (Cache-Control: 1 hour, ETag based on photo_version)
    to prevent abuse.
    """
    # Per-IP rate limiting
    from app.config import get_settings
    s = get_settings()
    ip = request.client.host if request.client else "unknown"
    if not await rate_limiter.check(
        f"photo_get:ip:{ip}",
        max_requests=s.RATE_LIMIT_PHOTO_MAX,
        window_seconds=s.RATE_LIMIT_PHOTO_WINDOW
    ):
        raise HTTPException(status_code=429, detail="Too many requests")

    from app.models.telegram_account import TelegramAccount
    from sqlalchemy import select
    result = await db.execute(
        select(TelegramAccount).where(
            TelegramAccount.id == account_id,
        )
    )
    account = result.scalar_one_or_none()
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")

    # Build ETag from photo_version so URL doesn't need cache-busting
    etag = f'W/"{account.id}-{account.photo_version}"'

    # If-None-Match — client already has the latest version
    if_none_match = request.headers.get("If-None-Match")
    if if_none_match and if_none_match.strip('" ') == etag.strip("W/").strip('" '):
        return Response(status_code=304)

    # Check local cache
    cached = await account_service.get_cached_photo_path(str(account.id))
    if cached:
        with open(cached, "rb") as f:
            return Response(
                content=f.read(),
                media_type="image/jpeg",
                headers={
                    "Cache-Control": "public, max-age=3600",
                    "ETag": etag,
                    "Expires": time.strftime("%a, %d %b %Y %H:%M:%S GMT", time.gmtime(time.time() + 3600)),
                },
            )

    # Try to download from Telegram and cache
    data = await account_service.download_and_cache_photo(account)
    if data:
        # Re-read photo_version after cache (it may have been 0 before)
        await db.refresh(account)
        etag = f'W/"{account.id}-{account.photo_version}"'
        return Response(
            content=data,
            media_type="image/jpeg",
            headers={
                "Cache-Control": "public, max-age=3600",
                "ETag": etag,
                "Expires": time.strftime("%a, %d %b %Y %H:%M:%S GMT", time.gmtime(time.time() + 3600)),
            },
        )

    raise HTTPException(status_code=404, detail="No profile photo")


@router.get("/{account_id}/photo-token")
async def get_profile_photo_token(
    account_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get a short-lived signed token for accessing a profile photo.

    Use the returned ``st`` value as the ``?st=`` query parameter on the
    ``GET /{account_id}/photo`` endpoint.  The token expires after 5 minutes
    and avoids placing the full JWT in the URL.
    """
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")

    from app.utils.signed_url import generate_photo_token
    st = generate_photo_token(account_id, str(user.id))
    return {"st": st, "expires_in": 300}


@router.delete("/{account_id}/photo")
async def delete_profile_photo(
    account_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Delete the account's profile photo from Telegram and remove local cache."""
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")

    try:
        await account_service.delete_photo(db, account)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"message": "Photo deleted"}


@router.post("/{account_id}/check-spam", response_model=AccountResponse)
async def check_spam(
    account_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")

    try:
        await account_service.check_spam_status(db, account)
        await db.commit()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    from app.services.user_account_price_service import resolve_telegram_id_price
    account.sell_price = await resolve_telegram_id_price(db, account)
    return account


@router.get("/{account_id}/stats", response_model=AccountStatsResponse)
async def get_account_stats(
    account_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get aggregate stats for an account: contacts, groups, channels.

    Returns cached values from the database, refreshed daily by a background
    task.  Force a manual refresh via ``POST …/stats/refresh``.
    """
    account = await account_service.get_account(db, account_id, str(user.id), allow_for_sale=True)
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")

    return AccountStatsResponse(
        contacts_count=account.contacts_count,
        total_groups=account.total_groups,
        owned_groups=account.owned_groups,
        total_channels=account.total_channels,
        owned_channels=account.owned_channels,
        stats_updated_at=account.stats_updated_at,
    )


@router.post("/{account_id}/stats/refresh", response_model=AccountStatsResponse)
async def refresh_account_stats(
    request: Request,
    account_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Force a manual refresh of the cached dialog statistics for an account."""
    ip = request.client.host
    if not await rate_limiter.check(f"stats:ip:{ip}"):
        raise HTTPException(status_code=429, detail="Too many requests. Try later.")
    from app.services.stats_service import refresh_account_stats as _refresh

    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")

    try:
        await _refresh(db, account)
        await db.commit()
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return AccountStatsResponse(
        contacts_count=account.contacts_count,
        total_groups=account.total_groups,
        owned_groups=account.owned_groups,
        total_channels=account.total_channels,
        owned_channels=account.owned_channels,
        stats_updated_at=account.stats_updated_at,
    )


@router.delete("/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(
    request: Request,
    account_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ip = request.client.host
    if not await rate_limiter.check(f"account_delete:ip:{ip}"):
        raise HTTPException(status_code=429, detail="Too many requests. Try later.")
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    await account_service.remove_account(db, account)


@router.post("/{account_id}/appeal/start", response_model=SpamAppealResponse)
async def start_appeal(
    account_id: str,
    payload: SpamAppealStartRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")

    from app.utils.encryption import decrypt
    from app.services.telegram_client import client_pool
    from app.services.appeal_service import start_spam_appeal
    from datetime import datetime, timezone

    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise HTTPException(status_code=400, detail="Account is disconnected. Please re-login.")

    try:
        res = await start_spam_appeal(client, payload.reason, payload.preset_id, payload.force)
        if res["status"] == "completed":
            from app.utils.spambot_helper import is_clean_status
            account.spam_status = "limited" if not is_clean_status(res["message"]) else "normal"
            account.spam_detail = res["message"]
            account.spam_last_checked_at = datetime.now(timezone.utc)
            await db.commit()
        return res
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/{account_id}/appeal/resume", response_model=SpamAppealResponse)
async def resume_appeal(
    account_id: str,
    payload: SpamAppealStartRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")

    from app.utils.encryption import decrypt
    from app.services.telegram_client import client_pool
    from app.services.appeal_service import resume_spam_appeal
    from datetime import datetime, timezone

    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise HTTPException(status_code=400, detail="Account is disconnected. Please re-login.")

    try:
        res = await resume_spam_appeal(client, payload.reason)
        if res["status"] == "completed":
            from app.utils.spambot_helper import is_clean_status
            account.spam_status = "limited" if not is_clean_status(res["message"]) else "normal"
            account.spam_detail = res["message"]
            account.spam_last_checked_at = datetime.now(timezone.utc)
            await db.commit()
        return res
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))

