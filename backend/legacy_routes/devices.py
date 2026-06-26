"""Devices/sessions routes."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from telethon.tl.functions.account import GetAuthorizationsRequest, ResetAuthorizationRequest

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.schemas.device import DeviceResponse
from app.api.routes.accounts import _get_account, _get_client

router = APIRouter(prefix="/api/accounts/{account_id}/devices", tags=["devices"])


@router.get("", response_model=list[DeviceResponse])
async def list_devices(
    account_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    account = await _get_account(account_id, user, db)
    client = await _get_client(account)
    try:
        result = await client(GetAuthorizationsRequest())
        devices = []
        for auth in result.authorizations:
            devices.append(
                DeviceResponse(
                    hash=str(auth.hash),
                    device_name=getattr(auth, "device_model", "Unknown"),
                    app_name=getattr(auth, "app_name", "Unknown"),
                    app_version=getattr(auth, "app_version", None),
                    platform=getattr(auth, "platform", None),
                    system_version=getattr(auth, "system_version", None),
                    ip=getattr(auth, "ip", None),
                    country=getattr(auth, "country", None),
                    first_login_date=getattr(auth, "date_created", None),
                )
            )
        return devices
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{session_hash}", status_code=204)
async def terminate_device(
    account_id: str,
    session_hash: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    account = await _get_account(account_id, user, db)
    client = await _get_client(account)
    try:
        await client(ResetAuthorizationRequest(hash=int(session_hash)))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
