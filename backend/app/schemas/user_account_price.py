"""Schemas for telegram_id prefix-based pricing (owner sets prices by prefix)."""

from uuid import UUID
from pydantic import BaseModel, Field


class TelegramIdPrefixPriceResponse(BaseModel):
    id: str
    id_prefix: str = Field(..., description="Telegram ID prefix to match (e.g. '7', '77')")
    sell_price: int = Field(..., description="Sell price per account in IDR")
    note: str | None = None


class TelegramIdPrefixPriceCreate(BaseModel):
    id_prefix: str = Field(..., min_length=1, max_length=20, description="Telegram ID prefix (e.g. '7', '77')")
    sell_price: int = Field(..., ge=1, description="Sell price per account in IDR")
    note: str | None = None


class TelegramIdPrefixPriceUpdate(BaseModel):
    sell_price: int = Field(..., ge=1, description="Sell price per account in IDR")
    note: str | None = None
