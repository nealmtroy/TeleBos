"""Request/response shapes for the auto-leave job API."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class AutoLeaveScanRequest(BaseModel):
    account_ids: list[UUID] = Field(min_length=1)


class AccountDialogCountItem(BaseModel):
    account_id: UUID
    phone: str
    first_name: str | None = None
    last_name: str | None = None
    group_count: int = 0
    channel_count: int = 0
    creator_group_count: int = 0
    creator_channel_count: int = 0
    error: str | None = None


class AutoLeaveScanResponse(BaseModel):
    accounts: list[AccountDialogCountItem]
    total_groups: int = 0
    total_channels: int = 0


class AutoLeaveJobCreate(BaseModel):
    account_ids: list[UUID] = Field(min_length=1)
    leave_type: str = "groups"  # "groups", "channels", "both"
    skip_creator: bool = True
    delay_per_chat: int = Field(5, ge=0, le=600)
    delay_randomized: bool = False


class AutoLeaveJobResponse(BaseModel):
    id: UUID
    account_ids: list[str]
    user_id: UUID
    leave_type: str
    skip_creator: bool
    status: str
    total_tasks: int
    success_count: int
    skipped_count: int
    fail_count: int
    progress: int
    delay_per_chat: int
    delay_randomized: bool
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None = None
    related_job_ids: list[UUID] | None = None

    model_config = {"from_attributes": True}


class AutoLeaveLogResponse(BaseModel):
    id: UUID
    job_id: UUID
    target: str
    chat_id: int | None = None
    chat_title: str | None = None
    chat_username: str | None = None
    chat_type: str | None = None
    status: str
    error_type: str | None = None
    error_message: str | None = None
    left_at: datetime
    account_id_used: UUID | None = None
    account_name: str | None = None

    model_config = {"from_attributes": True}
