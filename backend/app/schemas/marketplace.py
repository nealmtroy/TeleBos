"""Marketplace request/response schemas."""

from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, Field


class MarketplaceSellItem(BaseModel):
    """One account to list for sale, with its own price."""
    account_id: UUID = Field(..., description="Account ID to sell")
    sell_price: int = Field(..., ge=1, description="Sell price for this account in IDR")


class MarketplaceSellRequest(BaseModel):
    accounts: list[MarketplaceSellItem] = Field(
        ..., description="List of accounts with per-account prices"
    )


class MarketplaceSellResponse(BaseModel):
    total_listed: int = Field(..., description="Number of accounts listed for sale")


class MarketplaceStockCategory(BaseModel):
    country_code: str = Field(..., description="Country code prefix, e.g. +62")
    country_name: str = Field(..., description="Country name, e.g. Indonesia")
    ready_stock: int = Field(..., description="Number of ready accounts in stock")
    price: int = Field(..., description="Current purchase price per account in IDR (from price)")


class MarketplaceAccountSummary(BaseModel):
    id: UUID
    telegram_id: int | None = None
    twofa_enabled: bool
    recovery_email_available: bool
    sell_price: int | None = None


class MarketplaceBuyResponse(BaseModel):
    id: UUID
    telegram_id: int | None = None
    phone: str = Field(..., description="Full phone number (revealed after purchase)")
    first_name: str | None = None
    last_name: str | None = None
    username: str | None = None
    created_at: datetime


class MarketplacePricingResponse(BaseModel):
    buy_price: int = Field(..., description="Default purchase price per account in IDR")
    sell_price: int = Field(..., description="Default sale credit received per account in IDR")
