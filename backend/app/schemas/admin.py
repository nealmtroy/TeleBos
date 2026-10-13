"""Pydantic schemas for admin endpoints."""

from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, Field


class BroadcastAccountInfo(BaseModel):
    id: UUID
    telegram_id: int | None = None
    phone: str
    name: str | None = None
    username: str | None = None
    is_duplicate: bool = False
    conflicting_job_ids: list[UUID] = []


class BroadcastAdminJobResponse(BaseModel):
    id: UUID
    user_id: UUID
    user_email: str | None = None
    user_full_name: str | None = None
    group_list_id: UUID | None = None
    group_list_name: str | None = None
    text_list_id: UUID | None = None
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
    account_count: int = 0
    accounts: list[BroadcastAccountInfo] = []
    has_duplicate_accounts: bool = False
    duplicate_account_count: int = 0
    duplicate_job_ids: list[UUID] = []
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None = None

    model_config = {"from_attributes": True}


class BroadcastAdminListResponse(BaseModel):
    jobs: list[BroadcastAdminJobResponse]
    total: int


class BroadcastAdminStatsResponse(BaseModel):
    total_jobs: int
    running_jobs: int
    paused_jobs: int
    completed_jobs: int
    failed_jobs: int
    cancelled_jobs: int
    total_sent: int
    total_failed: int
    active_looping_jobs: int
    duplicate_conflict_jobs: int = 0


class BroadcastBulkActionRequest(BaseModel):
    action: str = Field(
        ...,
        description="pause_all_running, stop_all_running, delete_completed_failed, delete_selected",
    )
    job_ids: list[str] = Field(
        default_factory=list,
        description="List of job IDs if action is delete_selected",
    )


class UpdateBalanceRequest(BaseModel):
    user_id: str = Field(..., description="UUID of the user")
    amount: int = Field(..., description="Amount to add (positive) or deduct (negative)")


class UpdateRoleRequest(BaseModel):
    user_id: str
    role: str = Field(..., description="New role: owner, premium, pro, basic, freetrial")


class UserAdminResponse(BaseModel):
    id: UUID
    email: str
    full_name: str | None
    role: str
    balance: int
    is_active: bool
    order_count: int = 0
    created_at: datetime | str | None = None

    # Telegram Account metrics
    connected_accounts: int = 0
    active_accounts: int = 0
    expired_accounts: int = 0
    limited_accounts: int = 0

    # Broadcast metrics
    broadcast_running: int = 0
    broadcast_finished: int = 0
    broadcast_failed: int = 0
    broadcast_total: int = 0

    # Suspension details
    ban_reason: str | None = None
    ban_expires: datetime | None = None

    model_config = {"from_attributes": True}


class SuspendUserRequest(BaseModel):
    reason: str = Field(
        ..., min_length=3, max_length=500, description="Reason for suspension"
    )
    duration_days: int | None = Field(
        None,
        ge=1,
        le=365,
        description="Duration in days, or None for permanent suspension",
    )


class UserAdminListResponse(BaseModel):
    users: list[UserAdminResponse]
    total: int


class AdminStatsResponse(BaseModel):
    total_users: int
    total_broadcast_jobs: int
    total_invite_jobs: int
    total_accounts_connected: int
    total_basic_users: int
    total_pro_users: int
    total_premium_users: int
    total_owner_users: int
    total_redeem_codes: int = 0
    total_redeemed: int = 0

    # Accounts Connected Breakdown
    accounts_active: int = 0
    accounts_selling: int = 0
    accounts_expired: int = 0
    accounts_limited: int = 0

    # Broadcast Jobs Breakdown
    broadcast_running: int = 0
    broadcast_stopped: int = 0
    broadcast_completed: int = 0
    broadcast_failed: int = 0

    # Invite Jobs Breakdown
    invite_running: int = 0
    invite_stopped: int = 0

    # Auto-Reply Jobs Breakdown
    total_auto_reply_jobs: int = 0
    auto_reply_running: int = 0
    auto_reply_stopped: int = 0
    total_auto_reply_sent: int = 0

    # Onboarding Breakdown
    onboarding_completed_count: int = 0
    onboarding_completion_rate: float = 0.0


class AdminAutoReplyAccountResponse(BaseModel):
    id: UUID
    user_id: UUID
    user_email: str | None = None
    user_full_name: str | None = None
    phone: str
    first_name: str | None = None
    last_name: str | None = None
    username: str | None = None
    auto_reply_enabled: bool
    auto_reply_text: str | None = None
    is_active: bool
    status: str  # "running", "stopped", "disabled"
    total_replied: int = 0
    last_replied_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class AdminAutoReplyListResponse(BaseModel):
    items: list[AdminAutoReplyAccountResponse]
    total: int
    running_count: int = 0
    stopped_count: int = 0
    total_sent: int = 0


class BalanceHistoryResponse(BaseModel):
    user_id: UUID
    email: str
    balance: int
    message: str


__all__ = [
    "BroadcastAccountInfo",
    "BroadcastAdminJobResponse",
    "BroadcastAdminListResponse",
    "BroadcastAdminStatsResponse",
    "BroadcastBulkActionRequest",
    "UpdateBalanceRequest",
    "UpdateRoleRequest",
    "UserAdminResponse",
    "SuspendUserRequest",
    "UserAdminListResponse",
    "AdminStatsResponse",
    "AdminAutoReplyAccountResponse",
    "AdminAutoReplyListResponse",
    "BalanceHistoryResponse",
]
