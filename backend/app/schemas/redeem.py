"""Pydantic schemas for redeem codes and subscriptions."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class RedeemRequest(BaseModel):
    code: str = Field(..., min_length=1, max_length=50)


class RedeemResponse(BaseModel):
    success: bool
    message: str
    balance_added: int | None = None
    plan: str | None = None
    expires_at: datetime | None = None


class RedeemCodeCreate(BaseModel):
    code_type: str = Field(..., pattern="^(balance|subscription)$")
    plan: str | None = Field(None, pattern="^(pro|premium)$")
    amount: int | None = Field(None, ge=1)
    max_uses: int = Field(1, ge=1, le=9999)
    duration_days: int | None = Field(None, ge=1, le=36500)
    expires_at: str | None = None  # ISO datetime string
    code_prefix: str | None = Field(None, max_length=20)
    custom_code: str | None = Field(None, min_length=1, max_length=50, pattern="^[a-zA-Z0-9_-]+$")


class RedeemCodeResponse(BaseModel):
    id: UUID
    code: str
    code_type: str
    plan: str | None
    amount: int | None
    max_uses: int
    used_count: int
    duration_days: int | None
    expires_at: datetime | None
    is_active: bool
    created_by: UUID
    created_by_email: str = ""
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class RedeemCodeListResponse(BaseModel):
    codes: list[RedeemCodeResponse]
    total: int


class RedeemLogResponse(BaseModel):
    id: UUID
    code_id: UUID
    code: str = ""
    user_id: UUID
    user_email: str = ""
    detail: str | None
    redeemed_at: datetime | None = None

    model_config = {"from_attributes": True}


class RedeemLogListResponse(BaseModel):
    logs: list[RedeemLogResponse]
    total: int


class SubscriptionInfoResponse(BaseModel):
    plan: str
    expires_at: datetime | None
    is_active: bool
    days_remaining: int | None
