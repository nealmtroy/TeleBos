"""Schemas for UserAccountPrice management (owner sets per-user sell prices)."""

from uuid import UUID
from pydantic import BaseModel, Field


class UserAccountPriceResponse(BaseModel):
    user_id: UUID
    user_email: str | None = None
    user_full_name: str | None = None
    sell_price: int


class UserAccountPriceUpdate(BaseModel):
    user_id: UUID
    sell_price: int = Field(..., ge=1, description="Sell price per account in IDR")


class UserAccountPriceBulkUpdate(BaseModel):
    prices: list[UserAccountPriceUpdate]
