"""Redeem code and subscription endpoints."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, require_role
from app.models.user import User
from app.utils.rate_limiter import rate_limiter
from app.schemas.redeem import (
    RedeemRequest,
    RedeemResponse,
    SubscriptionInfoResponse,
)
from app.services.redeem_service import redeem_code, auto_downgrade_if_expired

router = APIRouter(tags=["redeem"])


@router.post("/redeem", response_model=RedeemResponse)
async def redeem_code_endpoint(
    request: Request,
    payload: RedeemRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Redeem a code for balance or subscription upgrade."""
    ip = request.client.host
    if not await rate_limiter.check(f"redeem:ip:{ip}"):
        raise HTTPException(status_code=429, detail="Too many redeem attempts. Try later.")
    if not await rate_limiter.check(f"redeem:user:{current_user.id}"):
        raise HTTPException(status_code=429, detail="Too many redeem attempts. Try later.")
    try:
        result = await redeem_code(db, current_user, payload.code.strip())
        return RedeemResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/subscriptions/me", response_model=SubscriptionInfoResponse)
async def get_my_subscription(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get current user's subscription info."""
    # Auto-downgrade if expired
    user = await auto_downgrade_if_expired(db, current_user)

    days_remaining = None
    if user.subscription_expires_at:
        remaining = (user.subscription_expires_at - datetime.now(timezone.utc)).days
        days_remaining = max(0, remaining)

    is_active = user.role in ("pro", "premium", "owner") and (
        user.subscription_expires_at is None or user.subscription_expires_at > datetime.now(timezone.utc)
    )

    return SubscriptionInfoResponse(
        plan=user.role,
        expires_at=user.subscription_expires_at,
        is_active=is_active,
        days_remaining=days_remaining,
    )
