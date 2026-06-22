"""Account-related Pydantic schemas."""

from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, Field



class SendCodeRequest(BaseModel):
    phone: str = Field(description="Phone number with country code, e.g. +6281234567890")


class VerifyCodeRequest(BaseModel):
    phone: str
    code: str = Field(min_length=5, max_length=5)
    phone_code_hash: str
    twofa_password: str | None = None


class SendCodeResponse(BaseModel):
    phone_code_hash: str
    timeout: int | None = 120


class VerifyCodeResponse(BaseModel):
    account_id: str
    phone: str
    first_name: str | None
    last_name: str | None
    username: str | None
    requires_2fa: bool = False
    v2l_hint: str | None = None


class UploadSessionRequest(BaseModel):
    session_string: str
    session_format: str | None = Field(
        None,
        description="Detected format sent by frontend (telethon/gramjs/pyrogram/raw_base64)",
    )


class AccountResponse(BaseModel):
    id: UUID
    phone: str
    telegram_id: int | None = None
    first_name: str | None
    last_name: str | None
    username: str | None
    bio: str | None
    profile_photo_path: str | None
    phone_verified: bool
    twofa_enabled: bool
    is_active: bool
    auto_reply_enabled: bool = False
    auto_reply_text: str | None = None
    last_sync_at: datetime | None
    created_at: datetime
    sell_price: int | None = None

    spam_status: str | None = "unknown"
    spam_detail: str | None = None
    spam_last_checked_at: datetime | None = None

    model_config = {"from_attributes": True}


class AutoReplyUpdateRequest(BaseModel):
    auto_reply_enabled: bool
    auto_reply_text: str | None = None


class BulkAutoReplyUpdateRequest(BaseModel):
    account_ids: list[str]
    auto_reply_enabled: bool
    auto_reply_text: str | None = None


class AccountListResponse(BaseModel):
    accounts: list[AccountResponse]


class ProfileUpdateRequest(BaseModel):
    first_name: str | None = Field(None, max_length=255)
    last_name: str | None = Field(None, max_length=255)
    username: str | None = Field(None, max_length=255)
    bio: str | None = Field(None, max_length=500)


class AccountHintRequest(BaseModel):
    phone: str


class AccountHintResponse(BaseModel):
    has_2fa: bool
    phone_exists: bool
    flood_wait_sec: int | None = None
    error: str | None = None
