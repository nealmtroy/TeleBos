"""Order-related Pydantic schemas."""

from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, Field


class SMMServiceItem(BaseModel):
    """Matching the Buzzerpanel API service response format."""
    id: int
    name: str
    price: int
    min: int
    max: int
    note: str
    category: str


class ServiceListResponse(BaseModel):
    services: list[SMMServiceItem]


class OrderCreate(BaseModel):
    service_id: int
    data_target: str = Field(..., min_length=1, max_length=500, description="URL or username target")
    quantity: int = Field(default=1, ge=1, le=1000000)
    comments: str | None = Field(None, max_length=10000, description="Multiline comments for comment services")
    usernames: str | None = Field(None, max_length=10000, description="Multiline usernames for mention services")
    payment_method: str | None = Field(None, description="Payment method if invoice required: qris, usdt_bep20, usdt_trc20, usdt_polygon")


class MassOrderItem(BaseModel):
    service_id: int
    data_target: str = Field(..., min_length=1, max_length=500)
    quantity: int = Field(default=1, ge=1, le=1000000)
    comments: str | None = Field(None, max_length=10000)
    usernames: str | None = Field(None, max_length=10000)


class MassOrderCreate(BaseModel):
    orders: list[MassOrderItem] = Field(..., min_length=1, max_length=100)
    payment_method: str | None = Field(None, description="Payment method if invoice required: qris, usdt_bep20, usdt_trc20, usdt_polygon")


class OrderResponse(BaseModel):
    id: UUID
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
    invoice_id: str | None = None
    payment_required: bool = False
    is_refunded: bool = False
    refunded_amount: int = 0

    model_config = {"from_attributes": True}


class OrderStatusResponse(BaseModel):
    id: UUID
    smm_order_id: str | None
    service_name: str
    status: str
    start_count: int | None
    remains: int | None
    is_refunded: bool = False
    refunded_amount: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}


class UnifiedActivityItem(BaseModel):
    id: str
    order_id_display: str
    type: str  # "smm" | "telegram_account" | "deposit" | "withdraw" | "redeem" | "admin_adjustment"
    type_name: str
    service_name: str
    service_sublabel: str
    detail: str
    quantity_display: str
    quantity_raw: int
    price_display: str
    price_raw: int
    status: str  # "Selesai" | "Proses" | "Menunggu" | "Dibatalkan"
    status_raw: str
    created_at: datetime
    date_str: str
    time_str: str
    telegram_id: int | None = None
    phone: str | None = None
    smm_order_id: str | None = None
    remains: int | None = None
    start_count: int | None = None
    target_url: str | None = None
    payment_method: str | None = None
    admin_note: str | None = None


class ActivityMetrics(BaseModel):
    total_orders: int
    total_accounts: int
    total_smm: int
    total_deposits: int
    total_withdrawals: int
    total_balance_adj: int
    total_spend: int
    in_progress_count: int
    completed_count: int
    success_rate: str


class ActivityPagination(BaseModel):
    page: int
    page_size: int
    total_items: int
    total_pages: int


class ActivityHistoryResponse(BaseModel):
    items: list[UnifiedActivityItem]
    pagination: ActivityPagination
    metrics: ActivityMetrics
