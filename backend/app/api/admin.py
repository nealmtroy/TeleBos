"""Admin endpoints — user management, balance management, role management, redeem codes."""

from uuid import UUID
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, require_role
from app.models.user import User
from app.utils.rate_limiter import rate_limiter
from app.utils.sanitize import sanitize_exception
from app.models.order import Order
from app.models.broadcast_job import BroadcastJob
from app.models.invite_job import InviteJob
from app.models.telegram_account import TelegramAccount
from app.models.redeem_code import RedeemCode
from app.models.redeem_log import RedeemLog
from app.schemas.redeem import (
    RedeemCodeCreate as RedeemCodeCreateSchema,
    RedeemCodeResponse,
    RedeemCodeListResponse,
    RedeemLogResponse,
    RedeemLogListResponse,
)
from pydantic import BaseModel, Field

router = APIRouter(prefix="/admin", tags=["admin"])


# ── Schemas ──────────────────────────────────────────────────────────────────


class UpdateBalanceRequest(BaseModel):
    user_id: str = Field(..., description="UUID of the user")
    amount: int = Field(..., description="Amount to add (positive) or deduct (negative)")


class UpdateRoleRequest(BaseModel):
    user_id: str
    role: str = Field(..., description="New role: owner, premium, pro, basic")


class UserAdminResponse(BaseModel):
    id: UUID
    email: str
    full_name: str | None
    role: str
    balance: int
    is_active: bool
    order_count: int = 0
    created_at: datetime | None = None

    model_config = {"from_attributes": True}



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


class BalanceHistoryResponse(BaseModel):
    user_id: UUID
    email: str
    balance: int
    message: str


# ── Endpoints ────────────────────────────────────────────────────────────────


@router.get("/stats", response_model=AdminStatsResponse)
async def get_admin_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """Get overview statistics for the admin dashboard. Owner only."""
    # Total users
    user_count_result = await db.execute(select(func.count(User.id)))
    total_users = user_count_result.scalar() or 0

    # Total broadcast jobs
    bj_count_result = await db.execute(select(func.count(BroadcastJob.id)))
    total_broadcast_jobs = bj_count_result.scalar() or 0

    # Total invite jobs
    ij_count_result = await db.execute(select(func.count(InviteJob.id)))
    total_invite_jobs = ij_count_result.scalar() or 0

    # Total connected accounts (phone_verified = true AND is_active = true)
    ta_count_result = await db.execute(
        select(func.count(TelegramAccount.id)).where(
            TelegramAccount.phone_verified == True,
            TelegramAccount.is_active == True,
        )
    )
    total_accounts_connected = ta_count_result.scalar() or 0

    # Count users by role
    role_counts = {"basic": 0, "pro": 0, "premium": 0, "owner": 0}
    for role in role_counts:
        r = await db.execute(
            select(func.count(User.id)).where(User.role == role)
        )
        role_counts[role] = r.scalar() or 0

    # Redeem code stats
    rc_count = await db.execute(select(func.count(RedeemCode.id)))
    total_redeem_codes = rc_count.scalar() or 0

    rl_count = await db.execute(select(func.count(RedeemLog.id)))
    total_redeemed = rl_count.scalar() or 0

    return AdminStatsResponse(
        total_users=total_users,
        total_broadcast_jobs=total_broadcast_jobs,
        total_invite_jobs=total_invite_jobs,
        total_accounts_connected=total_accounts_connected,
        total_basic_users=role_counts["basic"],
        total_pro_users=role_counts["pro"],
        total_premium_users=role_counts["premium"],
        total_owner_users=role_counts["owner"],
        total_redeem_codes=total_redeem_codes,
        total_redeemed=total_redeemed,
    )


@router.get("/users", response_model=UserAdminListResponse)
async def list_users(
    search: str | None = Query(None),
    limit: int = Query(10, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """List all users with search. Owner only."""
    query = select(User)
    count_query = select(func.count(User.id))

    if search:
        search_filter = User.email.ilike(f"%{search}%") | User.full_name.ilike(f"%{search}%")
        query = query.where(search_filter)
        count_query = count_query.where(search_filter)

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    query = query.order_by(User.created_at.desc()).offset(offset).limit(limit)
    result = await db.execute(query)
    users = list(result.scalars().all())

    # Get order counts
    user_ids = [u.id for u in users]
    if user_ids:
        count_q = select(Order.user_id, func.count(Order.id)).where(
            Order.user_id.in_(user_ids)
        ).group_by(Order.user_id)
        count_result = await db.execute(count_q)
        order_counts = {row[0]: row[1] for row in count_result}
    else:
        order_counts = {}

    response_users = []
    for u in users:
        ru = UserAdminResponse.model_validate(u)
        ru.order_count = order_counts.get(u.id, 0)
        ru.created_at = u.created_at.isoformat() if u.created_at else None
        response_users.append(ru)

    return UserAdminListResponse(users=response_users, total=total)


@router.post("/users/balance", response_model=BalanceHistoryResponse)
async def update_user_balance(
    request: Request,
    payload: UpdateBalanceRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """Add or deduct balance from a user. Owner only."""
    ip = request.client.host
    if not await rate_limiter.check(f"admin:ip:{ip}"):
        raise HTTPException(status_code=429, detail="Too many requests. Try later.")
    result = await db.execute(select(User).where(User.id == UUID(payload.user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.balance += payload.amount
    if user.balance < 0:
        user.balance = 0  # Don't allow negative balance

    action = "added to" if payload.amount >= 0 else "deducted from"
    await db.flush()
    return BalanceHistoryResponse(
        user_id=user.id,
        email=user.email,
        balance=user.balance,
        message=f"{abs(payload.amount)} credits {action} {user.email}. New balance: {user.balance}",
    )


@router.put("/users/role", response_model=UserAdminResponse)
async def update_user_role(
    request: Request,
    payload: UpdateRoleRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """Update user role. Owner only."""
    ip = request.client.host
    if not await rate_limiter.check(f"admin:ip:{ip}"):
        raise HTTPException(status_code=429, detail="Too many requests. Try later.")
    if payload.role not in ("owner", "premium", "pro", "basic"):
        raise HTTPException(status_code=400, detail="Invalid role. Must be: owner, premium, pro, basic")

    result = await db.execute(select(User).where(User.id == UUID(payload.user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.role = payload.role
    await db.flush()
    return user


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    request: Request,
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """Delete a user account. Owner only."""
    ip = request.client.host
    if not await rate_limiter.check(f"admin:ip:{ip}"):
        raise HTTPException(status_code=429, detail="Too many requests. Try later.")
    result = await db.execute(select(User).where(User.id == UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    await db.delete(user)
    await db.flush()


# ── Redeem Code Management ──────────────────────────────────────────────────


@router.get("/redeem-codes", response_model=RedeemCodeListResponse)
async def list_redeem_codes(
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """List all redeem codes with search and pagination. Owner only."""
    from app.services.redeem_service import list_redeem_codes as svc_list_codes

    codes, total = await svc_list_codes(db, search, page, limit)

    # Attach creator email
    response_codes = []
    for c in codes:
        rc = RedeemCodeResponse.model_validate(c)
        if c.creator:
            rc.created_by_email = c.creator.email
        response_codes.append(rc)

    return RedeemCodeListResponse(codes=response_codes, total=total)


@router.post("/redeem-codes", response_model=RedeemCodeResponse)
async def create_redeem_code(
    payload: RedeemCodeCreateSchema,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """Create a new redeem code. Owner only."""
    from app.services.redeem_service import create_redeem_code as svc_create

    try:
        code = await svc_create(db, current_user, payload)
        resp = RedeemCodeResponse.model_validate(code)
        resp.created_by_email = current_user.email
        return resp
    except ValueError as e:
        raise HTTPException(status_code=400, detail=sanitize_exception(e))


@router.delete("/redeem-codes/{code_id}")
async def delete_redeem_code(
    code_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """Soft-delete (deactivate) a redeem code. Owner only."""
    from app.services.redeem_service import delete_redeem_code as svc_delete

    try:
        await svc_delete(db, code_id)
        return {"detail": "Code deactivated"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=sanitize_exception(e))


@router.get("/redeem-logs", response_model=RedeemLogListResponse)
async def list_redeem_logs(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """List all redeem logs with pagination. Owner only."""
    from app.services.redeem_service import list_redeem_logs as svc_list_logs

    logs, total = await svc_list_logs(db, page, limit)

    response_logs = []
    for log_entry in logs:
        rl = RedeemLogResponse.model_validate(log_entry)
        if log_entry.redeem_code:
            rl.code = log_entry.redeem_code.code
        if log_entry.user:
            rl.user_email = log_entry.user.email
        response_logs.append(rl)

    return RedeemLogListResponse(logs=response_logs, total=total)
