"""Device session endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.utils.rate_limiter import rate_limiter
from app.schemas.settings import DeviceInfo, DeviceListResponse
from app.services import account_service, device_service

router = APIRouter(prefix="/accounts/{account_id}/devices", tags=["devices"])


@router.get("", response_model=DeviceListResponse)
async def list_devices(
    account_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        devices = await device_service.get_devices(account)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return DeviceListResponse(devices=[DeviceInfo(**d) for d in devices])


@router.delete("/{device_hash}", status_code=status.HTTP_204_NO_CONTENT)
async def terminate_device(
    request: Request,
    account_id: str,
    device_hash: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ip = request.client.host
    if not await rate_limiter.check(f"device:ip:{ip}"):
        raise HTTPException(status_code=429, detail="Too many device operations. Try later.")
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        await device_service.terminate_device(account, int(device_hash))
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        from app.utils.telegram_errors import classify_telegram_error
        err_type, err_msg = classify_telegram_error(exc)
        if err_type != "unknown":
            raise HTTPException(status_code=400, detail=err_msg)
        raise HTTPException(status_code=400, detail=str(exc))



@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def terminate_all_other_sessions(
    request: Request,
    account_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ip = request.client.host
    if not await rate_limiter.check(f"device:ip:{ip}"):
        raise HTTPException(status_code=429, detail="Too many device operations. Try later.")
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        await device_service.terminate_all_other_sessions(account)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        from app.utils.telegram_errors import classify_telegram_error
        err_type, err_msg = classify_telegram_error(exc)
        if err_type != "unknown":
            raise HTTPException(status_code=400, detail=err_msg)
        raise HTTPException(status_code=400, detail=str(exc))

