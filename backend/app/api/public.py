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
from app.api.accounts import (
    cancel_login as account_cancel_login,
    resend_code as account_resend_code,
    send_code as account_send_code,
    setup_login_email as account_setup_login_email,
    verify_code as account_verify_code,
    verify_setup_login_email as account_verify_setup_login_email,
    verify_twofa as account_verify_twofa,
)
from app.schemas.api_key import PublicAccountResponse, PublicUserResponse
from app.schemas.account import (
    SendCodeRequest,
    SendCodeResponse,
    VerifyCodeRequest,
    VerifyCodeResponse,
    UploadSessionRequest,
    LoginIdRequest,
    SetupLoginEmailRequest,
    VerifySetupLoginEmailRequest,
    VerifyTwoFARequest,
    SetupLoginEmailResponse,
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
    return await account_send_code(request, payload, user)


@router.post(
    "/accounts/resend-code",
    response_model=SendCodeResponse,
    summary="Resend code for a pending Telegram login",
    dependencies=[Depends(require_api_scope("accounts:write"))],
)
async def public_resend_code(request: Request, payload: LoginIdRequest, user: User = Depends(get_api_principal)):
    return await account_resend_code(request, payload, user)


@router.post(
    "/accounts/setup-email",
    response_model=SetupLoginEmailResponse,
    summary="Start required Telegram login-email setup",
    dependencies=[Depends(require_api_scope("accounts:write"))],
)
async def public_setup_email(request: Request, payload: SetupLoginEmailRequest, user: User = Depends(get_api_principal)):
    return await account_setup_login_email(request, payload, user)


@router.post(
    "/accounts/setup-email/verify",
    response_model=SendCodeResponse,
    summary="Verify required Telegram login-email setup",
    dependencies=[Depends(require_api_scope("accounts:write"))],
)
async def public_verify_setup_email(request: Request, payload: VerifySetupLoginEmailRequest, user: User = Depends(get_api_principal)):
    return await account_verify_setup_login_email(request, payload, user)


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
    return await account_verify_code(request, payload, db, user)


@router.post(
    "/accounts/verify-2fa",
    response_model=VerifyCodeResponse,
    summary="Finish pending Telegram login with 2FA password",
    dependencies=[Depends(require_api_scope("accounts:write"))],
)
async def public_verify_twofa(
    request: Request,
    payload: VerifyTwoFARequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_api_principal),
):
    return await account_verify_twofa(request, payload, db, user)


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
    payload: LoginIdRequest,
    user: User = Depends(get_api_principal),
):
    return await account_cancel_login(payload, user)
