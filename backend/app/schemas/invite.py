"""Invite-related Pydantic schemas."""

from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, Field


class SourceGroupItem(BaseModel):
    type: str  # username, link, group_id
    value: str


class InviteJobCreate(BaseModel):
    account_ids: list[UUID]
    destination_group: str = Field(min_length=1, max_length=500)
    destination_type: str = "username"  # username, link, group_id
    source_groups: list[SourceGroupItem] = Field(min_length=1)
    delay_per_invite: int = Field(30, ge=5, le=3600)
    delay_per_batch: int = Field(60, ge=0, le=3600)
    batch_size: int = Field(5, ge=1, le=50)


class InviteJobResponse(BaseModel):
    id: UUID
    account_ids: list[UUID]
    user_id: UUID
    destination_group: str
    destination_type: str
    source_groups: list[SourceGroupItem]
    status: str
    total_members: int
    invited_count: int
    already_member_count: int
    fail_count: int
    skip_count: int
    progress: int
    delay_per_invite: int
    delay_per_batch: int
    batch_size: int
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None

    model_config = {"from_attributes": True}


class InviteLogResponse(BaseModel):
    id: UUID
    job_id: UUID
    account_id_used: UUID | None
    user_id_tg: int
    username: str | None
    first_name: str | None
    source_group: str
    status: str
    error_type: str | None
    error_message: str | None
    invited_at: datetime

    model_config = {"from_attributes": True}


class InviteLogFilter(BaseModel):
    status: str | None = None
    error_type: str | None = None
    search: str | None = None
