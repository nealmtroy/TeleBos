"""Schemas for telegram_id prefix-based pricing (owner sets buy/sell prices by prefix)."""

from pydantic import BaseModel, Field


class TelegramIdPrefixPriceResponse(BaseModel):
    id: str
    id_prefix: str = Field(..., description="Telegram ID prefix to match (e.g. '7', '77')")
    sell_price: int = Field(..., description="Price the seller receives, in IDR")
    buy_price: int | None = Field(
        default=None,
        description="Price the buyer pays, in IDR. Null falls back to the global buy price.",
    )
    margin: int = Field(
        ...,
        description="Effective platform margin (buy_price - sell_price), after fallbacks",
    )
    note: str | None = None


class TelegramIdPrefixPriceCreate(BaseModel):
    id_prefix: str = Field(
        ...,
        min_length=1,
        max_length=20,
        description="Telegram ID prefix (e.g. '7', '77')",
    )
    sell_price: int = Field(..., ge=1, description="Price the seller receives, in IDR")
    buy_price: int | None = Field(
        default=None,
        ge=1,
        description="Price the buyer pays, in IDR. Omit to use the global buy price.",
    )
    note: str | None = None


class TelegramIdPrefixPriceUpdate(BaseModel):
    sell_price: int = Field(..., ge=1, description="Price the seller receives, in IDR")
    buy_price: int | None = Field(
        default=None,
        ge=1,
        description="Price the buyer pays, in IDR. Omit to use the global buy price.",
    )
    note: str | None = None
