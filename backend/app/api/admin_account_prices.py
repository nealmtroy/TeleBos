"""Admin API endpoints for managing per-user account sell prices."""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.user_account_price import (
    UserAccountPriceResponse,
    UserAccountPriceUpdate,
    UserAccountPriceBulkUpdate,
)
from app.services import user_account_price_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin/account-prices", tags=["admin"])


async def _require_owner(current_user: User = Depends(get_current_user)):
    if current_user.role != "owner":
        raise HTTPException(status_code=403, detail="Only owner can manage account prices")
    return current_user


@router.get("", response_model=list[UserAccountPriceResponse])
async def get_account_prices(
    db: AsyncSession = Depends(get_db),
    _owner: User = Depends(_require_owner),
):
    """Get sell prices for all users (owner only)."""
    prices = await user_account_price_service.get_all_user_prices(db)
    return prices


@router.put("", response_model=list[UserAccountPriceResponse])
async def update_account_prices(
    payload: UserAccountPriceBulkUpdate,
    db: AsyncSession = Depends(get_db),
    _owner: User = Depends(_require_owner),
):
    """Bulk update sell prices for multiple users (owner only)."""
    try:
        prices_data = [
            {"user_id": item.user_id, "sell_price": item.sell_price}
            for item in payload.prices
        ]
        await user_account_price_service.bulk_upsert_prices(db, prices_data)
        await db.commit()
        # Return updated list
        return await user_account_price_service.get_all_user_prices(db)
    except Exception as exc:
        await db.rollback()
        logger.exception("Failed to update account prices: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to update account prices")
