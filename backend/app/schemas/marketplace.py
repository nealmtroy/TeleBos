"""Marketplace request/response schemas."""

from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, Field


class MarketplaceSellRequest(BaseModel):
    account_ids: list[UUID] = Field(..., description="List of account IDs to sell")


class MarketplaceSellResponse(BaseModel):
    total_received: int = Field(..., description="Total balance received in IDR")


class MarketplaceStockCategory(BaseModel):
    country_code: str = Field(..., description="Country code prefix, e.g. +62")
    country_name: str = Field(..., description="Country name, e.g. Indonesia")
    ready_stock: int = Field(..., description="Number of ready accounts in stock")
    price: int = Field(..., description="Current purchase price per account in IDR")


class MarketplaceAccountSummary(BaseModel):
    id: UUID
    telegram_id: int | None = None
    twofa_enabled: bool
    recovery_email_available: bool


class MarketplaceBuyResponse(BaseModel):
    id: UUID
    telegram_id: int | None = None
    phone: str = Field(..., description="Full phone number (revealed after purchase)")
    first_name: str | None = None
    last_name: str | None = None
    username: str | None = None
    created_at: datetime


class MarketplacePricingResponse(BaseModel):
    buy_price: int = Field(..., description="Purchase price per account in IDR")
    sell_price: int = Field(..., description="Sale credit received per account in IDR")

