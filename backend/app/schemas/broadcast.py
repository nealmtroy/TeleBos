"""Broadcast-related Pydantic schemas."""

from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, Field


class GroupListItem(BaseModel):
    type: str  # username, link, group_id
    value: str


class GroupListCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    items: list[GroupListItem] = []


class GroupListUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    items: list[GroupListItem] | None = None


class GroupListResponse(BaseModel):
    id: UUID
    name: str
    items: list[GroupListItem]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TextListCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    texts: list[str] = []


class TextListUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    texts: list[str] | None = None


class TextListResponse(BaseModel):
    id: UUID
    name: str
    texts: list[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class BroadcastStartRequest(BaseModel):
    account_ids: list[UUID]
    group_list_id: UUID
    text_list_id: UUID | None = None
    mode: str = "multi_random"  # single_text, multi_random
    custom_text: str | None = None
    delay_per_group: int = Field(5, ge=1, le=3600)
    delay_after_all: int = Field(0, ge=0, le=3600)
    loop_enabled: bool = True
    delay_randomized: bool = False
    log_destination: str | None = None  # None=default, "web_only"=skip Telegram, else=@username/user_id


class BroadcastJobResponse(BaseModel):
    id: UUID
    account_ids: list[UUID]
    user_id: UUID
    group_list_id: UUID | None
    text_list_id: UUID | None
    mode: str
    custom_text: str | None = None
    status: str
    progress: int
    total_groups: int
    sent_count: int
    fail_count: int
    delay_per_group: int
    delay_after_all: int
    loop_enabled: bool
    delay_randomized: bool
    log_destination: str | None = None
    created_at: datetime
    completed_at: datetime | None

    model_config = {"from_attributes": True}


class BroadcastLogResponse(BaseModel):
    id: UUID
    job_id: UUID
    cycle_number: int = 1
    group_identifier: str
    group_id: int | None
    status: str
    error_type: str | None
    error_message: str | None
    sent_text: str | None
    sent_at: datetime
    duration_ms: int | None
    account_id_used: UUID | None = None

    model_config = {"from_attributes": True}


class BroadcastLogFilter(BaseModel):
    status: str | None = None
    error_type: str | None = None
    date_from: datetime | None = None
    date_to: datetime | None = None
    search: str | None = None
