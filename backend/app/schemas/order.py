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


class MassOrderItem(BaseModel):
    service_id: int
    data_target: str = Field(..., min_length=1, max_length=500)
    quantity: int = Field(default=1, ge=1, le=1000000)
    comments: str | None = Field(None, max_length=10000)
    usernames: str | None = Field(None, max_length=10000)


class MassOrderCreate(BaseModel):
    orders: list[MassOrderItem] = Field(..., min_length=1, max_length=100)


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

    model_config = {"from_attributes": True}


class OrderStatusResponse(BaseModel):
    id: UUID
    smm_order_id: str | None
    service_name: str
    status: str
    start_count: int | None
    remains: int | None
    created_at: datetime

    model_config = {"from_attributes": True}
