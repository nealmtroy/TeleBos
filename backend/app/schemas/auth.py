"""Auth-related Pydantic schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class ChangePasswordResponse(BaseModel):
    message: str = "Password changed successfully"


class LogoutResponse(BaseModel):
    success: bool = True


class UserResponse(BaseModel):
    id: UUID
    email: str
    full_name: str | None
    role: str
    is_active: bool
    balance: int = 0
    telegram_chat_id: int | None = None
    created_at: datetime | None = None
    onboarding_completed: bool = False

    model_config = {"from_attributes": True}

