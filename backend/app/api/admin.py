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
from app.models.group_list import GroupList
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
from app.services import broadcast_service
from pydantic import BaseModel, Field

router = APIRouter(prefix="/admin", tags=["admin"])


# ── Schemas ──────────────────────────────────────────────────────────────────


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
    action: str = Field(..., description="pause_all_running, stop_all_running, delete_completed_failed, delete_selected")
    job_ids: list[str] = Field(default_factory=list, description="List of job IDs if action is delete_selected")


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

    # Accounts Connected Breakdown
    accounts_active: int = 0
    accounts_selling: int = 0
    accounts_expired: int = 0

    # Broadcast Jobs Breakdown
    broadcast_running: int = 0
    broadcast_stopped: int = 0

    # Invite Jobs Breakdown
    invite_running: int = 0
    invite_stopped: int = 0


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

    bj_running_result = await db.execute(select(func.count(BroadcastJob.id)).where(BroadcastJob.status == "running"))
    broadcast_running = bj_running_result.scalar() or 0
    broadcast_stopped = total_broadcast_jobs - broadcast_running

    # Total invite jobs
    ij_count_result = await db.execute(select(func.count(InviteJob.id)))
    total_invite_jobs = ij_count_result.scalar() or 0

    ij_running_result = await db.execute(select(func.count(InviteJob.id)).where(InviteJob.status == "running"))
    invite_running = ij_running_result.scalar() or 0
    invite_stopped = total_invite_jobs - invite_running

    # Total connected accounts (phone_verified = True)
    ta_count_result = await db.execute(
        select(func.count(TelegramAccount.id)).where(
            TelegramAccount.phone_verified.is_(True)
        )
    )
    total_accounts_connected = ta_count_result.scalar() or 0

    # Active accounts (phone_verified = True and is_active = True)
    ta_active_result = await db.execute(
        select(func.count(TelegramAccount.id)).where(
            TelegramAccount.phone_verified.is_(True),
            TelegramAccount.is_active.is_(True),
        )
    )
    accounts_active = ta_active_result.scalar() or 0

    # Selling accounts (phone_verified = True and is_active = True and for_sale = True)
    ta_selling_result = await db.execute(
        select(func.count(TelegramAccount.id)).where(
            TelegramAccount.phone_verified.is_(True),
            TelegramAccount.is_active.is_(True),
            TelegramAccount.for_sale.is_(True),
        )
    )
    accounts_selling = ta_selling_result.scalar() or 0

    # Expired accounts (phone_verified = True and is_active = False)
    ta_expired_result = await db.execute(
        select(func.count(TelegramAccount.id)).where(
            TelegramAccount.phone_verified.is_(True),
            TelegramAccount.is_active.is_(False),
        )
    )
    accounts_expired = ta_expired_result.scalar() or 0

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
        accounts_active=accounts_active,
        accounts_selling=accounts_selling,
        accounts_expired=accounts_expired,
        broadcast_running=broadcast_running,
        broadcast_stopped=broadcast_stopped,
        invite_running=invite_running,
        invite_stopped=invite_stopped,
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

    # RES-03: Cleanup Telegram accounts in client pool and cached avatar files before user deletion
    import os
    from app.config import get_settings
    from app.services.telegram_client import client_pool
    settings = get_settings()

    acc_result = await db.execute(select(TelegramAccount).where(TelegramAccount.user_id == user.id))
    user_accounts = acc_result.scalars().all()
    for acc in user_accounts:
        try:
            await client_pool.remove(str(acc.id), save_state=False)
        except Exception:
            pass
        photo_path = os.path.join(settings.UPLOAD_DIR, "profile_photos", f"{acc.id}.jpg")
        if os.path.exists(photo_path):
            try:
                os.remove(photo_path)
            except OSError:
                pass

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


# ── Broadcast Management Endpoints ───────────────────────────────────────────


@router.get("/broadcasts", response_model=BroadcastAdminListResponse)
async def list_admin_broadcasts(
    search: str | None = Query(None),
    status: str | None = Query(None),
    loop_enabled: bool | None = Query(None),
    duplicates_only: bool | None = Query(None),
    user_id: str | None = Query(None),
    sort_by: str = Query("updated_at"),
    sort_order: str = Query("desc"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """List all broadcast jobs across all users with filters, sorting, duplicate account detection, and pagination. Owner only."""
    offset = (page - 1) * limit

    # First, detect duplicate account usage across all active/pending/running/paused jobs
    active_jobs_stmt = select(BroadcastJob.id, BroadcastJob.account_ids, BroadcastJob.status).where(
        BroadcastJob.status.in_(["running", "paused", "pending"])
    )
    active_jobs_res = await db.execute(active_jobs_stmt)
    active_jobs = active_jobs_res.all()

    account_to_active_jobs: dict[str, list[dict]] = {}
    for aj_id, aj_acc_ids, aj_status in active_jobs:
        if isinstance(aj_acc_ids, list):
            for aid in aj_acc_ids:
                aid_str = str(aid)
                if aid_str not in account_to_active_jobs:
                    account_to_active_jobs[aid_str] = []
                account_to_active_jobs[aid_str].append({"job_id": aj_id, "status": aj_status})

    # Jobs that share at least one account with another active job
    conflicting_job_ids: set[UUID] = set()
    for aid_str, job_list in account_to_active_jobs.items():
        if len(job_list) > 1:
            for j in job_list:
                conflicting_job_ids.add(j["job_id"])

    stmt = (
        select(
            BroadcastJob,
            User.email.label("user_email"),
            User.full_name.label("user_full_name"),
            GroupList.name.label("group_list_name"),
        )
        .outerjoin(User, BroadcastJob.user_id == User.id)
        .outerjoin(GroupList, BroadcastJob.group_list_id == GroupList.id)
    )
    count_stmt = (
        select(func.count(BroadcastJob.id))
        .outerjoin(User, BroadcastJob.user_id == User.id)
        .outerjoin(GroupList, BroadcastJob.group_list_id == GroupList.id)
    )

    if status and status != "all":
        stmt = stmt.where(BroadcastJob.status == status)
        count_stmt = count_stmt.where(BroadcastJob.status == status)

    if loop_enabled is not None:
        stmt = stmt.where(BroadcastJob.loop_enabled == loop_enabled)
        count_stmt = count_stmt.where(BroadcastJob.loop_enabled == loop_enabled)

    if duplicates_only:
        if not conflicting_job_ids:
            return BroadcastAdminListResponse(jobs=[], total=0)
        stmt = stmt.where(BroadcastJob.id.in_(list(conflicting_job_ids)))
        count_stmt = count_stmt.where(BroadcastJob.id.in_(list(conflicting_job_ids)))

    if user_id:
        try:
            u_uuid = UUID(user_id)
            stmt = stmt.where(BroadcastJob.user_id == u_uuid)
            count_stmt = count_stmt.where(BroadcastJob.user_id == u_uuid)
        except ValueError:
            pass

    if search:
        search_val = search.replace("%", "\\%").replace("_", "\\_").strip()
        search_pattern = f"%{search_val}%"
        try:
            search_uuid = UUID(search.strip())
            stmt = stmt.where(
                (BroadcastJob.id == search_uuid)
                | (User.email.ilike(search_pattern, escape="\\"))
                | (User.full_name.ilike(search_pattern, escape="\\"))
                | (GroupList.name.ilike(search_pattern, escape="\\"))
            )
            count_stmt = count_stmt.where(
                (BroadcastJob.id == search_uuid)
                | (User.email.ilike(search_pattern, escape="\\"))
                | (User.full_name.ilike(search_pattern, escape="\\"))
                | (GroupList.name.ilike(search_pattern, escape="\\"))
            )
        except ValueError:
            stmt = stmt.where(
                (User.email.ilike(search_pattern, escape="\\"))
                | (User.full_name.ilike(search_pattern, escape="\\"))
                | (GroupList.name.ilike(search_pattern, escape="\\"))
            )
            count_stmt = count_stmt.where(
                (User.email.ilike(search_pattern, escape="\\"))
                | (User.full_name.ilike(search_pattern, escape="\\"))
                | (GroupList.name.ilike(search_pattern, escape="\\"))
            )

    total_res = await db.execute(count_stmt)
    total = total_res.scalar() or 0

    # Sorting
    sort_column = BroadcastJob.updated_at
    if sort_by == "sent_count":
        sort_column = BroadcastJob.sent_count
    elif sort_by == "fail_count":
        sort_column = BroadcastJob.fail_count
    elif sort_by == "progress":
        sort_column = BroadcastJob.progress
    elif sort_by == "created_at":
        sort_column = BroadcastJob.created_at
    elif sort_by == "total_groups":
        sort_column = BroadcastJob.total_groups

    if sort_order == "asc":
        stmt = stmt.order_by(sort_column.asc())
    else:
        stmt = stmt.order_by(sort_column.desc())

    stmt = stmt.offset(offset).limit(limit)
    res = await db.execute(stmt)
    rows = res.all()

    # Collect all account UUIDs across the page of jobs to batch resolve names & Telegram IDs
    all_account_uuids = set()
    for row in rows:
        job = row[0]
        if isinstance(job.account_ids, list):
            for aid in job.account_ids:
                try:
                    all_account_uuids.add(UUID(str(aid)))
                except (ValueError, TypeError):
                    pass

    accounts_map: dict[str, BroadcastAccountInfo] = {}
    if all_account_uuids:
        acc_stmt = select(TelegramAccount).where(TelegramAccount.id.in_(list(all_account_uuids)))
        acc_res = await db.execute(acc_stmt)
        for acc in acc_res.scalars().all():
            full_name = f"{acc.first_name or ''} {acc.last_name or ''}".strip()
            name_display = full_name or acc.username or acc.phone
            accounts_map[str(acc.id)] = BroadcastAccountInfo(
                id=acc.id,
                telegram_id=acc.telegram_id,
                phone=acc.phone,
                name=name_display,
                username=acc.username,
            )

    jobs_response = []
    for row in rows:
        job, u_email, u_name, gl_name = row
        acc_ids = job.account_ids or []
        job_accounts = []
        dup_account_count = 0
        conflicting_other_job_ids = set()

        if isinstance(acc_ids, list):
            for aid in acc_ids:
                aid_str = str(aid)
                acc_info = accounts_map.get(aid_str)
                
                # Check duplicate active jobs for this specific account
                other_active_jobs = [
                    j["job_id"]
                    for j in account_to_active_jobs.get(aid_str, [])
                    if j["job_id"] != job.id
                ]
                is_dup = len(other_active_jobs) > 0
                if is_dup:
                    dup_account_count += 1
                    for ojid in other_active_jobs:
                        conflicting_other_job_ids.add(ojid)

                if acc_info:
                    job_accounts.append(
                        BroadcastAccountInfo(
                            id=acc_info.id,
                            telegram_id=acc_info.telegram_id,
                            phone=acc_info.phone,
                            name=acc_info.name,
                            username=acc_info.username,
                            is_duplicate=is_dup,
                            conflicting_job_ids=other_active_jobs,
                        )
                    )

        acc_count = len(acc_ids) if isinstance(acc_ids, list) else 0
        has_dup = len(conflicting_other_job_ids) > 0

        jobs_response.append(
            BroadcastAdminJobResponse(
                id=job.id,
                user_id=job.user_id,
                user_email=u_email,
                user_full_name=u_name,
                group_list_id=job.group_list_id,
                group_list_name=gl_name,
                text_list_id=job.text_list_id,
                mode=job.mode,
                custom_text=job.custom_text,
                status=job.status,
                progress=job.progress,
                total_groups=job.total_groups,
                sent_count=job.sent_count,
                fail_count=job.fail_count,
                delay_per_group=job.delay_per_group,
                delay_after_all=job.delay_after_all,
                loop_enabled=job.loop_enabled,
                delay_randomized=job.delay_randomized,
                log_destination=job.log_destination,
                account_count=acc_count,
                accounts=job_accounts,
                has_duplicate_accounts=has_dup,
                duplicate_account_count=dup_account_count,
                duplicate_job_ids=list(conflicting_other_job_ids),
                created_at=job.created_at,
                updated_at=job.updated_at,
                completed_at=job.completed_at,
            )
        )

    return BroadcastAdminListResponse(jobs=jobs_response, total=total)


@router.get("/broadcasts/stats", response_model=BroadcastAdminStatsResponse)
async def get_admin_broadcast_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """Get system-wide aggregate broadcast metrics. Owner only."""
    total_q = await db.execute(select(func.count(BroadcastJob.id)))
    total_jobs = total_q.scalar() or 0

    running_q = await db.execute(select(func.count(BroadcastJob.id)).where(BroadcastJob.status == "running"))
    running_jobs = running_q.scalar() or 0

    paused_q = await db.execute(select(func.count(BroadcastJob.id)).where(BroadcastJob.status == "paused"))
    paused_jobs = paused_q.scalar() or 0

    completed_q = await db.execute(select(func.count(BroadcastJob.id)).where(BroadcastJob.status == "completed"))
    completed_jobs = completed_q.scalar() or 0

    failed_q = await db.execute(select(func.count(BroadcastJob.id)).where(BroadcastJob.status == "failed"))
    failed_jobs = failed_q.scalar() or 0

    cancelled_q = await db.execute(select(func.count(BroadcastJob.id)).where(BroadcastJob.status == "cancelled"))
    cancelled_jobs = cancelled_q.scalar() or 0

    sent_q = await db.execute(select(func.coalesce(func.sum(BroadcastJob.sent_count), 0)))
    total_sent = int(sent_q.scalar() or 0)

    fail_q = await db.execute(select(func.coalesce(func.sum(BroadcastJob.fail_count), 0)))
    total_failed = int(fail_q.scalar() or 0)

    looping_q = await db.execute(
        select(func.count(BroadcastJob.id)).where(
            BroadcastJob.status.in_(["running", "paused"]),
            BroadcastJob.loop_enabled.is_(True),
        )
    )
    active_looping_jobs = looping_q.scalar() or 0

    # Calculate duplicate active conflict jobs
    active_jobs_stmt = select(BroadcastJob.id, BroadcastJob.account_ids).where(
        BroadcastJob.status.in_(["running", "paused", "pending"])
    )
    active_jobs_res = await db.execute(active_jobs_stmt)
    active_jobs = active_jobs_res.all()

    account_to_active_jobs: dict[str, list[UUID]] = {}
    for aj_id, aj_acc_ids in active_jobs:
        if isinstance(aj_acc_ids, list):
            for aid in aj_acc_ids:
                aid_str = str(aid)
                if aid_str not in account_to_active_jobs:
                    account_to_active_jobs[aid_str] = []
                account_to_active_jobs[aid_str].append(aj_id)

    conflicting_job_ids: set[UUID] = set()
    for aid_str, job_list in account_to_active_jobs.items():
        if len(job_list) > 1:
            for jid in job_list:
                conflicting_job_ids.add(jid)

    return BroadcastAdminStatsResponse(
        total_jobs=total_jobs,
        running_jobs=running_jobs,
        paused_jobs=paused_jobs,
        completed_jobs=completed_jobs,
        failed_jobs=failed_jobs,
        cancelled_jobs=cancelled_jobs,
        total_sent=total_sent,
        total_failed=total_failed,
        active_looping_jobs=active_looping_jobs,
        duplicate_conflict_jobs=len(conflicting_job_ids),
    )


@router.post("/broadcasts/{job_id}/pause")
async def admin_pause_broadcast(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """Admin pause any running broadcast job."""
    try:
        job_uuid = UUID(job_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid job ID format")

    res = await db.execute(select(BroadcastJob).where(BroadcastJob.id == job_uuid))
    job = res.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Broadcast job not found")

    if job.status != "running":
        raise HTTPException(status_code=400, detail=f"Cannot pause job with status '{job.status}'")

    await broadcast_service.update_job_status(db, job, "paused")
    await db.commit()
    return {"message": "Job paused successfully", "job_id": job_id, "status": "paused"}


@router.post("/broadcasts/{job_id}/resume")
async def admin_resume_broadcast(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """Admin resume any paused broadcast job."""
    try:
        job_uuid = UUID(job_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid job ID format")

    res = await db.execute(select(BroadcastJob).where(BroadcastJob.id == job_uuid))
    job = res.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Broadcast job not found")

    if job.status != "paused":
        raise HTTPException(status_code=400, detail=f"Cannot resume job with status '{job.status}'")

    await broadcast_service.update_job_status(db, job, "running")
    await db.commit()

    # Re-spawn in-memory background task if not running
    job_id_str = str(job.id)
    if job_id_str not in broadcast_service._running_tasks or broadcast_service._running_tasks[job_id_str].done():
        import asyncio
        async def _safe_execute():
            try:
                await broadcast_service.execute_broadcast(job_id_str)
            except Exception as exc:
                import logging
                logging.getLogger(__name__).exception("Background broadcast task %s crashed: %s", job_id_str, exc)
            finally:
                broadcast_service._running_tasks.pop(job_id_str, None)
                broadcast_service.clear_job_event(job_id_str)

        task = asyncio.create_task(_safe_execute())
        broadcast_service._running_tasks[job_id_str] = task

    return {"message": "Job resumed successfully", "job_id": job_id, "status": "running"}


@router.post("/broadcasts/{job_id}/stop")
async def admin_stop_broadcast(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """Admin stop/cancel any active or paused broadcast job."""
    try:
        job_uuid = UUID(job_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid job ID format")

    res = await db.execute(select(BroadcastJob).where(BroadcastJob.id == job_uuid))
    job = res.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Broadcast job not found")

    if job.status not in ("running", "paused", "pending"):
        raise HTTPException(status_code=400, detail=f"Cannot stop job with status '{job.status}'")

    await broadcast_service.update_job_status(db, job, "cancelled")
    await db.commit()
    return {"message": "Job stopped successfully", "job_id": job_id, "status": "cancelled"}


@router.delete("/broadcasts/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_broadcast(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """Admin delete any broadcast job and cascade logs. Cancels task first if running."""
    try:
        job_uuid = UUID(job_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid job ID format")

    res = await db.execute(select(BroadcastJob).where(BroadcastJob.id == job_uuid))
    job = res.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Broadcast job not found")

    if job.status in ("running", "paused", "pending"):
        await broadcast_service.update_job_status(db, job, "cancelled")
        await db.flush()

    await db.delete(job)
    await db.commit()


@router.post("/broadcasts/bulk-action")
async def admin_bulk_broadcast_action(
    payload: BroadcastBulkActionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """Admin bulk actions on broadcast jobs: pause_all_running, stop_all_running, delete_completed_failed, delete_selected."""
    action = payload.action

    if action == "pause_all_running":
        res = await db.execute(select(BroadcastJob).where(BroadcastJob.status == "running"))
        jobs = res.scalars().all()
        for j in jobs:
            await broadcast_service.update_job_status(db, j, "paused")
        await db.commit()
        return {"message": f"Paused {len(jobs)} running jobs", "count": len(jobs)}

    elif action == "stop_all_running":
        res = await db.execute(
            select(BroadcastJob).where(BroadcastJob.status.in_(["running", "paused", "pending"]))
        )
        jobs = res.scalars().all()
        for j in jobs:
            await broadcast_service.update_job_status(db, j, "cancelled")
        await db.commit()
        return {"message": f"Stopped {len(jobs)} active jobs", "count": len(jobs)}

    elif action == "delete_completed_failed":
        from sqlalchemy import delete
        del_res = await db.execute(
            delete(BroadcastJob).where(
                BroadcastJob.status.in_(["completed", "failed", "cancelled"])
            )
        )
        await db.commit()
        return {"message": f"Deleted {del_res.rowcount} finished jobs", "count": del_res.rowcount}

    elif action == "delete_selected":
        if not payload.job_ids:
            raise HTTPException(status_code=400, detail="No job IDs specified")

        valid_uuids = []
        for jid in payload.job_ids:
            try:
                valid_uuids.append(UUID(jid))
            except ValueError:
                continue

        res = await db.execute(select(BroadcastJob).where(BroadcastJob.id.in_(valid_uuids)))
        jobs = res.scalars().all()
        for j in jobs:
            if j.status in ("running", "paused", "pending"):
                await broadcast_service.update_job_status(db, j, "cancelled")
            await db.delete(j)
        await db.commit()
        return {"message": f"Deleted {len(jobs)} selected jobs", "count": len(jobs)}

    else:
        raise HTTPException(status_code=400, detail=f"Unknown bulk action '{action}'")

