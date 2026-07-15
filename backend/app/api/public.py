"""Curated, read-only API for external integrations."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_api_principal, require_api_scope
from app.models.telegram_account import TelegramAccount
from app.models.user import User
from app.schemas.api_key import PublicAccountResponse, PublicUserResponse
from app.services.uptimerobot_status import uptimerobot_service

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
