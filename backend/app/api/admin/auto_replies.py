"""Admin auto-reply monitoring, statistics, and remote toggle endpoints."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_role
from app.models.auto_reply_log import AutoReplyLog
from app.models.telegram_account import TelegramAccount
from app.models.user import User
from app.schemas.admin import (
    AdminAutoReplyAccountResponse,
    AdminAutoReplyListResponse,
)

router = APIRouter()


@router.get("/auto-replies", response_model=AdminAutoReplyListResponse)
async def list_admin_auto_replies(
    search: str | None = Query(None),
    status: str | None = Query("all", description="all, running, stopped, disabled"),
    user_id: str | None = Query(None),
    sort_by: str = Query(
        "updated_at",
        description="updated_at, phone, total_replied, last_replied_at",
    ),
    sort_order: str = Query("desc", description="asc, desc"),
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """List all accounts with auto-reply configured across users, with stats, search, and pagination. Owner only."""
    page_val = page if isinstance(page, int) else 1
    limit_val = limit if isinstance(limit, int) else 10
    offset = (page_val - 1) * limit_val

    status_str = status if isinstance(status, str) else "all"
    search_str = search if isinstance(search, str) and search.strip() else None
    user_id_str = user_id if isinstance(user_id, str) and user_id.strip() else None
    sort_by_str = sort_by if isinstance(sort_by, str) else "updated_at"
    sort_order_str = sort_order if isinstance(sort_order, str) else "desc"

    # Subquery for reply stats per account
    reply_stats = (
        select(
            AutoReplyLog.account_id,
            func.count(AutoReplyLog.id).label("total_replied"),
            func.max(AutoReplyLog.replied_at).label("last_replied_at"),
        )
        .group_by(AutoReplyLog.account_id)
        .subquery()
    )

    base_query = (
        select(
            TelegramAccount,
            User.email.label("user_email"),
            User.full_name.label("user_full_name"),
            func.coalesce(reply_stats.c.total_replied, 0).label("total_replied"),
            reply_stats.c.last_replied_at.label("last_replied_at"),
        )
        .outerjoin(User, TelegramAccount.user_id == User.id)
        .outerjoin(reply_stats, TelegramAccount.id == reply_stats.c.account_id)
        .where(TelegramAccount.phone_verified.is_(True))
    )

    count_query = (
        select(func.count(TelegramAccount.id))
        .outerjoin(User, TelegramAccount.user_id == User.id)
        .where(TelegramAccount.phone_verified.is_(True))
    )

    if status_str == "running":
        base_query = base_query.where(
            TelegramAccount.auto_reply_enabled.is_(True),
            TelegramAccount.is_active.is_(True),
        )
        count_query = count_query.where(
            TelegramAccount.auto_reply_enabled.is_(True),
            TelegramAccount.is_active.is_(True),
        )
    elif status_str == "stopped":
        base_query = base_query.where(
            TelegramAccount.auto_reply_enabled.is_(True),
            TelegramAccount.is_active.is_(False),
        )
        count_query = count_query.where(
            TelegramAccount.auto_reply_enabled.is_(True),
            TelegramAccount.is_active.is_(False),
        )
    elif status_str == "disabled":
        base_query = base_query.where(
            TelegramAccount.auto_reply_enabled.is_(False)
        )
        count_query = count_query.where(
            TelegramAccount.auto_reply_enabled.is_(False)
        )
    else:  # "all" - shows accounts that have auto reply enabled
        base_query = base_query.where(
            TelegramAccount.auto_reply_enabled.is_(True)
        )
        count_query = count_query.where(
            TelegramAccount.auto_reply_enabled.is_(True)
        )

    if user_id_str:
        try:
            u_uuid = UUID(user_id_str)
            base_query = base_query.where(TelegramAccount.user_id == u_uuid)
            count_query = count_query.where(TelegramAccount.user_id == u_uuid)
        except ValueError:
            pass

    if search_str:
        search_val = search_str.replace("%", "\\%").replace("_", "\\_").strip()
        search_pat = f"%{search_val}%"
        search_filter = (
            TelegramAccount.phone.ilike(search_pat, escape="\\")
            | TelegramAccount.first_name.ilike(search_pat, escape="\\")
            | TelegramAccount.last_name.ilike(search_pat, escape="\\")
            | TelegramAccount.username.ilike(search_pat, escape="\\")
            | TelegramAccount.auto_reply_text.ilike(search_pat, escape="\\")
            | User.email.ilike(search_pat, escape="\\")
            | User.full_name.ilike(search_pat, escape="\\")
        )
        base_query = base_query.where(search_filter)
        count_query = count_query.where(search_filter)

    if sort_by_str == "phone":
        order_col = TelegramAccount.phone
    elif sort_by_str == "total_replied":
        order_col = func.coalesce(reply_stats.c.total_replied, 0)
    elif sort_by_str == "last_replied_at":
        order_col = reply_stats.c.last_replied_at
    else:
        order_col = TelegramAccount.updated_at

    if sort_order_str == "asc":
        base_query = base_query.order_by(order_col.asc().nulls_last())
    else:
        base_query = base_query.order_by(order_col.desc().nulls_last())

    total_res = await db.execute(count_query)
    total = total_res.scalar() or 0

    results = await db.execute(base_query.offset(offset).limit(limit_val))
    rows = results.all()

    # Overall stats
    running_res = await db.execute(
        select(func.count(TelegramAccount.id)).where(
            TelegramAccount.phone_verified.is_(True),
            TelegramAccount.auto_reply_enabled.is_(True),
            TelegramAccount.is_active.is_(True),
        )
    )
    running_count = running_res.scalar() or 0

    total_enabled_res = await db.execute(
        select(func.count(TelegramAccount.id)).where(
            TelegramAccount.phone_verified.is_(True),
            TelegramAccount.auto_reply_enabled.is_(True),
        )
    )
    total_enabled = total_enabled_res.scalar() or 0
    stopped_count = max(0, total_enabled - running_count)

    sent_res = await db.execute(select(func.count(AutoReplyLog.id)))
    total_sent = sent_res.scalar() or 0

    items = []
    for acc, u_email, u_name, t_replied, l_replied in rows:
        if not acc.auto_reply_enabled:
            item_status = "disabled"
        elif acc.is_active:
            item_status = "running"
        else:
            item_status = "stopped"

        items.append(
            AdminAutoReplyAccountResponse(
                id=acc.id,
                user_id=acc.user_id,
                user_email=u_email,
                user_full_name=u_name,
                phone=acc.phone,
                first_name=acc.first_name,
                last_name=acc.last_name,
                username=acc.username,
                auto_reply_enabled=acc.auto_reply_enabled,
                auto_reply_text=acc.auto_reply_text,
                is_active=acc.is_active,
                status=item_status,
                total_replied=t_replied or 0,
                last_replied_at=l_replied,
                created_at=acc.created_at,
                updated_at=acc.updated_at,
            )
        )

    return AdminAutoReplyListResponse(
        items=items,
        total=total,
        running_count=running_count,
        stopped_count=stopped_count,
        total_sent=total_sent,
    )


@router.post("/auto-replies/{account_id}/toggle")
async def toggle_admin_auto_reply(
    account_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """Toggle auto-reply state for a telegram account. Owner only."""
    res = await db.execute(
        select(TelegramAccount).where(TelegramAccount.id == account_id)
    )
    acc = res.scalar_one_or_none()
    if not acc:
        raise HTTPException(
            status_code=404, detail="Telegram account not found"
        )

    acc.auto_reply_enabled = not acc.auto_reply_enabled
    await db.commit()
    return {
        "message": f"Auto-reply set to {acc.auto_reply_enabled}",
        "account_id": acc.id,
        "auto_reply_enabled": acc.auto_reply_enabled,
    }
