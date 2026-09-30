"""Admin API endpoints for telegram_id prefix-based account pricing."""

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.user_account_price import (
    TelegramIdPrefixPriceResponse,
    TelegramIdPrefixPriceCreate,
    TelegramIdPrefixPriceUpdate,
)
from app.services import user_account_price_service
from app.utils.sanitize import sanitize_exception

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin/account-prices", tags=["admin"])

async def _require_owner(current_user: User = Depends(get_current_user)):
    if current_user.role != "owner":
        raise HTTPException(status_code=403, detail="Only owner can manage account prices")
    return current_user

async def _with_margin(db: AsyncSession, row: dict[str, Any]) -> dict[str, Any]:
    """Attach the derived margin to a single price rule response.

    The margin depends on the global buy-price fallback, so the create/update
    paths report it through the service rather than duplicating that maths here.
    """
    margin = await user_account_price_service.effective_margin(
        db, row.get("sell_price", 0), row.get("buy_price")
    )
    return {**row, "margin": margin}

@router.get("", response_model=list[TelegramIdPrefixPriceResponse])
async def get_account_prices(
    db: AsyncSession = Depends(get_db),
    _owner: User = Depends(_require_owner),
):
    """Get all telegram_id prefix price rules (owner only)."""
    return await user_account_price_service.get_all_prefix_prices(db)

@router.post("", response_model=TelegramIdPrefixPriceResponse, status_code=201)
async def create_price_rule(
    payload: TelegramIdPrefixPriceCreate,
    db: AsyncSession = Depends(get_db),
    _owner: User = Depends(_require_owner),
):
    """Create a new prefix price rule (owner only)."""
    try:
        result = await user_account_price_service.upsert_prefix_price(
            db,
            payload.id_prefix,
            payload.sell_price,
            payload.note,
            buy_price=payload.buy_price,
        )
        await db.commit()
        return await _with_margin(db, result)
    except ValueError as exc:
        await db.rollback()
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))
    except Exception as exc:
        await db.rollback()
        logger.exception("Failed to create price rule: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to create price rule")

@router.put("/{id_prefix}", response_model=TelegramIdPrefixPriceResponse)
async def update_price_rule(
    id_prefix: str,
    payload: TelegramIdPrefixPriceUpdate,
    db: AsyncSession = Depends(get_db),
    _owner: User = Depends(_require_owner),
):
    """Update a prefix price rule (owner only)."""
    try:
        result = await user_account_price_service.upsert_prefix_price(
            db,
            id_prefix,
            payload.sell_price,
            payload.note,
            buy_price=payload.buy_price,
        )
        await db.commit()
        return await _with_margin(db, result)
    except ValueError as exc:
        await db.rollback()
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))
    except Exception as exc:
        await db.rollback()
        logger.exception("Failed to update price rule: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to update price rule")

@router.delete("/{id_prefix}", status_code=204)
async def delete_price_rule(
    id_prefix: str,
    db: AsyncSession = Depends(get_db),
    _owner: User = Depends(_require_owner),
):
    """Delete a price rule (owner only)."""
    try:
        await user_account_price_service.delete_prefix_price(db, id_prefix)
        await db.commit()
    except Exception as exc:
        await db.rollback()
        logger.exception("Failed to delete price rule: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to delete price rule")
