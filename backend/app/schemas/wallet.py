"""Pydantic schemas for wallet transactions, topup, and withdraw."""

from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, Field, model_validator


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
    type: str | None = None
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


class WithdrawOtpRequest(BaseModel):
    amount: int = Field(..., ge=10_000, description="Withdrawal amount in IDR (min 10,000)")
    method: str = Field(..., description="Destination provider/bank")
    note: str = Field(..., description="Destination account details")


class WithdrawOtpResponse(BaseModel):
    message: str
    email_masked: str
    expires_in_seconds: int
    cooldown_seconds: int


class WithdrawCreateRequest(BaseModel):
    amount: int = Field(..., ge=10_000, description="Withdrawal amount in IDR (min 10,000)")
    method: str = Field(..., description="Destination provider/bank")
    note: str = Field(..., description="Destination account details")
    otp_code: str = Field(..., min_length=6, max_length=6, description="6-digit verification code sent to email")


class AdminTransactionStatusUpdate(BaseModel):
    status: str = Field(..., description="approved or rejected")
    admin_note: str | None = Field(default=None, description="Reason or approval note")


class WalletLedgerEntryResponse(BaseModel):
    id: UUID
    user_id: UUID
    entry_type: str  # DEBIT or CREDIT
    amount: int
    balance_before: int
    balance_after: int
    category: str
    reference_id: str | None = None
    description: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class WalletLedgerListResponse(BaseModel):
    entries: list[WalletLedgerEntryResponse]
    total: int


class BalanceReconciliationResponse(BaseModel):
    user_id: str
    actual_balance: int
    total_credits: int
    total_debits: int
    computed_balance: int
    discrepancy: int
    is_reconciled: bool


class BankAccountCreateRequest(BaseModel):
    type: str = Field(default="bank", description="bank or ewallet")
    provider: str = Field(..., min_length=1, max_length=50, description="e.g. BCA, Mandiri, GoPay")
    account_number: str = Field(..., min_length=3, max_length=50, description="Account number")
    account_holder: str = Field(..., min_length=1, max_length=255, description="Account holder name")
    is_default: bool = Field(default=False)

    @model_validator(mode="before")
    @classmethod
    def populate_camel_case(cls, data):
        if isinstance(data, dict):
            if "accountNumber" in data and "account_number" not in data:
                data["account_number"] = data["accountNumber"]
            if "accountHolder" in data and "account_holder" not in data:
                data["account_holder"] = data["accountHolder"]
            if "isDefault" in data and "is_default" not in data:
                data["is_default"] = data["isDefault"]
        return data


class BankAccountUpdateRequest(BaseModel):
    type: str | None = Field(default=None, description="bank or ewallet")
    provider: str | None = Field(default=None, max_length=50)
    account_number: str | None = Field(default=None, min_length=3, max_length=50)
    account_holder: str | None = Field(default=None, min_length=1, max_length=255)
    is_default: bool | None = Field(default=None)

    @model_validator(mode="before")
    @classmethod
    def populate_camel_case(cls, data):
        if isinstance(data, dict):
            if "accountNumber" in data and "account_number" not in data:
                data["account_number"] = data["accountNumber"]
            if "accountHolder" in data and "account_holder" not in data:
                data["account_holder"] = data["accountHolder"]
            if "isDefault" in data and "is_default" not in data:
                data["is_default"] = data["isDefault"]
        return data


class BankAccountResponse(BaseModel):
    id: str
    user_id: UUID
    type: str
    provider: str
    account_number: str
    account_number_last4: str
    account_holder: str
    is_default: bool
    created_at: datetime | None = None
    updated_at: datetime | None = None


    # camelCase properties for frontend convenience
    accountNumber: str | None = None
    accountHolder: str | None = None
    isDefault: bool | None = None

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def sync_camel_case(self):
        if self.accountNumber is None:
            self.accountNumber = self.account_number
        if self.accountHolder is None:
            self.accountHolder = self.account_holder
        if self.isDefault is None:
            self.isDefault = self.is_default
        return self

