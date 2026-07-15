"""Schemas for managing scoped integration API keys."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


API_KEY_SCOPES = ("profile:read", "accounts:read", "jobs:read", "accounts:write")


class ApiKeyCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    scopes: list[str] = Field(default_factory=lambda: ["profile:read"])
    expires_at: datetime | None = None


class ApiKeyResponse(BaseModel):
    id: UUID
    name: str
    key_prefix: str
    scopes: list[str]
    expires_at: datetime | None
    revoked_at: datetime | None
    last_used_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ApiKeyCreateResponse(ApiKeyResponse):
    """The plaintext secret is returned only in the creation response."""

    secret: str


class PublicUserResponse(BaseModel):
    id: UUID
    full_name: str | None = None
    email: str
    role: str


class PublicAccountResponse(BaseModel):
    id: UUID
    telegram_id: int | None = None
    first_name: str | None = None
    last_name: str | None = None
    username: str | None = None
    phone_verified: bool
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}
