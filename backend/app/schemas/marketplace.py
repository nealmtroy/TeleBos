"""Marketplace request/response schemas."""

from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, Field


class MarketplaceSellRequest(BaseModel):
    """Simple sell request — just account IDs. Price is owner-configured."""
    account_ids: list[UUID] = Field(..., description="List of account IDs to sell")


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


class AccountAuditLogResponse(BaseModel):
    id: UUID
    user_id: UUID
    account_id: UUID | None = None
    action: str
    price: int
    phone: str | None = None
    telegram_id: int | None = None
    created_at: datetime

    model_config = {"from_attributes": True}

