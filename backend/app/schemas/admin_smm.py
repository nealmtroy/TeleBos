"""Pydantic schemas for admin SMM endpoints."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


# ── Profile ──────────────────────────────────────────────────────────────────


class SmmProfileResponse(BaseModel):
    balance: str | None = None
    name: str | None = None
    sid: str | None = None
    currency: str | None = None


# ── Services ─────────────────────────────────────────────────────────────────


class SmmServiceUpdate(BaseModel):
    is_active: bool | None = None
    is_visible: bool | None = None
    selling_price: int | None = None
    markup_percent: int | None = None


class SmmServiceResponse(BaseModel):
    id: int
    service_id: int
    service_name: str
    category: str
    original_price: int
    selling_price: int | None
    effective_price: int = 0
    min_qty: int
    max_qty: int
    note: str | None
    speed: str | None
    is_active: bool
    is_visible: bool
    markup_percent: int
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class SmmServiceListResponse(BaseModel):
    services: list[SmmServiceResponse]
    total: int


class BulkServiceUpdate(BaseModel):
    """Bulk update payload. Only set fields will be applied to matching services."""

    category: str | None = None
    """If provided, only services in this category are updated."""

    service_ids: list[int] | None = None
    """If provided, only these service IDs are updated."""

    is_active: bool | None = None
    is_visible: bool | None = None
    markup_percent: int | None = None


# ── Orders ───────────────────────────────────────────────────────────────────


class AdminOrderResponse(BaseModel):
    id: UUID
    user_id: UUID
    user_email: str = ""
    smm_order_id: str | None
    service_id: int
    service_name: str
    category: str
    data_target: str
    quantity: int
    price: int
    total_price: int
    status: str
    start_count: int | None
    remains: int | None
    is_mass_order: bool
    note: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AdminOrderListResponse(BaseModel):
    orders: list[AdminOrderResponse]
    total: int


# ── Stats ────────────────────────────────────────────────────────────────────


class SmmStatsResponse(BaseModel):
    total_services: int = 0
    active_services: int = 0
    total_orders: int = 0
    pending_orders: int = 0
    total_revenue: int = 0
    total_users_with_orders: int = 0
    panel_balance: str | None = None


# ── Settings ─────────────────────────────────────────────────────────────────


class SmmSettingsResponse(BaseModel):
    global_markup_percent: int = Field(default=0, description="Global markup applied on top of original_price when no per-service selling_price is set")
    account_buy_price: int = Field(default=0, description="Price to buy an account in IDR")
    account_sell_price: int = Field(default=0, description="Price to sell an account in IDR")


class SmmSettingsUpdate(BaseModel):
    global_markup_percent: int | None = Field(default=None, ge=0, le=1000, description="Global markup percent (0-1000)")
    account_buy_price: int | None = Field(default=None, ge=0, description="Price to buy an account in IDR")
    account_sell_price: int | None = Field(default=None, ge=0, description="Price to sell an account in IDR")
