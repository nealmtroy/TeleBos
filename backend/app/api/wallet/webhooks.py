"""Payment gateway webhook callback endpoints (KlikQRIS)."""

from datetime import datetime, timezone
import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models.user import User
from app.models.wallet_transaction import WalletTransaction
from app.services.klikqris_service import verify_signature
from app.services.notification_service import create_notification
from app.services.wallet_service import fulfill_wallet_transaction
from app.utils.rate_limiter import rate_limiter

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/wallet/webhook/klikqris")
async def klikqris_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Webhook callback endpoint for KlikQRIS payment notifications.

    KlikQRIS POSTs to this endpoint when payment is SUCCESS (PAID) or EXPIRED.
    Must always respond with HTTP 200 OK to acknowledge receipt.
    """
    client_ip = request.client.host if request.client else "unknown"

    # Rate limiting to protect DB connection pool from floods
    if not await rate_limiter.check(f"webhook:klikqris:ip:{client_ip}", max_requests=60, window_seconds=60):
        logger.warning("KlikQRIS webhook rate limited for IP %s", client_ip)
        raise HTTPException(status_code=429, detail="Too many webhook requests. Please try again later.")

    # Optional IP Whitelist enforcement if configured by operator
    settings = get_settings()
    allowed_ips_str = getattr(settings, "KLIKQRIS_ALLOWED_IPS", "") or ""
    allowed_ips = [ip.strip() for ip in allowed_ips_str.split(",") if ip.strip()]
    if allowed_ips and client_ip not in allowed_ips:
        logger.warning("KlikQRIS webhook: rejected untrusted IP %s", client_ip)
        return {"status": "error", "message": "Unauthorized IP"}

    try:
        content_type = request.headers.get("content-type", "")
        if "application/json" in content_type:
            payload = await request.json()
        else:
            payload = dict(await request.form())
    except Exception as e:
        logger.warning("KlikQRIS webhook: failed to parse body: %s", e)
        return {"status": "error", "message": "Failed to parse request body"}

    logger.info("KlikQRIS webhook received: %s", payload)

    order_id = payload.get("order_id")
    if not order_id:
        logger.warning("KlikQRIS webhook: missing order_id in payload")
        return {"status": "error", "message": "Missing order_id"}

    raw_status = str(payload.get("status", "")).upper()
    incoming_sig = payload.get("signature")

    # Immediate rejection if signature is missing to avoid querying DB
    if not incoming_sig:
        logger.warning("KlikQRIS webhook: missing signature in payload for order_id=%s", order_id)
        return {"status": "error", "message": "Invalid signature"}

    # Non-locking pre-check to prevent row lock contention and DoS
    res = await db.execute(
        select(WalletTransaction)
        .where(WalletTransaction.id == order_id)
    )
    tx = res.scalar_one_or_none()
    if not tx:
        logger.warning("KlikQRIS webhook: order_id=%s not found in database", order_id)
        return {"status": "error", "message": f"Order {order_id} not found"}

    # Security: validate signature against creation signature (KlikQRIS official recommendation)
    if not tx.signature or not verify_signature(tx.signature, incoming_sig):
        logger.error(
            "KlikQRIS webhook: signature verification failed for order_id=%s (has_tx_sig=%s, has_incoming_sig=%s)",
            order_id,
            bool(tx.signature),
            bool(incoming_sig),
        )
        return {"status": "error", "message": "Invalid signature"}

    # Idempotency check: if already approved or rejected, acknowledge without double crediting or locking
    if tx.status != "pending":
        logger.info(
            "KlikQRIS webhook: order_id=%s already in state '%s'. Skipping.",
            order_id,
            tx.status,
        )
        return {"status": "ok", "message": f"Transaction already in {tx.status} state"}

    # Acquire row lock exclusively for valid pending mutations
    res_locked = await db.execute(
        select(WalletTransaction)
        .where(WalletTransaction.id == order_id)
        .with_for_update()
    )
    tx = res_locked.scalar_one_or_none()
    if not tx or tx.status != "pending":
        return {"status": "ok", "message": "Transaction state already resolved"}

    now_utc = datetime.now(timezone.utc)

    # Process payment confirmation
    if raw_status in ("PAID", "SUCCESS"):
        user_res = await db.execute(
            select(User).where(User.id == tx.user_id).with_for_update()
        )
        user = user_res.scalar_one_or_none()
        if not user:
            logger.error("KlikQRIS webhook: user_id=%s not found for tx=%s", tx.user_id, order_id)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Internal database inconsistency: user {tx.user_id} not found for transaction {order_id}. Retry required.",
            )

        total_paid = payload.get("total_amount") or tx.total_amount or tx.amount
        await fulfill_wallet_transaction(db, tx, user, total_paid, now_utc)
        await db.commit()
        logger.info(
            "KlikQRIS webhook: Successfully processed tx=%s (%s) for user %s",
            order_id,
            tx.type,
            user.id,
        )
        return {"status": "ok", "message": "Payment verified and fulfilled"}

    elif raw_status == "EXPIRED":
        tx.status = "rejected"
        tx.processed_at = now_utc
        tx.admin_note = "Expired by KlikQRIS webhook"
        create_notification(
            db,
            tx.user_id,
            "wallet.topup_rejected",
            kind="warning",
            data={
                "tx_id": tx.id,
                "amount": tx.amount,
                "method": tx.method,
                "reason": "Pembayaran kedaluwarsa",
            },
            href="/wallet",
        )
        await db.commit()
        logger.info("KlikQRIS webhook: Marked invoice %s as rejected (expired)", order_id)
        return {"status": "ok", "message": "Payment marked as expired"}

    return {"status": "ok", "message": f"Status '{raw_status}' acknowledged"}
