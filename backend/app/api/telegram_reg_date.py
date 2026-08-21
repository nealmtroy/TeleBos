"""API endpoints for Telegram registration date estimation and synchronization."""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.services import account_service
from app.services.telegram_reg_date_service import reg_date_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/telegram-reg-date", tags=["telegram-reg-date"])


@router.get("/estimate")
async def estimate_reg_date(
    telegram_id: int = Query(..., description="The Telegram User/Chat ID to estimate"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Estimate the creation/registration date of a Telegram ID."""
    est = await reg_date_service.get_estimated_registration_date(db, telegram_id)
    if est is None:
        return {"status": "unknown", "date": None, "age": "Unknown"}
    return est


@router.post("/sync")
async def sync_reg_dates(
    account_id: str = Query(..., description="The Account UUID to scan dialog signup service messages from"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Scan dialogue history of a connected account to harvest exact registration date datapoints."""
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")

    try:
        count = await reg_date_service.sync_datapoints_from_account(db, account.id, limit=500)
        return {"status": "success", "new_datapoints": count}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Sync failed: {str(exc)}")
