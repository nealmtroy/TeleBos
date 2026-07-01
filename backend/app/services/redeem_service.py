"""Redeem code service — creation, redemption, and subscription expiry logic."""

import json
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.redeem_code import RedeemCode
from app.models.redeem_log import RedeemLog
from app.schemas.redeem import RedeemCodeCreate


def generate_code(*, prefix: str | None = None) -> str:
    """Generate a random redeem code in the format PREFIX-XXXX (or just XXXXXX)."""
    random_part = secrets.token_hex(4).upper()
    if prefix:
        clean = "".join(c for c in prefix if c.isalnum()).upper()[:10]
        return f"{clean}-{random_part}"
    return random_part


async def create_redeem_code(
    db: AsyncSession,
    admin_user: User,
    data: RedeemCodeCreate,
) -> RedeemCode:
    """Create a new redeem code."""
    # Validate mutually exclusive fields
    if data.code_type == "balance":
        if not data.amount:
            raise ValueError("amount is required for balance codes")
        data.plan = None
        data.duration_days = None
    elif data.code_type == "subscription":
        if not data.plan or not data.duration_days:
            raise ValueError("plan and duration_days are required for subscription codes")
        data.amount = None

    parsed_expires_at = None
    if data.expires_at:
        try:
            parsed_expires_at = datetime.fromisoformat(data.expires_at)
            if parsed_expires_at.tzinfo is None:
                parsed_expires_at = parsed_expires_at.replace(tzinfo=timezone.utc)
        except ValueError:
            raise ValueError("Invalid expires_at format. Use ISO format (e.g. 2026-12-31T23:59:59)")

    code_str = data.custom_code.strip() if data.custom_code else generate_code(prefix=data.code_prefix)
    # Ensure uniqueness
    result = await db.execute(select(RedeemCode).where(RedeemCode.code == code_str))
    existing = result.scalar_one_or_none()
    if existing:
        if data.custom_code:
            raise ValueError(f"Code '{data.custom_code}' is already taken.")
        code_str = generate_code(prefix=data.code_prefix)

    redeem_code = RedeemCode(
        code=code_str,
        code_type=data.code_type,
        plan=data.plan,
        amount=data.amount,
        max_uses=data.max_uses,
        duration_days=data.duration_days,
        expires_at=parsed_expires_at,
        created_by=admin_user.id,
    )
    db.add(redeem_code)
    await db.flush()
    return redeem_code


async def redeem_code(
    db: AsyncSession,
    user: User,
    code_str: str,
) -> dict:
    """Redeem a code — grants balance or subscription upgrade.

    Uses SELECT ... FOR UPDATE to prevent race conditions when two users
    redeem the same code simultaneously.
    """
    # Find code with row-level lock to prevent race conditions
    result = await db.execute(
        select(RedeemCode)
        .where(RedeemCode.code == code_str)
        .with_for_update()
    )
    redeem = result.scalar_one_or_none()

    if not redeem:
        raise ValueError("Invalid code. Please check and try again.")
    if not redeem.is_active:
        raise ValueError("This code has been deactivated.")
    if redeem.expires_at and redeem.expires_at < datetime.now(timezone.utc):
        raise ValueError("This code has expired.")
    if redeem.used_count >= redeem.max_uses:
        raise ValueError("This code has reached its maximum usage limit.")

    # Check if this user has already redeemed this code
    log_check = await db.execute(
        select(RedeemLog).where(
            RedeemLog.code_id == redeem.id,
            RedeemLog.user_id == user.id
        )
    )
    if log_check.scalar_one_or_none():
        raise ValueError("You have already redeemed this code.")

    now = datetime.now(timezone.utc)
    detail_parts = {}

    if redeem.code_type == "balance":
        # Grant balance
        user.balance += redeem.amount
        detail_parts["type"] = "balance"
        detail_parts["amount"] = redeem.amount
        expires_at = None
        plan = None
        message = f"Success! You've received {redeem.amount} credits."
    else:
        # Grant subscription
        if redeem.plan not in ("pro", "premium"):
            raise ValueError("Invalid subscription plan.")
        # Don't downgrade owner
        if user.role == "owner":
            raise ValueError("Owner accounts cannot be upgraded via redeem codes.")
        user.role = redeem.plan
        user.subscription_expires_at = now + timedelta(days=redeem.duration_days)
        detail_parts["type"] = "subscription"
        detail_parts["plan"] = redeem.plan
        detail_parts["duration_days"] = redeem.duration_days
        plan = redeem.plan
        expires_at = user.subscription_expires_at
        message = f"Success! You've been upgraded to {redeem.plan.title()} until {expires_at.strftime('%Y-%m-%d %H:%M UTC')}."

    # Create log
    log_entry = RedeemLog(
        code_id=redeem.id,
        user_id=user.id,
        detail=json.dumps(detail_parts),
    )
    db.add(log_entry)

    # Increment usage
    redeem.used_count += 1
    await db.flush()

    return {
        "success": True,
        "message": message,
        "balance_added": redeem.amount if redeem.code_type == "balance" else None,
        "plan": plan,
        "expires_at": expires_at,
    }


async def list_redeem_codes(
    db: AsyncSession,
    search: str | None = None,
    page: int = 1,
    limit: int = 50,
) -> tuple[list[RedeemCode], int]:
    """List redeem codes with optional search and pagination."""
    query = select(RedeemCode).options(selectinload(RedeemCode.creator))
    count_query = select(func.count(RedeemCode.id))

    if search:
        search_filter = RedeemCode.code.ilike(f"%{search}%")
        query = query.where(search_filter)
        count_query = count_query.where(search_filter)

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    query = query.order_by(RedeemCode.created_at.desc())
    query = query.offset((page - 1) * limit).limit(limit)
    result = await db.execute(query)
    codes = list(result.scalars().all())

    return codes, total


async def list_redeem_logs(
    db: AsyncSession,
    page: int = 1,
    limit: int = 50,
) -> tuple[list[RedeemLog], int]:
    """List redeem logs with pagination."""
    count_query = select(func.count(RedeemLog.id))
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    query = (
        select(RedeemLog)
        .options(selectinload(RedeemLog.redeem_code), selectinload(RedeemLog.user))
        .order_by(RedeemLog.redeemed_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    result = await db.execute(query)
    logs = list(result.scalars().all())

    return logs, total


async def delete_redeem_code(db: AsyncSession, code_id: str) -> None:
    """Delete (soft-disable) a redeem code."""
    result = await db.execute(select(RedeemCode).where(RedeemCode.id == code_id))
    code = result.scalar_one_or_none()
    if not code:
        raise ValueError("Code not found")
    code.is_active = False
    await db.flush()


async def auto_downgrade_if_expired(db: AsyncSession, user: User) -> User:
    """Check if user's subscription has expired and downgrade if so."""
    if user.role in ("pro", "premium") and user.subscription_expires_at:
        if user.subscription_expires_at < datetime.now(timezone.utc):
            user.role = "basic"
            user.subscription_expires_at = None
            await db.flush()
    return user
