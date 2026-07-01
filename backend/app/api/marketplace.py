"""Marketplace API endpoints — buy and sell Telegram accounts."""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.account import AccountResponse
from app.schemas.marketplace import (
    MarketplaceSellRequest,
    MarketplaceSellResponse,
    MarketplaceStockCategory,
    MarketplaceAccountSummary,
    MarketplaceBuyResponse,
    MarketplacePricingResponse,
)
from app.services import marketplace_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/marketplace", tags=["marketplace"])


@router.get("/pricing", response_model=MarketplacePricingResponse)
async def get_marketplace_pricing(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve current buy and sell prices for Telegram accounts."""
    buy_price, sell_price = await marketplace_service.get_marketplace_prices(db)
    return MarketplacePricingResponse(buy_price=buy_price, sell_price=sell_price)



@router.get("/sell-eligible", response_model=list[AccountResponse])
async def get_sell_eligible_accounts(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve all of your connected Telegram accounts eligible for sale."""
    accounts = await marketplace_service.get_sell_eligible_accounts(db, current_user)
    return accounts


@router.post("/sell", response_model=MarketplaceSellResponse)
async def sell_accounts(
    payload: MarketplaceSellRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List one or more Telegram accounts for sale.

    The sell price is auto-determined from owner-configured pricing per user.
    You will be credited the sale amount only when a buyer purchases your account.
    """
    try:
        account_ids = [str(aid) for aid in payload.account_ids]
        total_listed = await marketplace_service.sell_accounts(db, current_user, account_ids)
        await db.commit()
        return MarketplaceSellResponse(total_listed=total_listed)
    except ValueError as exc:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        await db.rollback()
        logger.exception("Failed to sell accounts: %s", exc)
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/stock", response_model=list[MarketplaceStockCategory])
async def get_stock_categories(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get all ready account stock categorized by country code prefix."""
    categories = await marketplace_service.get_stock_categories(db)
    return categories


@router.get("/stock/{country_code}/accounts", response_model=list[MarketplaceAccountSummary])
async def get_stock_accounts(
    country_code: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get list of accounts available in a country category (limited details)."""
    accounts = await marketplace_service.get_stock_accounts(db, country_code)
    return accounts


@router.post("/buy/{account_id}", response_model=MarketplaceBuyResponse)
async def buy_account(
    account_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Purchase a specific Telegram account from the marketplace pool.

    The seller will be credited the sale amount when the purchase completes.
    """
    try:
        account = await marketplace_service.buy_account(db, current_user, account_id)
        await db.commit()
        return MarketplaceBuyResponse(
            id=account.id,
            telegram_id=account.telegram_id,
            phone=account.phone,
            first_name=account.first_name,
            last_name=account.last_name,
            username=account.username,
            created_at=account.created_at,
        )
    except ValueError as exc:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        await db.rollback()
        logger.exception("Failed to buy account %s: %s", account_id, exc)
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/cancel/{account_id}", response_model=AccountResponse)
async def cancel_sell_account(
    account_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Cancel listed Telegram account from the marketplace pool."""
    try:
        account = await marketplace_service.cancel_sell_account(db, current_user, account_id)
        await db.commit()
        return account
    except ValueError as exc:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        await db.rollback()
        logger.exception("Failed to cancel account sale %s: %s", account_id, exc)
        raise HTTPException(status_code=500, detail="Internal server error")

