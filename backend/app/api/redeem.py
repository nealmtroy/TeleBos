"""Redeem code and subscription endpoints."""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
import json

from app.config import get_settings
from app.models.wallet_transaction import WalletTransaction, generate_wallet_tx_id
from app.services.klikqris_service import create_qris_transaction, is_klikqris_configured
from app.services.notification_service import create_notification
from app.utils.timezone import ensure_utc

from app.database import get_db
from app.dependencies import get_current_user, require_role
from app.models.user import User
from app.services.ledger_service import record_ledger_entry
from app.utils.rate_limiter import rate_limiter
from app.schemas.redeem import (
    RedeemRequest,
    RedeemResponse,
    SubscriptionInfoResponse,
    CheckoutRequest,
    CheckoutResponse,
)
from app.services.redeem_service import redeem_code, auto_downgrade_if_expired
from app.utils.sanitize import sanitize_exception

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
        raise HTTPException(status_code=400, detail=sanitize_exception(e))


@router.get("/subscriptions/me", response_model=SubscriptionInfoResponse)
async def get_my_subscription(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get current user's subscription info."""
    user = await auto_downgrade_if_expired(db, current_user)
    now_utc = datetime.now(timezone.utc)

    seconds_remaining = None
    days_remaining = None
    if user.subscription_expires_at:
        diff = (user.subscription_expires_at - now_utc).total_seconds()
        if diff > 0:
            seconds_remaining = int(diff)
            days_remaining = max(0, int(diff // 86400))
        else:
            seconds_remaining = 0
            days_remaining = 0

    if user.role == "owner":
        is_active = True
    elif user.role in ("basic", "pro", "premium"):
        is_active = user.subscription_expires_at is None or user.subscription_expires_at > now_utc
    elif user.role == "freetrial":
        is_active = user.subscription_expires_at is not None and user.subscription_expires_at > now_utc
    else:
        is_active = False

    return SubscriptionInfoResponse(
        plan=user.role,
        expires_at=user.subscription_expires_at,
        is_active=is_active,
        days_remaining=days_remaining,
        seconds_remaining=seconds_remaining,
    )


@router.post("/subscriptions/checkout", response_model=CheckoutResponse)
async def checkout_subscription(
    request: Request,
    payload: CheckoutRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Checkout a subscription plan using wallet balance or KlikQRIS invoice."""
    ip = request.client.host
    if not await rate_limiter.check(f"checkout:ip:{ip}"):
        raise HTTPException(status_code=429, detail="Too many checkout requests. Try later.")

    # Determine price
    prices = {
        "basic": {"monthly": 5000, "yearly": 50000},
        "pro": {"monthly": 10000, "yearly": 100000},
        "premium": {"monthly": 20000, "yearly": 200000},
    }

    amount = prices.get(payload.plan_id, {}).get(payload.billing_cycle)
    if not amount:
        raise HTTPException(status_code=400, detail="Invalid plan or billing cycle")

    duration_days = 30 if payload.billing_cycle == "monthly" else 365
    now_utc = datetime.now(timezone.utc)

    # Lock user row to check balance safely
    user_res = await db.execute(
        select(User).where(User.id == current_user.id).with_for_update()
    )
    locked_user = user_res.scalar_one()

    # Determine if user pays via balance
    should_pay_with_balance = (
        payload.payment_method == "balance"
        or (payload.payment_method == "auto" and locked_user.balance >= amount)
    )

    if should_pay_with_balance and locked_user.balance >= amount:
        tx_id = generate_wallet_tx_id()

        # Deduct balance via double-entry ledger
        await record_ledger_entry(
            db=db,
            user=locked_user,
            amount=amount,
            entry_type="DEBIT",
            category="subscription",
            reference_id=tx_id,
            description=f"Subscription {payload.plan_id.title()} {payload.billing_cycle.title()} paid with wallet balance",
        )

        # Upgrade plan
        locked_user.role = payload.plan_id
        await db.execute(
            text('UPDATE "user" SET role = :role WHERE id = :user_id'),
            {"role": payload.plan_id, "user_id": str(locked_user.id)},
        )

        current_expiry = ensure_utc(locked_user.subscription_expires_at)
        base_time = max(now_utc, current_expiry) if (current_expiry and current_expiry > now_utc) else now_utc
        locked_user.subscription_expires_at = base_time + timedelta(days=duration_days)

        tx = WalletTransaction(
            id=tx_id,
            user_id=locked_user.id,
            type="subscription",
            amount=amount,
            total_amount=amount,
            method="balance",
            note=json.dumps({
                "plan_id": payload.plan_id,
                "billing_cycle": payload.billing_cycle,
                "duration_days": duration_days,
            }),
            status="approved",
            processed_at=now_utc,
            admin_note=f"Subscription {payload.plan_id.title()} {payload.billing_cycle.title()} paid with wallet balance",
            created_at=now_utc,
        )
        db.add(tx)

        create_notification(
            db,
            locked_user.id,
            "subscription.upgraded",
            kind="success",
            data={
                "tx_id": tx_id,
                "plan": payload.plan_id,
                "duration_days": duration_days,
            },
            href="/subscriptions",
        )

        await db.commit()
        return CheckoutResponse(
            invoice_id=tx_id,
            amount=amount,
            payment_method="balance",
            success=True,
            message="Langganan berhasil diaktifkan menggunakan saldo dompet Anda.",
        )

    # If balance is insufficient or user requested QRIS: create QRIS invoice
    invoice_id = generate_wallet_tx_id()
    settings = get_settings()

    qris_url = None
    qris_image = None
    signature = None

    if is_klikqris_configured():
        callback_url = (
            settings.KLIKQRIS_CALLBACK_URL
            or f"{settings.NEXT_PUBLIC_URL.rstrip('/')}/api/v1/wallet/webhook/klikqris"
        )
        keterangan = f"Subscription {payload.plan_id.title()} {payload.billing_cycle.title()} ({current_user.email})"

        try:
            kq_data = await create_qris_transaction(
                order_id=invoice_id,
                amount=amount,
                keterangan=keterangan,
                callback_url=callback_url,
            )
            qris_url = kq_data.get("qris_url")
            qris_image = kq_data.get("qris_image")
            signature = kq_data.get("signature")
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Gagal membuat tagihan QRIS KlikQRIS: {str(e)}",
            )

    note_data = json.dumps({
        "plan_id": payload.plan_id,
        "billing_cycle": payload.billing_cycle,
        "duration_days": duration_days,
    })

    tx = WalletTransaction(
        id=invoice_id,
        user_id=current_user.id,
        type="subscription",
        amount=amount,
        total_amount=amount,
        method="QRIS",
        note=note_data,
        status="pending",
        signature=signature,
        qris_url=qris_url,
        qris_image=qris_image,
        created_at=now_utc,
    )

    db.add(tx)
    await db.commit()

    return CheckoutResponse(
        invoice_id=invoice_id,
        qris_url=qris_url,
        qris_image=qris_image,
        amount=amount,
        payment_method="qris",
        success=True,
        message="Tagihan QRIS berhasil dibuat.",
    )

