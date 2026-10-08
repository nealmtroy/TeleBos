"""Pydantic schemas for wallet transactions, topup, and withdraw."""

from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, Field


class WalletTransactionResponse(BaseModel):
    id: str
    user_id: UUID
    user_email: str | None = None
    type: str  # topup, withdraw, redeem, admin_adjustment
    amount: int
    total_amount: int | None = None
    method: str
    note: str | None = None
    status: str  # pending, approved, rejected
    qris_url: str | None = None
    qris_image: str | None = None
    expired_at: datetime | None = None
    admin_note: str | None = None
    created_at: datetime
    processed_at: datetime | None = None

    model_config = {"from_attributes": True}


class TopupStatusCheckResponse(BaseModel):
    id: str
    status: str
    amount: int
    total_amount: int
    is_paid: bool
    processed_at: datetime | None = None


class KlikQrisWebhookPayload(BaseModel):
    order_id: str
    status: str
    amount: float | int | str | None = None
    total_amount: float | int | str | None = None
    payment_date: str | None = None
    created_at: str | None = None
    updated_at: str | None = None
    keterangan: str | None = None
    direct_url: str | None = None
    signature: str | None = None


class WalletTransactionListResponse(BaseModel):
    transactions: list[WalletTransactionResponse]
    total: int


class TopupCreateRequest(BaseModel):
    amount: int = Field(..., ge=10_000, description="Top up amount in IDR (min 10,000)")
    method: str = Field(default="QRIS", description="Payment method")
    note: str | None = Field(default=None, description="Optional note")


class WithdrawCreateRequest(BaseModel):
    amount: int = Field(..., ge=10_000, description="Withdrawal amount in IDR (min 10,000)")
    method: str = Field(..., description="Destination provider/bank")
    note: str = Field(..., description="Destination account details")


class AdminTransactionStatusUpdate(BaseModel):
    status: str = Field(..., description="approved or rejected")
    admin_note: str | None = Field(default=None, description="Reason or approval note")
