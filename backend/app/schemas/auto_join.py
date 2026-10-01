"""Request/response shapes for the auto-join job API."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class AutoJoinTargetItem(BaseModel):
    type: str = "username"  # username, link
    value: str


class AutoJoinJobCreate(BaseModel):
    account_ids: list[UUID] = Field(min_length=1)
    targets: list[AutoJoinTargetItem] = Field(min_length=1)
    distribution_mode: str = "all"  # all, distribute
    delay_per_group: int = Field(5, ge=0, le=600)
    delay_randomized: bool = False


class AutoJoinJobResponse(BaseModel):
    id: UUID
    account_ids: list[str]
    user_id: UUID
    targets: list[dict]
    distribution_mode: str
    status: str
    total_tasks: int
    success_count: int
    already_count: int
    fail_count: int
    progress: int
    delay_per_group: int
    delay_randomized: bool
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None = None

    model_config = {"from_attributes": True}


class AutoJoinLogResponse(BaseModel):
    id: UUID
    job_id: UUID
    target: str
    target_type: str | None
    chat_id: int | None
    chat_title: str | None
    chat_username: str | None
    chat_type: str | None
    status: str
    error_type: str | None
    error_message: str | None
    joined_at: datetime
    account_id_used: UUID | None
    account_name: str | None

    model_config = {"from_attributes": True}
