"""API endpoints for Telegram registration date estimation and synchronization."""

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_role
from app.models.user import User
from app.services import account_service
from app.services.telegram_reg_date_service import reg_date_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/telegram-reg-date", tags=["telegram-reg-date"])


class RegDateEstimateResponse(BaseModel):
    """Estimation response for Telegram account registration date."""

    status: str = Field(..., description="Estimation status: exact, estimated, or unknown", examples=["estimated", "exact", "unknown"])
    date: str | None = Field(None, description="ISO-8601 registration date or year-month estimate", examples=["2021-04-12"])
    age: str = Field(..., description="Human-readable account age string", examples=["3 years, 2 months"])


class RegDateSyncResponse(BaseModel):
    """Synchronization response for harvested registration reference datapoints."""

    status: str = Field("success", description="Status string of the sync operation", examples=["success"])
    new_datapoints: int = Field(..., description="Number of new registration reference datapoints harvested into the database", examples=[8])


@router.get(
    "/estimate",
    response_model=RegDateEstimateResponse,
    status_code=status.HTTP_200_OK,
    summary="Estimate registration date of a Telegram ID",
    description=(
        "Calculates the estimated creation/registration date and account age of a Telegram ID "
        "using historical linear interpolation and anchor points from known signups. "
        "Requires 'pro', 'premium', or 'owner' role."
    ),
    responses={
        200: {
            "description": "Estimated registration date and age",
            "model": RegDateEstimateResponse,
        },
        403: {"description": "Permission denied (subscription role required)"},
    },
)
async def estimate_reg_date(
    telegram_id: int = Query(..., description="The Telegram User/Chat ID to estimate"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(["pro", "premium", "owner"])),
) -> RegDateEstimateResponse:
    """Estimate the creation/registration date of a Telegram ID."""
    est = await reg_date_service.get_estimated_registration_date(db, telegram_id)
    if est is None:
        return RegDateEstimateResponse(status="unknown", date=None, age="Unknown")
    return RegDateEstimateResponse(**est)


@router.post(
    "/sync",
    response_model=RegDateSyncResponse,
    status_code=status.HTTP_200_OK,
    summary="Harvest registration date datapoints from account dialogues",
    description=(
        "Scans service notification dialogues (e.g. Telegram service notifications) "
        "of a connected account to harvest exact registration date anchor points. "
        "Requires 'pro', 'premium', or 'owner' role."
    ),
    responses={
        200: {
            "description": "Synchronization summary with count of newly discovered datapoints",
            "model": RegDateSyncResponse,
        },
        400: {"description": "Validation error or invalid account state"},
        403: {"description": "Permission denied (subscription role required)"},
        404: {"description": "Account not found or not owned by user"},
        500: {"description": "Telethon extraction or database failure"},
    },
)
async def sync_reg_dates(
    account_id: str = Query(..., description="The Account UUID to scan dialog signup service messages from"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(["pro", "premium", "owner"])),
) -> RegDateSyncResponse:
    """Scan dialogue history of a connected account to harvest exact registration date datapoints."""
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")

    try:
        count = await reg_date_service.sync_datapoints_from_account(db, account.id, limit=500)
        return RegDateSyncResponse(status="success", new_datapoints=count)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error("Failed to harvest registration date datapoints for account %s: %s", account_id, exc)
        raise HTTPException(status_code=500, detail=f"Sync failed: {str(exc)}")
