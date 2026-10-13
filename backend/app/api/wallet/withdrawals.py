"""Wallet withdrawal and step-up OTP verification endpoints."""

from datetime import datetime, timezone
import hmac
import json
import logging
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.models.wallet_transaction import WalletTransaction, generate_wallet_tx_id
from app.schemas.wallet import (
    WalletTransactionResponse,
    WithdrawCreateRequest,
    WithdrawOtpRequest,
    WithdrawOtpResponse,
)
from app.services.email_service import email_service, mask_email
from app.services.ledger_service import record_ledger_entry
from app.services.notification_service import create_notification
from app.utils.rate_limiter import rate_limiter
from app.utils.redis import redis_client

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/wallet/withdraw/otp/request", response_model=WithdrawOtpResponse)
async def request_withdraw_otp(
    request: Request,
    payload: WithdrawOtpRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Request an email OTP for step-up verification on balance withdrawal."""
    ip = request.client.host
    if not await rate_limiter.check(f"withdraw:otp:ip:{ip}", max_requests=10, window_seconds=60):
        raise HTTPException(
            status_code=429,
            detail="Terlalu banyak permintaan OTP dari IP ini. Coba lagi nanti.",
        )

    # 1. Verify user exists and has enough balance
    user_res = await db.execute(select(User).where(User.id == current_user.id))
    user = user_res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.balance < payload.amount:
        raise HTTPException(status_code=400, detail="Saldo tidak mencukupi untuk penarikan ini.")

    # 2. Check cooldown per user (60 seconds)
    cooldown_key = f"withdraw:otp:cooldown:{current_user.id}"
    ttl_cooldown = await redis_client.ttl(cooldown_key)
    if ttl_cooldown and ttl_cooldown > 0:
        raise HTTPException(
            status_code=429,
            detail=f"Harap tunggu {ttl_cooldown} detik sebelum meminta kode OTP baru.",
        )

    # 3. Check hourly limit per user to prevent mailbox spamming (max 10 requests / hour)
    rate_key = f"withdraw:otp:hourly:{current_user.id}"
    req_count = await redis_client.incr(rate_key)
    if req_count == 1:
        await redis_client.expire(rate_key, 3600)
    elif req_count > 10:
        raise HTTPException(
            status_code=429,
            detail="Batas permintaan kode OTP per jam terlampaui. Silakan coba lagi nanti.",
        )

    # 4. Generate cryptographically secure 6-digit OTP
    otp_code = f"{secrets.randbelow(1_000_000):06d}"

    # 5. Save to Redis with 5-minute TTL and dynamic linking to amount/destination
    otp_key = f"withdraw:otp:{current_user.id}"
    otp_data = {
        "code": otp_code,
        "amount": payload.amount,
        "method": payload.method,
        "note": payload.note,
        "attempts": 0,
        "max_attempts": 3,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await redis_client.set(otp_key, json.dumps(otp_data), ex=300)
    await redis_client.set(cooldown_key, "1", ex=60)

    # 6. Dispatch email asynchronously
    email_sent = await email_service.send_withdraw_otp(
        to_email=user.email,
        otp_code=otp_code,
        amount=payload.amount,
        method=payload.method,
        note=payload.note,
    )
    if not email_sent:
        logger.warning(
            "Email delivery reported failure for user %s, but OTP is active in Redis.",
            user.id,
        )

    return WithdrawOtpResponse(
        message="Kode verifikasi OTP telah dikirimkan ke email Anda.",
        email_masked=mask_email(user.email),
        expires_in_seconds=300,
        cooldown_seconds=60,
    )


@router.post("/wallet/withdraw", response_model=WalletTransactionResponse)
async def request_withdraw(
    request: Request,
    payload: WithdrawCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Request a withdrawal from balance requiring Step-Up Email OTP verification."""
    ip = request.client.host
    if not await rate_limiter.check(f"withdraw:ip:{ip}"):
        raise HTTPException(status_code=429, detail="Too many withdrawal requests. Try later.")

    # ── Step-Up Authentication / OTP Verification Guard ──
    otp_key = f"withdraw:otp:{current_user.id}"
    otp_raw = await redis_client.get(otp_key)
    if not otp_raw:
        raise HTTPException(
            status_code=400,
            detail="Kode OTP tidak valid atau sudah kedaluwarsa. Silakan minta kode OTP baru.",
        )

    try:
        otp_data = json.loads(otp_raw)
    except Exception:
        await redis_client.delete(otp_key)
        raise HTTPException(
            status_code=400,
            detail="Format data OTP rusak. Silakan minta kode OTP baru.",
        )

    attempts = otp_data.get("attempts", 0)
    if attempts >= 3:
        await redis_client.delete(otp_key)
        raise HTTPException(
            status_code=400,
            detail="Kode OTP dibatalkan karena percobaan salah melebihi batas (3 kali). Silakan minta kode baru.",
        )

    # Constant-time comparison
    submitted_code = (payload.otp_code or "").strip()
    expected_code = otp_data.get("code", "")
    if not hmac.compare_digest(submitted_code, expected_code):
        attempts += 1
        otp_data["attempts"] = attempts
        if attempts >= 3:
            await redis_client.delete(otp_key)
            raise HTTPException(
                status_code=400,
                detail="Kode OTP salah telah mencapai batas maksimal (3 kali). Kode dibatalkan. Silakan minta kode baru.",
            )
        else:
            remaining_ttl = await redis_client.ttl(otp_key)
            if remaining_ttl and remaining_ttl > 0:
                await redis_client.set(otp_key, json.dumps(otp_data), ex=remaining_ttl)
            remaining_attempts = 3 - attempts
            raise HTTPException(
                status_code=400,
                detail=f"Kode OTP salah. Sisa kesempatan: {remaining_attempts} kali.",
            )

    # Dynamic Linking check (PSD2 / SCA): verify amount matches OTP request
    bound_amount = otp_data.get("amount")
    if bound_amount is not None and bound_amount != payload.amount:
        await redis_client.delete(otp_key)
        raise HTTPException(
            status_code=400,
            detail="Nominal penarikan tidak cocok dengan nominal kode OTP yang diminta.",
        )

    # Atomic Single-Use Consumption (Burn OTP to prevent replay)
    await redis_client.delete(otp_key)

    # Lock user row to prevent race condition
    user_res = await db.execute(select(User).where(User.id == current_user.id).with_for_update())
    locked_user = user_res.scalar_one_or_none()
    if not locked_user:
        raise HTTPException(status_code=404, detail="User not found")

    if locked_user.balance < payload.amount:
        raise HTTPException(status_code=400, detail="Saldo tidak mencukupi untuk penarikan ini.")

    tx = WalletTransaction(
        id=generate_wallet_tx_id(),
        user_id=locked_user.id,
        type="withdraw",
        amount=payload.amount,
        method=payload.method,
        note=payload.note,
        status="pending",
    )
    db.add(tx)

    # Double-entry ledger mutation (atomic deduction + immutable audit journal)
    await record_ledger_entry(
        db=db,
        user=locked_user,
        amount=payload.amount,
        entry_type="DEBIT",
        category="withdraw",
        reference_id=tx.id,
        description=f"Penarikan dana via {payload.method} ke {payload.note}",
    )
    create_notification(
        db,
        locked_user.id,
        "wallet.withdraw_created",
        kind="info",
        data={
            "tx_id": tx.id,
            "amount": tx.amount,
            "method": tx.method,
        },
        href="/wallet",
    )
    await db.flush()

    return WalletTransactionResponse(
        id=tx.id,
        user_id=tx.user_id,
        user_email=locked_user.email,
        type=tx.type,
        amount=tx.amount,
        method=tx.method,
        note=tx.note,
        status=tx.status,
        admin_note=tx.admin_note,
        created_at=tx.created_at or datetime.now(timezone.utc),
        processed_at=tx.processed_at,
    )
