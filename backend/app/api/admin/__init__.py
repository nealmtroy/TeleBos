"""Admin API router package — modular decomposition of administrative management endpoints."""

from fastapi import APIRouter

from app.api.admin.auto_replies import (
    list_admin_auto_replies,
    router as auto_replies_router,
    toggle_admin_auto_reply,
)
from app.api.admin.broadcasts import (
    admin_bulk_broadcast_action,
    admin_delete_broadcast,
    admin_pause_broadcast,
    admin_resume_broadcast,
    admin_stop_broadcast,
    get_admin_broadcast_stats,
    list_admin_broadcasts,
    router as broadcasts_router,
)
from app.api.admin.redeem import (
    create_redeem_code,
    delete_redeem_code,
    list_redeem_codes,
    list_redeem_logs,
    router as redeem_router,
)
from app.api.admin.system import (
    get_admin_stats,
    get_onboarding_analytics,
    router as system_router,
)
from app.api.admin.users import (
    delete_user,
    list_users,
    router as users_router,
    suspend_user,
    unsuspend_user,
    update_user_balance,
    update_user_role,
)
from app.schemas.admin import (
    AdminAutoReplyAccountResponse,
    AdminAutoReplyListResponse,
    AdminStatsResponse,
    BalanceHistoryResponse,
    BroadcastAccountInfo,
    BroadcastAdminJobResponse,
    BroadcastAdminListResponse,
    BroadcastAdminStatsResponse,
    BroadcastBulkActionRequest,
    SuspendUserRequest,
    UpdateBalanceRequest,
    UpdateRoleRequest,
    UserAdminListResponse,
    UserAdminResponse,
)

router = APIRouter(prefix="/admin", tags=["admin"])

router.include_router(system_router)
router.include_router(users_router)
router.include_router(redeem_router)
router.include_router(broadcasts_router)
router.include_router(auto_replies_router)

__all__ = [
    "router",
    # System & Onboarding
    "get_admin_stats",
    "get_onboarding_analytics",
    # Users
    "list_users",
    "update_user_balance",
    "update_user_role",
    "suspend_user",
    "unsuspend_user",
    "delete_user",
    # Redeem
    "list_redeem_codes",
    "create_redeem_code",
    "delete_redeem_code",
    "list_redeem_logs",
    # Broadcasts
    "list_admin_broadcasts",
    "get_admin_broadcast_stats",
    "admin_pause_broadcast",
    "admin_resume_broadcast",
    "admin_stop_broadcast",
    "admin_delete_broadcast",
    "admin_bulk_broadcast_action",
    # Auto-Replies
    "list_admin_auto_replies",
    "toggle_admin_auto_reply",
    # Schemas
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
