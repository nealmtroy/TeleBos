"""Account-related Pydantic schemas."""

from datetime import datetime
from uuid import UUID
from typing import Any
from pydantic import BaseModel, EmailStr, Field, model_validator

import logging

logger = logging.getLogger(__name__)


class SendCodeRequest(BaseModel):
    phone: str = Field(description="Phone number with country code, e.g. +6281234567890")


class VerifyCodeRequest(BaseModel):
    login_id: str = Field(min_length=1, max_length=64)
    code: str = Field(min_length=1, max_length=64)
    twofa_password: str | None = Field(default=None, max_length=512)


class LoginIdRequest(BaseModel):
    login_id: str = Field(min_length=1, max_length=64)


class SetupLoginEmailRequest(LoginIdRequest):
    email: EmailStr = Field(max_length=254)


class VerifySetupLoginEmailRequest(LoginIdRequest):
    code: str = Field(min_length=1, max_length=64)


class VerifyTwoFARequest(LoginIdRequest):
    twofa_password: str = Field(min_length=1, max_length=512)


class SendCodeResponse(BaseModel):
    login_id: str
    stage: str
    delivery_type: str | None = None
    next_delivery_type: str | None = None
    timeout: int | None = None
    code_length: int | None = None
    input_mode: str | None = None
    input_pattern: str | None = None
    email_pattern: str | None = None
    reset_available_period: int | None = None
    reset_pending_date: int | None = None
    setup_url: str | None = None
    google_signin_allowed: bool = False
    apple_signin_allowed: bool = False


class SetupLoginEmailResponse(BaseModel):
    login_id: str
    stage: str = "setup_email_code"
    email_pattern: str | None = None
    code_length: int | None = None
    input_mode: str = "alphanumeric"
    timeout: int | None = None


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
    photo_version: int = 0
    has_profile_photo: bool = False
    color_id: int | None = None
    phone_verified: bool
    twofa_enabled: bool
    is_active: bool
    auto_reply_enabled: bool = False
    auto_reply_text: str | None = None
    last_sync_at: datetime | None
    groups_channels_synced_at: datetime | None = None
    created_at: datetime
    sell_price: int | None = None
    for_sale: bool = False

    spam_status: str | None = "unknown"
    spam_detail: str | None = None
    spam_last_checked_at: datetime | None = None

    est_reg_date: str | None = None
    est_reg_date_age: str | None = None
    est_reg_date_status: str | None = None

    folder_ids: list[UUID] = []

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def extract_folder_ids(cls, data: Any) -> Any:
        # Avoid lazy loading during serialization (MissingGreenlet)
        if isinstance(data, dict):
            if "folders" in data:
                try:
                    data["folder_ids"] = [
                        f.id if hasattr(f, "id") else f.get("id") if isinstance(f, dict) else f
                        for f in data["folders"]
                    ]
                except Exception as exc:
                    logger.warning("Failed to load folders for account dict (will use empty): %s", exc)
                    data["folder_ids"] = []
            elif "folder_ids" not in data:
                data["folder_ids"] = []
        else:
            # It's an object (SQLAlchemy model, mock, etc.)
            # Check if 'folders' is in the __dict__ of the ORM model (which means it's loaded in SQLAlchemy)
            # to avoid lazy loading.
            is_orm = hasattr(data, "_sa_instance_state")
            folders_loaded = False
            if is_orm:
                folders_loaded = "folders" in getattr(data, "__dict__", {})
            else:
                folders_loaded = hasattr(data, "folders")

            if folders_loaded:
                try:
                    data.folder_ids = [f.id for f in data.folders]
                except Exception as exc:
                    logger.warning("Failed to load folders for account (will use empty): %s", exc)
                    data.folder_ids = []
            else:
                if not hasattr(data, "folder_ids"):
                    try:
                        data.folder_ids = []
                    except Exception:
                        pass

        # Check if profile photo actually exists on disk
        import os
        from app.utils.photo_helper import get_photo_path

        if isinstance(data, dict):
            account_id = data.get("id")
            if account_id and data.get("profile_photo_path"):
                expected_path = get_photo_path(str(account_id))
                if not os.path.exists(expected_path):
                    data["profile_photo_path"] = None
        else:
            account_id = getattr(data, "id", None)
            if account_id and getattr(data, "profile_photo_path", None):
                expected_path = get_photo_path(str(account_id))
                if not os.path.exists(expected_path):
                    try:
                        data.profile_photo_path = None
                    except Exception:
                        pass

        return data


class AutoReplyUpdateRequest(BaseModel):
    auto_reply_enabled: bool
    auto_reply_text: str | None = None


class BulkAutoReplyUpdateRequest(BaseModel):
    account_ids: list[str]
    auto_reply_enabled: bool
    auto_reply_text: str | None = None


class AccountListResponse(BaseModel):
    accounts: list[AccountResponse]
    total: int | None = None
    page: int | None = None
    pages: int | None = None
    limit: int | None = None


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


class SpamAppealStartRequest(BaseModel):
    reason: str
    preset_id: str | None = None
    force: bool = False


class SpamAppealResponse(BaseModel):
    status: str  # "completed", "captcha_required", "already_submitted", "failed"
    message: str
    captcha_url: str | None = None
    generated_reason: str | None = None


class QRInitResponse(BaseModel):
    qr_id: str
    qr_url: str
    expires_at: float


class QRStatusResponse(BaseModel):
    status: str  # "pending", "success", "requires_2fa", "failed"
    account_id: str | None = None
    error: str | None = None


class QR2FALoginRequest(BaseModel):
    qr_id: str
    twofa_password: str


class UpdateProfileColorRequest(BaseModel):
    color_id: int
    background_emoji_id: int | None = None
