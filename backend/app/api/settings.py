"""Privacy and 2FA settings endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.utils.rate_limiter import rate_limiter
from app.schemas.settings import (
    PrivacySettingsResponse,
    PrivacySettingsUpdate,
    TwoFAStatusResponse,
    TwoFAEnableRequest,
    TwoFADisableRequest,
    TwoFAChangePasswordRequest,
    TwoFARequestRecoveryResponse,
    TwoFARecoverRequest,
    TwoFAEmailRequest,
    TwoFAEmailResponse,
    TwoFAEmailConfirmRequest,
    LoginEmailSetRequest,
)
from app.services import account_service, settings_service

router = APIRouter(prefix="/accounts/{account_id}", tags=["settings"])


def _auth(db, user, account_id):
    return account_service.get_account(db, account_id, str(user.id))


# ── Privacy ──────────────────────────────────────────────────────────────────


@router.get("/privacy", response_model=PrivacySettingsResponse)
async def get_privacy(account_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    account = await _auth(db, user, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        result = await settings_service.get_privacy_settings(account)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return PrivacySettingsResponse(**result)


@router.put("/privacy", response_model=PrivacySettingsResponse)
async def update_privacy(
    account_id: str,
    payload: PrivacySettingsUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    account = await _auth(db, user, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    updates = payload.model_dump(exclude_none=True)
    try:
        result = await settings_service.update_privacy_settings(account, updates)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return PrivacySettingsResponse(**result)


@router.post("/sync-contacts", status_code=status.HTTP_204_NO_CONTENT)
async def delete_synced_contacts(
    account_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
):
    account = await _auth(db, user, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        await settings_service.delete_synced_contacts(account)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


# ── 2FA ──────────────────────────────────────────────────────────────────────


@router.get("/2fa", response_model=TwoFAStatusResponse)
async def get_2fa_status(
    account_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
):
    account = await _auth(db, user, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        result = await settings_service.get_2fa_status(account)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    # Sync DB field with live Telegram status so the account card stays accurate
    if result.get("enabled") != account.twofa_enabled:
        account.twofa_enabled = result.get("enabled", False)
        await db.flush()

    return TwoFAStatusResponse(**result)


@router.post("/2fa/enable", status_code=status.HTTP_200_OK)
async def enable_2fa(
    request: Request,
    account_id: str,
    payload: TwoFAEnableRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ip = request.client.host
    if not await rate_limiter.check(f"2fa:ip:{ip}"):
        raise HTTPException(status_code=429, detail="Too many 2FA requests. Please try later.")
    if not await rate_limiter.check(f"2fa:user:{user.id}"):
        raise HTTPException(status_code=429, detail="Too many 2FA requests. Please try later.")
    account = await _auth(db, user, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        await settings_service.enable_2fa(account, payload.password)
        await db.flush()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"message": "2FA enabled"}


@router.post("/2fa/disable", status_code=status.HTTP_200_OK)
async def disable_2fa(
    request: Request,
    account_id: str,
    payload: TwoFADisableRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ip = request.client.host
    if not await rate_limiter.check(f"2fa:ip:{ip}"):
        raise HTTPException(status_code=429, detail="Too many 2FA requests. Please try later.")
    if not await rate_limiter.check(f"2fa:user:{user.id}"):
        raise HTTPException(status_code=429, detail="Too many 2FA requests. Please try later.")
    account = await _auth(db, user, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        await settings_service.disable_2fa(account, payload.password)
        await db.flush()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"message": "2FA disabled"}


@router.post("/2fa/email", response_model=TwoFAEmailResponse)
async def set_2fa_email(
    request: Request,
    account_id: str,
    payload: TwoFAEmailRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ip = request.client.host
    if not await rate_limiter.check(f"2fa:ip:{ip}"):
        raise HTTPException(status_code=429, detail="Too many 2FA requests. Please try later.")
    if not await rate_limiter.check(f"2fa:user:{user.id}"):
        raise HTTPException(status_code=429, detail="Too many 2FA requests. Please try later.")
    account = await _auth(db, user, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        result = await settings_service.set_2fa_email(account, payload.password, payload.email)
        await db.flush()
        return result
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/2fa/email/confirm", status_code=status.HTTP_200_OK)
async def confirm_2fa_email(
    request: Request,
    account_id: str,
    payload: TwoFAEmailConfirmRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ip = request.client.host
    if not await rate_limiter.check(f"2fa:ip:{ip}"):
        raise HTTPException(status_code=429, detail="Too many 2FA requests. Please try later.")
    if not await rate_limiter.check(f"2fa:user:{user.id}"):
        raise HTTPException(status_code=429, detail="Too many 2FA requests. Please try later.")
    account = await _auth(db, user, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        await settings_service.confirm_2fa_email(account, payload.code)
        await db.flush()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"message": "Recovery email confirmed"}


@router.post("/2fa/change-password", status_code=status.HTTP_200_OK)
async def change_2fa_password(
    request: Request,
    account_id: str,
    payload: TwoFAChangePasswordRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ip = request.client.host
    if not await rate_limiter.check(f"2fa:ip:{ip}"):
        raise HTTPException(status_code=429, detail="Too many 2FA requests. Please try later.")
    if not await rate_limiter.check(f"2fa:user:{user.id}"):
        raise HTTPException(status_code=429, detail="Too many 2FA requests. Please try later.")
    account = await _auth(db, user, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        await settings_service.change_2fa_password(account, payload.old_password, payload.new_password)
        await db.flush()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"message": "2FA password changed"}


@router.post("/2fa/request-recovery", response_model=TwoFARequestRecoveryResponse)
async def request_2fa_recovery(
    request: Request,
    account_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ip = request.client.host
    if not await rate_limiter.check(f"2fa:ip:{ip}"):
        raise HTTPException(status_code=429, detail="Too many 2FA requests. Please try later.")
    if not await rate_limiter.check(f"2fa:user:{user.id}"):
        raise HTTPException(status_code=429, detail="Too many 2FA requests. Please try later.")
    account = await _auth(db, user, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        result = await settings_service.request_2fa_recovery(account)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return TwoFARequestRecoveryResponse(**result)


@router.post("/2fa/recover", status_code=status.HTTP_200_OK)
async def recover_2fa(
    request: Request,
    account_id: str,
    payload: TwoFARecoverRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ip = request.client.host
    if not await rate_limiter.check(f"2fa:ip:{ip}"):
        raise HTTPException(status_code=429, detail="Too many 2FA requests. Please try later.")
    if not await rate_limiter.check(f"2fa:user:{user.id}"):
        raise HTTPException(status_code=429, detail="Too many 2FA requests. Please try later.")
    account = await _auth(db, user, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        await settings_service.recover_2fa(account, payload.recovery_code, payload.new_password)
        await db.flush()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"message": "2FA recovered"}


@router.post("/login-email/send-code", status_code=status.HTTP_200_OK)
async def send_login_email_code(
    request: Request,
    account_id: str,
    payload: LoginEmailSetRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ip = request.client.host
    if not await rate_limiter.check(f"2fa:ip:{ip}"):
        raise HTTPException(status_code=429, detail="Too many requests. Please try later.")
    if not await rate_limiter.check(f"2fa:user:{user.id}"):
        raise HTTPException(status_code=429, detail="Too many requests. Please try later.")
    account = await _auth(db, user, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        result = await settings_service.set_login_email(account, payload.email)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return result


class VerifyLoginEmailRequest(LoginEmailSetRequest):
    code: str


@router.post("/login-email/verify", status_code=status.HTTP_200_OK)
async def verify_login_email(
    request: Request,
    account_id: str,
    payload: VerifyLoginEmailRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ip = request.client.host
    if not await rate_limiter.check(f"2fa:ip:{ip}"):
        raise HTTPException(status_code=429, detail="Too many requests. Please try later.")
    if not await rate_limiter.check(f"2fa:user:{user.id}"):
        raise HTTPException(status_code=429, detail="Too many requests. Please try later.")
    account = await _auth(db, user, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        await settings_service.verify_login_email(account, payload.email, payload.code)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"message": "Login email changed"}
