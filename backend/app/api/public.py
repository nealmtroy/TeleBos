"""Curated, read-only API for external integrations."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_api_principal, require_api_scope
from app.models.telegram_account import TelegramAccount
from app.models.user import User
import time
from fastapi import Request
from app.api.accounts import _pending_logins
from app.schemas.api_key import PublicAccountResponse, PublicUserResponse
from app.schemas.account import (
    SendCodeRequest,
    SendCodeResponse,
    VerifyCodeRequest,
    VerifyCodeResponse,
    UploadSessionRequest,
)
from app.services import account_service
from app.services.uptimerobot_status import uptimerobot_service
from app.utils.rate_limiter import rate_limiter
from app.utils.sanitize import sanitize_exception

router = APIRouter(
    prefix="/api/public/v1",
    tags=["public-api"],
    responses={401: {"description": "Missing or invalid API key"}},
)


@router.get("/health", summary="Check public API availability")
async def health() -> dict[str, str]:
    return {"status": "ok", "api_version": "v1"}


@router.get("/system/status", summary="Read cached Telegram service status")
async def system_status() -> dict:
    current = await uptimerobot_service.get_status()
    return {
        "overall": current.overall,
        "monitors": [
            {
                "id": monitor.id,
                "name": monitor.friendly_name,
                "status": monitor.status,
                "under_maintenance": monitor.under_maintenance,
            }
            for monitor in current.monitors
        ],
        "fetched_at": current.fetched_at,
    }


@router.get(
    "/me",
    response_model=PublicUserResponse,
    summary="Read the API key owner",
    dependencies=[Depends(require_api_scope("profile:read"))],
)
async def me(user: User = Depends(get_api_principal)) -> User:
    return user


@router.get(
    "/accounts",
    response_model=list[PublicAccountResponse],
    summary="List safe metadata for the API key owner's accounts",
    dependencies=[Depends(require_api_scope("accounts:read"))],
)
async def accounts(
    user: User = Depends(get_api_principal),
    db: AsyncSession = Depends(get_db),
) -> list[TelegramAccount]:
    result = await db.execute(
        select(TelegramAccount)
        .where(TelegramAccount.user_id == user.id)
        .order_by(TelegramAccount.created_at.desc())
    )
    return list(result.scalars().all())


@router.get(
    "/accounts/{account_id}",
    response_model=PublicAccountResponse,
    summary="Read one owned account's safe metadata",
    dependencies=[Depends(require_api_scope("accounts:read"))],
)
async def account(
    account_id: UUID,
    user: User = Depends(get_api_principal),
    db: AsyncSession = Depends(get_db),
) -> TelegramAccount:
    result = await db.execute(
        select(TelegramAccount).where(
            TelegramAccount.id == account_id,
            TelegramAccount.user_id == user.id,
        )
    )
    account = result.scalar_one_or_none()
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")
    return account


@router.post(
    "/accounts/send-code",
    response_model=SendCodeResponse,
    summary="Start Telegram login flow by sending an OTP",
    dependencies=[Depends(require_api_scope("accounts:write"))],
)
async def public_send_code(
    request: Request,
    payload: SendCodeRequest,
    user: User = Depends(get_api_principal),
):
    ip = request.client.host if request.client else "unknown"
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
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))


@router.post(
    "/accounts/verify-code",
    response_model=VerifyCodeResponse,
    summary="Verify OTP code and link Telegram account",
    dependencies=[Depends(require_api_scope("accounts:write"))],
)
async def public_verify_code(
    request: Request,
    payload: VerifyCodeRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_api_principal),
):
    ip = request.client.host if request.client else "unknown"
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
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))
    except Exception as exc:
        phone_map = _pending_logins.get(uid)
        if phone_map:
            phone_map.pop(payload.phone, None)
            if not phone_map:
                del _pending_logins[uid]
        try:
            await client.disconnect()
        except Exception:
            pass
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))

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
    await db.commit()
    await db.refresh(account)

    from app.services.session_manager import session_manager
    await session_manager.attach_and_reconnect(db, account)

    return VerifyCodeResponse(
        account_id=str(account.id),
        phone=account.phone,
        first_name=account.first_name,
        last_name=account.last_name,
        username=account.username,
    )


@router.post(
    "/accounts/upload-session",
    response_model=PublicAccountResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload Telegram session string directly",
    dependencies=[Depends(require_api_scope("accounts:write"))],
)
async def public_upload_session(
    request: Request,
    payload: UploadSessionRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_api_principal),
):
    ip = request.client.host if request.client else "unknown"
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
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Session error: {sanitize_exception(exc)}")

    from app.services.user_account_price_service import resolve_telegram_id_price
    account.sell_price = await resolve_telegram_id_price(db, account)
    await db.commit()
    await db.refresh(account)

    from app.services.session_manager import session_manager
    await session_manager.attach_and_reconnect(db, account)

    return account


@router.post(
    "/accounts/cancel-login",
    summary="Cancel a pending Telegram login flow",
    dependencies=[Depends(require_api_scope("accounts:write"))],
)
async def public_cancel_login(
    payload: SendCodeRequest,
    user: User = Depends(get_api_principal),
):
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
            except Exception as e:
                pass
            return {"message": "Login cancelled"}
    return {"message": "No pending login for this phone"}
