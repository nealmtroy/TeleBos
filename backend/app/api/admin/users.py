"""Admin user management, role assignment, balance mutation, and suspension endpoints."""

import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import case, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_role
from app.models.broadcast_job import BroadcastJob
from app.models.order import Order
from app.models.telegram_account import TelegramAccount
from app.models.user import User
from app.models.wallet_transaction import WalletTransaction
from app.schemas.admin import (
    BalanceHistoryResponse,
    SuspendUserRequest,
    UpdateBalanceRequest,
    UpdateRoleRequest,
    UserAdminListResponse,
    UserAdminResponse,
)
from app.services.ledger_service import record_ledger_entry
from app.services.notification_service import create_notification
from app.utils.rate_limiter import rate_limiter

logger = logging.getLogger(__name__)

router = APIRouter()


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
        search_filter = User.email.ilike(f"%{search}%") | User.full_name.ilike(
            f"%{search}%"
        )
        query = query.where(search_filter)
        count_query = count_query.where(search_filter)

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    query = query.order_by(User.created_at.desc()).offset(offset).limit(limit)
    result = await db.execute(query)
    users = list(result.scalars().all())

    user_ids = [u.id for u in users]
    if user_ids:
        # Get order counts
        count_q = (
            select(Order.user_id, func.count(Order.id))
            .where(Order.user_id.in_(user_ids))
            .group_by(Order.user_id)
        )
        count_result = await db.execute(count_q)
        order_counts = {row[0]: row[1] for row in count_result}

        # Telegram Account aggregates per user
        acct_q = (
            select(
                TelegramAccount.user_id,
                func.count(TelegramAccount.id).label("connected"),
                func.sum(
                    case((TelegramAccount.is_active.is_(True), 1), else_=0)
                ).label("active"),
                func.sum(
                    case((TelegramAccount.is_active.is_(False), 1), else_=0)
                ).label("expired"),
                func.sum(
                    case(
                        (
                            TelegramAccount.spam_status.in_(
                                [
                                    "limited",
                                    "temporary_limit",
                                    "permanent_limit",
                                ]
                            ),
                            1,
                        ),
                        else_=0,
                    )
                ).label("limited"),
            )
            .where(
                TelegramAccount.user_id.in_(user_ids),
                TelegramAccount.phone_verified.is_(True),
            )
            .group_by(TelegramAccount.user_id)
        )
        acct_res = await db.execute(acct_q)
        acct_stats = {
            row[0]: {
                "connected": int(row[1] or 0),
                "active": int(row[2] or 0),
                "expired": int(row[3] or 0),
                "limited": int(row[4] or 0),
            }
            for row in acct_res
        }

        # Broadcast Job aggregates per user
        bc_q = (
            select(
                BroadcastJob.user_id,
                func.count(BroadcastJob.id).label("total"),
                func.sum(case((BroadcastJob.status == "running", 1), else_=0)).label(
                    "running"
                ),
                func.sum(
                    case(
                        (
                            BroadcastJob.status.in_(["completed", "cancelled"]),
                            1,
                        ),
                        else_=0,
                    )
                ).label("finished"),
                func.sum(case((BroadcastJob.status == "failed", 1), else_=0)).label(
                    "failed"
                ),
            )
            .where(BroadcastJob.user_id.in_(user_ids))
            .group_by(BroadcastJob.user_id)
        )
        bc_res = await db.execute(bc_q)
        bc_stats = {
            row[0]: {
                "total": int(row[1] or 0),
                "running": int(row[2] or 0),
                "finished": int(row[3] or 0),
                "failed": int(row[4] or 0),
            }
            for row in bc_res
        }
    else:
        order_counts = {}
        acct_stats = {}
        bc_stats = {}

    response_users = []
    for u in users:
        ru = UserAdminResponse.model_validate(u)
        ru.order_count = order_counts.get(u.id, 0)
        ru.created_at = u.created_at

        u_acct = acct_stats.get(u.id, {})
        ru.connected_accounts = u_acct.get("connected", 0)
        ru.active_accounts = u_acct.get("active", 0)
        ru.expired_accounts = u_acct.get("expired", 0)
        ru.limited_accounts = u_acct.get("limited", 0)

        u_bc = bc_stats.get(u.id, {})
        ru.broadcast_total = u_bc.get("total", 0)
        ru.broadcast_running = u_bc.get("running", 0)
        ru.broadcast_finished = u_bc.get("finished", 0)
        ru.broadcast_failed = u_bc.get("failed", 0)

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
    # Lock the row so concurrent balance adjustments cannot overwrite each other.
    result = await db.execute(
        select(User).where(User.id == UUID(payload.user_id)).with_for_update()
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if payload.amount == 0:
        raise HTTPException(
            status_code=400, detail="Jumlah perubahan saldo tidak boleh 0."
        )

    action = "added to" if payload.amount > 0 else "deducted from"

    # Persist immutable double-entry ledger mutation and update user balance
    if payload.amount > 0:
        await record_ledger_entry(
            db=db,
            user=user,
            amount=payload.amount,
            entry_type="CREDIT",
            category="admin_adjustment",
            reference_id=str(current_user.id),
            description=f"Admin credit adjustment by {current_user.email}",
        )
    else:
        debit_amount = abs(payload.amount)
        if user.balance < debit_amount:
            raise HTTPException(
                status_code=400,
                detail=f"Saldo user ({user.balance}) tidak mencukupi untuk pengurangan {debit_amount}.",
            )
        await record_ledger_entry(
            db=db,
            user=user,
            amount=debit_amount,
            entry_type="DEBIT",
            category="admin_adjustment",
            reference_id=str(current_user.id),
            description=f"Admin debit adjustment by {current_user.email}",
        )

    # Persist legacy wallet transaction record for UI transaction history
    tx = WalletTransaction(
        user_id=user.id,
        type="admin_adjustment",
        amount=payload.amount,  # can be positive or negative
        method="Admin System",
        note=f"{'Penambahan' if payload.amount >= 0 else 'Pengurangan'} saldo oleh Admin ({user.email})",
        status="approved",
        admin_note=f"Adjusted by {current_user.email}",
        processed_at=datetime.now(),
    )
    db.add(tx)
    create_notification(
        db,
        user.id,
        "wallet.admin_adjustment",
        kind="info",
        data={
            "amount": payload.amount,
            "new_balance": user.balance,
            "action": "penambahan" if payload.amount >= 0 else "pengurangan",
        },
        href="/wallet",
    )

    try:
        from app.services.security_audit_service import (
            record_security_audit_event,
        )

        await record_security_audit_event(
            db=db,
            action="admin.balance_adjusted",
            actor=current_user,
            target_type="user",
            target_id=str(user.id),
            target_label=user.email,
            outcome="success",
            severity="warning",
            request=request,
            metadata={
                "amount": payload.amount,
                "action": "penambahan" if payload.amount >= 0 else "pengurangan",
                "new_balance": user.balance,
            },
        )
    except Exception:
        pass

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
    if payload.role not in ("owner", "premium", "pro", "basic", "freetrial"):
        raise HTTPException(
            status_code=400,
            detail="Invalid role. Must be: owner, premium, pro, basic, freetrial",
        )

    result = await db.execute(select(User).where(User.id == UUID(payload.user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    old_role = user.role
    user.role = payload.role
    await db.execute(
        text('UPDATE "user" SET role = :role WHERE id = :user_id'),
        {"role": payload.role, "user_id": str(user.id)},
    )

    # Track subscription change in analytics
    try:
        from app.services.analytics_tracking_service import (
            track_subscription_change,
        )

        await track_subscription_change(
            db=db,
            user_id=user.id,
            old_role=old_role,
            new_role=payload.role,
            reason="admin_update",
        )
    except Exception as exc:
        logger.warning(
            "Could not record analytics subscription change event: %s", exc
        )

    try:
        from app.services.security_audit_service import (
            record_security_audit_event,
        )

        await record_security_audit_event(
            db=db,
            action="admin.role_changed",
            actor=current_user,
            target_type="user",
            target_id=str(user.id),
            target_label=user.email,
            outcome="success",
            severity="warning",
            request=request,
            metadata={
                "old_role": old_role,
                "new_role": payload.role,
            },
        )
    except Exception:
        pass

    await db.flush()
    return user


@router.post("/users/{user_id}/suspend", response_model=UserAdminResponse)
async def suspend_user(
    request: Request,
    user_id: str,
    payload: SuspendUserRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """Suspend a user account, revoke active sessions, and disconnect Telegram clients. Owner only."""
    ip = request.client.host
    if not await rate_limiter.check(f"admin:ip:{ip}"):
        raise HTTPException(status_code=429, detail="Too many requests. Try later.")

    result = await db.execute(select(User).where(User.id == UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.id == current_user.id:
        raise HTTPException(
            status_code=400, detail="Cannot suspend your own account"
        )

    if user.role == "owner":
        raise HTTPException(
            status_code=400, detail="Cannot suspend an owner account"
        )

    expires_at = None
    if payload.duration_days and payload.duration_days > 0:
        expires_at = datetime.now(timezone.utc) + timedelta(
            days=payload.duration_days
        )

    user.is_active = False
    user.ban_reason = payload.reason
    user.ban_expires = expires_at

    user_id_str = str(user.id)
    # Sync suspension with Better Auth "user" table
    await db.execute(
        text("""
            UPDATE "user"
            SET banned = true, "banReason" = :reason, "banExpires" = :expires_at
            WHERE id = :user_id
        """),
        {
            "reason": payload.reason,
            "expires_at": expires_at,
            "user_id": user_id_str,
        },
    )

    # Immediately revoke all Better Auth sessions
    await db.execute(
        text('DELETE FROM session WHERE "userId" = :user_id'),
        {"user_id": user_id_str},
    )

    # Remove active clients from Telethon client pool
    from app.services.telegram_client import client_pool

    acc_result = await db.execute(
        select(TelegramAccount).where(TelegramAccount.user_id == user.id)
    )
    for acc in acc_result.scalars().all():
        try:
            await client_pool.remove(str(acc.id), save_state=True)
        except Exception:
            pass

    try:
        from app.services.security_audit_service import (
            record_security_audit_event,
        )

        await record_security_audit_event(
            db=db,
            action="admin.user_suspended",
            actor=current_user,
            target_type="user",
            target_id=str(user.id),
            target_label=user.email,
            outcome="success",
            severity="critical",
            request=request,
            metadata={
                "reason": payload.reason,
                "duration_days": payload.duration_days,
            },
        )
    except Exception:
        pass

    await db.flush()
    return user


@router.post("/users/{user_id}/unsuspend", response_model=UserAdminResponse)
async def unsuspend_user(
    request: Request,
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """Restore and reactivate a suspended user account. Owner only."""
    ip = request.client.host
    if not await rate_limiter.check(f"admin:ip:{ip}"):
        raise HTTPException(status_code=429, detail="Too many requests. Try later.")

    result = await db.execute(select(User).where(User.id == UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.is_active = True
    user.ban_reason = None
    user.ban_expires = None

    user_id_str = str(user.id)
    # Sync reactivated status with Better Auth "user" table
    await db.execute(
        text("""
            UPDATE "user"
            SET banned = false, "banReason" = null, "banExpires" = null
            WHERE id = :user_id
        """),
        {"user_id": user_id_str},
    )

    try:
        from app.services.security_audit_service import (
            record_security_audit_event,
        )

        await record_security_audit_event(
            db=db,
            action="admin.user_unsuspended",
            actor=current_user,
            target_type="user",
            target_id=str(user.id),
            target_label=user.email,
            outcome="success",
            severity="warning",
            request=request,
        )
    except Exception:
        pass

    await db.flush()
    return user


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    request: Request,
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """Delete a user account, cleaning up Telethon pool, files, and Better Auth tables. Owner only."""
    ip = request.client.host
    if not await rate_limiter.check(f"admin:ip:{ip}"):
        raise HTTPException(status_code=429, detail="Too many requests. Try later.")
    result = await db.execute(select(User).where(User.id == UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.id == current_user.id:
        raise HTTPException(
            status_code=400, detail="Cannot delete your own account"
        )

    # RES-03: Cleanup Telegram accounts in client pool and cached avatar files before user deletion
    import os
    from app.services.telegram_client import client_pool

    acc_result = await db.execute(
        select(TelegramAccount).where(TelegramAccount.user_id == user.id)
    )
    user_accounts = acc_result.scalars().all()
    for acc in user_accounts:
        try:
            await client_pool.remove(str(acc.id), save_state=False)
        except Exception as pool_exc:
            logger.error(
                "Failed to remove Telethon client for account %s while deleting user %s: %s",
                acc.id,
                user_id,
                pool_exc,
            )
        try:
            from app.utils.photo_helper import get_photo_path

            photo_path = get_photo_path(str(acc.id))
            if os.path.exists(photo_path):
                os.remove(photo_path)
        except (OSError, ValueError):
            pass

    # Synchronize deletion with Better Auth authentication tables to prevent drift
    user_id_str = str(user.id)
    user_email_str = user.email
    await db.execute(
        text('DELETE FROM session WHERE "userId" = :user_id'),
        {"user_id": user_id_str},
    )
    await db.execute(
        text('DELETE FROM account WHERE "userId" = :user_id'),
        {"user_id": user_id_str},
    )
    await db.execute(
        text('DELETE FROM "user" WHERE id = :user_id'), {"user_id": user_id_str}
    )

    try:
        from app.services.security_audit_service import (
            record_security_audit_event,
        )

        await record_security_audit_event(
            db=db,
            action="admin.user_deleted",
            actor=current_user,
            target_type="user",
            target_id=user_id_str,
            target_label=user_email_str,
            outcome="success",
            severity="critical",
            request=request,
            metadata={"deleted_email": user_email_str},
        )
    except Exception:
        pass

    await db.delete(user)
    await db.flush()
