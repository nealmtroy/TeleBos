"""Broadcast-related Pydantic schemas."""

from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, Field, field_validator, model_validator


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
    schedule_enabled: bool = False
    schedule_start_time: str | None = None
    schedule_end_time: str | None = None
    schedule_timezone: str = "Asia/Jakarta"
    log_destination: str | None = None  # None=default, "web_only"=skip Telegram, else=@username/user_id

    @field_validator("log_destination")
    @classmethod
    def _validate_log_destination(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        if not v:
            return None
        # The DB column is VARCHAR(255); a longer value used to surface as a raw
        # DB error, and embedded whitespace breaks the destination parser.
        if len(v) > 255:
            raise ValueError("log_destination maksimal 255 karakter.")
        if any(c.isspace() for c in v):
            raise ValueError("log_destination tidak boleh mengandung spasi.")
        return v

    @model_validator(mode="after")
    def _validate_schedule(self) -> "BroadcastStartRequest":
        if self.schedule_enabled:
            from app.utils.schedule_helper import is_valid_time_format
            if not self.schedule_start_time or not is_valid_time_format(self.schedule_start_time):
                raise ValueError("Jam mulai (schedule_start_time) harus diisi dengan format HH:MM (contoh: 07:00).")
            if not self.schedule_end_time or not is_valid_time_format(self.schedule_end_time):
                raise ValueError("Jam selesai (schedule_end_time) harus diisi dengan format HH:MM (contoh: 17:00).")
        return self


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
    schedule_enabled: bool = False
    schedule_start_time: str | None = None
    schedule_end_time: str | None = None
    schedule_timezone: str = "Asia/Jakarta"
    schedule_paused: bool = False
    log_destination: str | None = None
    created_at: datetime
    completed_at: datetime | None
    related_job_ids: list[UUID] | None = None

    model_config = {"from_attributes": True}


class BroadcastCycleDetail(BaseModel):
    group_identifier: str
    group_id: int | None = None
    account_id_used: str | None = None
    account_name: str | None = None
    status: str  # "success" or "error"
    error_type: str | None = None
    error_message: str | None = None
    sent_text: str | None = None
    duration_ms: int | None = None
    sent_at: str | None = None


class BroadcastLogResponse(BaseModel):
    id: UUID
    job_id: UUID
    cycle_number: int = 1
    total_groups: int = 0
    sent_count: int = 0
    fail_count: int = 0
    duration_ms: int | None = None
    created_at: datetime
    details: list[BroadcastCycleDetail] = []

    model_config = {"from_attributes": True}


class BroadcastCycleLogResponse(BroadcastLogResponse):
    pass


class BroadcastLogFilter(BaseModel):
    status: str | None = None
    error_type: str | None = None
    date_from: datetime | None = None
    date_to: datetime | None = None
    search: str | None = None


class BroadcastUserSummaryResponse(BaseModel):
    total_jobs: int = 0
    running_jobs: int = 0
    paused_jobs: int = 0
    completed_jobs: int = 0
    failed_jobs: int = 0
    cancelled_jobs: int = 0
    active_accounts_count: int = 0
    # IDs of accounts currently tied to a running/paused job. Used by the UI to
    # keep busy senders out of new-broadcast account pickers.
    active_account_ids: list[str] = []
    total_accounts_used: int = 0
    total_sent: int = 0
    total_failed: int = 0


class BroadcastEntitlementResponse(BaseModel):
    """Free-tier broadcast allowance and watermark state for the current user.

    Roles above ``basic`` report ``unlimited`` and no watermark, because the
    allowance does not apply to them.
    """
    role: str
    unlimited: bool
    daily_limit_seconds: int
    remaining_seconds: int
    used_seconds: int
    watermark_enabled: bool
    watermark_preview: str | None = None
