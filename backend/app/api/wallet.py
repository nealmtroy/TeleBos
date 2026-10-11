from datetime import datetime, timedelta, timezone
import hmac
import json
import logging
import secrets
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select, text, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.database import get_db
from app.dependencies import get_current_user, require_role
from app.models.account_audit_log import AccountAuditLog
from app.models.order import Order
from app.models.smm_service import SmmService
from app.models.telegram_account import TelegramAccount
from app.models.user import User
from app.models.wallet_transaction import WalletTransaction, generate_wallet_tx_id
from app.services.smm_service import create_order
from app.utils.timezone import ensure_utc
from app.schemas.wallet import (
    AdminTransactionStatusUpdate,
    BalanceReconciliationResponse,
    TopupCreateRequest,
    TopupStatusCheckResponse,
    WalletLedgerEntryResponse,
    WalletLedgerListResponse,
    WalletTransactionListResponse,
    WalletTransactionResponse,
    WithdrawCreateRequest,
    WithdrawOtpRequest,
    WithdrawOtpResponse,
)
from app.services.klikqris_service import (
    check_qris_status,
    create_qris_transaction,
    is_klikqris_configured,
    verify_signature,
)
from app.services.email_service import email_service, mask_email
from app.services.ledger_service import (
    get_user_ledger_entries,
    reconcile_user_balance,
    record_ledger_entry,
)
from app.services.notification_service import create_notification
from app.utils.rate_limiter import rate_limiter
from app.utils.redis import redis_client

logger = logging.getLogger(__name__)

router = APIRouter(tags=["wallet"])


def generate_qris_string(invoice_id: str, amount: int) -> str:
    amount_str = str(amount)
    amount_len = f"{len(amount_str):02d}"
    inv_inner_len = f"{len(invoice_id):02d}"
    inv_outer_len = f"{len(invoice_id) + 4:02d}"
    return (
        f"00020101021226610014ID.LINKAJA.WWW0118936009110022304930020300051440014ID.DANA.WWW"
        f"01189360091100223049300203000520458125303360540{amount_len}{amount_str}5802ID5911TELEBOS PAY"
        f"6007JAKARTA61051294062{inv_outer_len}01{inv_inner_len}{invoice_id}6304A1B2"
    )


@router.get("/wallet/transactions", response_model=WalletTransactionListResponse)
async def get_my_transactions(
    type: str | None = Query(None, description="topup, withdraw, redeem, admin_adjustment"),
    status: str | None = Query(None, description="pending, approved, rejected"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get current user's wallet transactions."""
    query = select(WalletTransaction).where(WalletTransaction.user_id == current_user.id)
    count_query = select(func.count(WalletTransaction.id)).where(WalletTransaction.user_id == current_user.id)

    if type:
        query = query.where(WalletTransaction.type == type)
        count_query = count_query.where(WalletTransaction.type == type)
    if status:
        query = query.where(WalletTransaction.status == status)
        count_query = count_query.where(WalletTransaction.status == status)

    total_res = await db.execute(count_query)
    total = total_res.scalar() or 0

    query = query.order_by(WalletTransaction.created_at.desc()).offset(offset).limit(limit)
    res = await db.execute(query)
    txs = res.scalars().all()

    items = [
        WalletTransactionResponse(
            id=tx.id,
            user_id=tx.user_id,
            user_email=current_user.email,
            type=tx.type,
            amount=tx.amount,
            total_amount=tx.total_amount,
            method=tx.method,
            note=tx.note,
            status=tx.status,
            qris_url=tx.qris_url,
            qris_image=tx.qris_image,
            expired_at=tx.expired_at,
            admin_note=tx.admin_note,
            created_at=tx.created_at,
            processed_at=tx.processed_at,
        )
        for tx in txs
    ]

    return WalletTransactionListResponse(transactions=items, total=total)


@router.post("/wallet/topup", response_model=dict)
async def request_topup(
    request: Request,
    payload: TopupCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new top-up invoice (dynamic QRIS via KlikQRIS or mock fallback)."""
    ip = request.client.host
    if not await rate_limiter.check(f"topup:ip:{ip}"):
        raise HTTPException(status_code=429, detail="Too many topup requests. Try later.")

    invoice_id = generate_wallet_tx_id()
    now_utc = datetime.now(timezone.utc)
    settings = get_settings()

    # Dynamic KlikQRIS generation when credentials are configured
    if is_klikqris_configured():
        callback_url = (
            settings.KLIKQRIS_CALLBACK_URL
            or f"{settings.NEXT_PUBLIC_URL.rstrip('/')}/api/v1/wallet/webhook/klikqris"
        )
        keterangan = payload.note or f"Top Up Saldo TeleBos ({current_user.email})"

        try:
            kq_data = await create_qris_transaction(
                order_id=invoice_id,
                amount=payload.amount,
                keterangan=keterangan,
                callback_url=callback_url,
            )
        except Exception as e:
            logger.error("Failed to create KlikQRIS transaction for order %s: %s", invoice_id, e)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Gagal membuat tagihan QRIS KlikQRIS: {str(e)}",
            )

        total_amount = int(float(kq_data.get("total_amount") or payload.amount))
        signature = kq_data.get("signature")
        qris_url = kq_data.get("qris_url")
        qris_image = kq_data.get("qris_image")

        # Parse expired_at from KlikQRIS (local WIB UTC+7 or fallback 60 min)
        expired_at = None
        expired_at_raw = kq_data.get("expired_at")
        if expired_at_raw:
            try:
                dt_naive = datetime.strptime(expired_at_raw, "%Y-%m-%d %H:%M:%S")
                dt_wib = dt_naive.replace(tzinfo=timezone(timedelta(hours=7)))
                expired_at = dt_wib.astimezone(timezone.utc)
            except Exception:
                expired_at = now_utc + timedelta(minutes=60)
        else:
            expired_at = now_utc + timedelta(minutes=60)

        tx = WalletTransaction(
            id=invoice_id,
            user_id=current_user.id,
            type="topup",
            amount=payload.amount,
            total_amount=total_amount,
            method=payload.method or "QRIS",
            note=payload.note or "QRIS TeleBos",
            status="pending",
            signature=signature,
            qris_url=qris_url,
            qris_image=qris_image,
            expired_at=expired_at,
        )
        db.add(tx)
        create_notification(
            db,
            current_user.id,
            "wallet.topup_created",
            kind="info",
            data={
                "tx_id": tx.id,
                "amount": tx.amount,
                "total_amount": tx.total_amount or tx.amount,
                "method": tx.method,
            },
            href=f"/wallet/invoice/{tx.id}",
        )
        await db.flush()

        return {
            "id": tx.id,
            "amount": tx.amount,
            "total_amount": tx.total_amount,
            "method": tx.method,
            "note": tx.note,
            "status": tx.status,
            "qris_url": tx.qris_url,
            "qris_image": tx.qris_image,
            "qr_string": tx.qris_url or generate_qris_string(tx.id, tx.total_amount or tx.amount),
            "created_at": tx.created_at.isoformat() if tx.created_at else now_utc.isoformat(),
            "expires_at": tx.expired_at.timestamp() if tx.expired_at else (now_utc.timestamp() + 3600),
            "expired_at": tx.expired_at.isoformat() if tx.expired_at else None,
        }

    # Fallback to mock QRIS if gateway keys are not configured
    qr_data = generate_qris_string(invoice_id, payload.amount)
    tx = WalletTransaction(
        id=invoice_id,
        user_id=current_user.id,
        type="topup",
        amount=payload.amount,
        total_amount=payload.amount,
        method=payload.method or "QRIS",
        note=payload.note or "QRIS TeleBos",
        status="pending",
    )
    db.add(tx)
    create_notification(
        db,
        current_user.id,
        "wallet.topup_created",
        kind="info",
        data={
            "tx_id": tx.id,
            "amount": tx.amount,
            "total_amount": tx.total_amount or tx.amount,
            "method": tx.method,
        },
        href=f"/wallet/invoice/{tx.id}",
    )
    await db.flush()

    return {
        "id": tx.id,
        "amount": tx.amount,
        "total_amount": tx.amount,
        "method": tx.method,
        "note": tx.note,
        "status": tx.status,
        "qr_string": qr_data,
        "created_at": tx.created_at.isoformat() if tx.created_at else now_utc.isoformat(),
        "expires_at": (now_utc.timestamp() + 15 * 60),
    }


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


@router.get("/admin/transactions", response_model=WalletTransactionListResponse)
async def admin_list_transactions(
    type: str | None = Query(None),
    status: str | None = Query(None),
    search: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """List all wallet transactions across all users. Owner only."""
    query = select(WalletTransaction).options(selectinload(WalletTransaction.user))
    count_query = select(func.count(WalletTransaction.id))

    if type:
        query = query.where(WalletTransaction.type == type)
        count_query = count_query.where(WalletTransaction.type == type)
    if status:
        query = query.where(WalletTransaction.status == status)
        count_query = count_query.where(WalletTransaction.status == status)

    if search:
        search_term = f"%{search}%"
        # Join user for search on email
        query = query.join(User, WalletTransaction.user_id == User.id)
        count_query = count_query.join(User, WalletTransaction.user_id == User.id)
        search_filter = (
            WalletTransaction.id.ilike(search_term)
            | WalletTransaction.method.ilike(search_term)
            | WalletTransaction.note.ilike(search_term)
            | User.email.ilike(search_term)
        )
        query = query.where(search_filter)
        count_query = count_query.where(search_filter)

    total_res = await db.execute(count_query)
    total = total_res.scalar() or 0

    query = query.order_by(WalletTransaction.created_at.desc()).offset(offset).limit(limit)
    res = await db.execute(query)
    txs = res.scalars().all()

    items = [
        WalletTransactionResponse(
            id=tx.id,
            user_id=tx.user_id,
            user_email=tx.user.email if tx.user else None,
            type=tx.type,
            amount=tx.amount,
            total_amount=tx.total_amount,
            method=tx.method,
            note=tx.note,
            status=tx.status,
            qris_url=tx.qris_url,
            qris_image=tx.qris_image,
            expired_at=tx.expired_at,
            admin_note=tx.admin_note,
            created_at=tx.created_at,
            processed_at=tx.processed_at,
        )
        for tx in txs
    ]

    return WalletTransactionListResponse(transactions=items, total=total)


@router.put("/admin/transactions/{tx_id}/status", response_model=WalletTransactionResponse)
async def admin_update_transaction_status(
    tx_id: str,
    payload: AdminTransactionStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """Approve or reject a wallet transaction. Owner only."""
    if payload.status not in ("approved", "rejected"):
        raise HTTPException(status_code=400, detail="Status must be 'approved' or 'rejected'")

    res = await db.execute(
        select(WalletTransaction)
        .where(WalletTransaction.id == tx_id)
        .options(selectinload(WalletTransaction.user))
        .with_for_update()
    )
    tx = res.scalar_one_or_none()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")

    if tx.status != "pending":
        raise HTTPException(status_code=400, detail=f"Transaction already has status '{tx.status}'")

    # Lock user row for balance adjustments
    user_res = await db.execute(select(User).where(User.id == tx.user_id).with_for_update())
    user = user_res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    now = datetime.now(timezone.utc)

    if tx.type == "withdraw":
        if payload.status == "approved":
            tx.status = "approved"
            tx.admin_note = payload.admin_note or "Disetujui oleh Administrator"
            tx.processed_at = now
            create_notification(
                db,
                user.id,
                "wallet.withdraw_approved",
                kind="success",
                data={
                    "tx_id": tx.id,
                    "amount": tx.amount,
                    "method": tx.method,
                    "note": payload.admin_note or "",
                },
                href="/wallet",
            )
        elif payload.status == "rejected":
            # Refund balance back to user via double-entry ledger
            await record_ledger_entry(
                db=db,
                user=user,
                amount=tx.amount,
                entry_type="CREDIT",
                category="withdraw_refund",
                reference_id=tx.id,
                description=f"Pengembalian dana penarikan ditolak admin: {payload.admin_note or 'Ditolak'}",
            )
            tx.status = "rejected"
            tx.admin_note = payload.admin_note or "Ditolak oleh Administrator"
            tx.processed_at = now
            create_notification(
                db,
                user.id,
                "wallet.withdraw_rejected",
                kind="error",
                data={
                    "tx_id": tx.id,
                    "amount": tx.amount,
                    "method": tx.method,
                    "reason": payload.admin_note or "Ditolak oleh Admin",
                },
                href="/wallet",
            )
        await db.flush()

    elif tx.type in ("topup", "subscription", "smm", "marketplace"):
        # Transaksi pembayaran dan deposit diproses otomatis oleh payment gateway.
        # Jika admin secara eksplisit melakukan intervensi manual/override:
        if payload.status == "approved":
            total_paid = tx.total_amount or tx.amount
            await fulfill_wallet_transaction(
                db=db,
                tx=tx,
                user=user,
                total_paid=total_paid,
                now_utc=now,
            )
            tx.admin_note = payload.admin_note or f"Disetujui manual oleh admin ({current_user.email})"
            await db.flush()
        elif payload.status == "rejected":
            tx.status = "rejected"
            tx.admin_note = payload.admin_note or f"Dibatalkan manual oleh admin ({current_user.email})"
            tx.processed_at = now
            create_notification(
                db,
                user.id,
                f"wallet.{tx.type}_rejected",
                kind="warning",
                data={
                    "tx_id": tx.id,
                    "amount": tx.amount,
                    "method": tx.method,
                    "reason": payload.admin_note or "Dibatalkan oleh Admin",
                },
                href="/wallet",
            )
            await db.flush()

    return WalletTransactionResponse(
        id=tx.id,
        user_id=tx.user_id,
        user_email=user.email,
        type=tx.type,
        amount=tx.amount,
        total_amount=tx.total_amount,
        method=tx.method,
        note=tx.note,
        status=tx.status,
        qris_url=tx.qris_url,
        qris_image=tx.qris_image,
        expired_at=tx.expired_at,
        admin_note=tx.admin_note,
        created_at=tx.created_at or datetime.now(timezone.utc),
        processed_at=tx.processed_at,
    )


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
    from app.utils.rate_limiter import rate_limiter
    if not await rate_limiter.check(f"webhook:klikqris:ip:{client_ip}", max_requests=60, window_seconds=60):
        logger.warning("KlikQRIS webhook rate limited for IP %s", client_ip)
        raise HTTPException(status_code=429, detail="Too many webhook requests. Please try again later.")

    # Optional IP Whitelist enforcement if configured by operator
    from app.config import get_settings
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
            return {"status": "error", "message": "User not found"}

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


async def _safe_bg_reconnect_account(account_id: str) -> None:
    """Safely reconnect an account in the background without holding a request-scoped DB session."""
    try:
        from app.services.session_manager import session_manager
        await session_manager.ensure_connected_on_demand(account_id)
    except Exception as exc:
        logger.warning("Background auto-reconnect failed for account %s: %s", account_id, exc)


async def fulfill_wallet_transaction(
    db: AsyncSession,
    tx: WalletTransaction,
    user: User,
    total_paid: int | float,
    now_utc: datetime,
) -> bool:
    """Fulfill a paid wallet transaction according to its type.

    Handles:
    - subscription: activates plan and extends expiry
    - smm: dispatches order to SMM provider and creates Order record
    - marketplace: transfers TelegramAccount ownership to buyer and credits seller
    - topup (or fallback): adds funds to user's wallet balance
    """
    if tx.status != "pending":
        return False

    if tx.type == "subscription" and tx.note:
        try:
            sub_data = json.loads(tx.note)
            plan = sub_data.get("plan_id")
            duration_days = sub_data.get("duration_days", 30)

            # Apply subscription
            user.role = plan
            await db.execute(
                text('UPDATE "user" SET role = :role WHERE id = :user_id'),
                {"role": plan, "user_id": str(user.id)},
            )

            current_expiry = ensure_utc(user.subscription_expires_at)
            base_time = max(now_utc, current_expiry) if (current_expiry and current_expiry > now_utc) else now_utc
            user.subscription_expires_at = base_time + timedelta(days=duration_days)

            tx.admin_note = f"Subscription {plan.title()} activated via QRIS (total: Rp {int(float(total_paid)):,})"
            create_notification(
                db,
                user.id,
                "subscription.upgraded",
                kind="success",
                data={
                    "tx_id": tx.id,
                    "plan": plan,
                    "duration_days": duration_days,
                },
                href="/subscriptions",
            )
        except Exception as e:
            logger.error("Failed to parse subscription note for tx=%s: %s", tx.id, e)
            await record_ledger_entry(
                db=db,
                user=user,
                amount=tx.amount,
                entry_type="CREDIT",
                category="topup_fallback",
                reference_id=tx.id,
                description="Parsing paket langganan gagal, dialihkan ke saldo dompet",
            )
            tx.admin_note = f"Auto-approved via QRIS (total: Rp {int(float(total_paid)):,}) - Sub failed, credited to balance"
            create_notification(
                db,
                user.id,
                "wallet.topup_approved",
                kind="warning",
                data={"tx_id": tx.id, "amount": tx.amount, "method": tx.method},
                href="/wallet",
            )

    elif tx.type == "smm" and tx.note:
        try:
            smm_data = json.loads(tx.note)
            service_id = smm_data.get("service_id")
            data_target = smm_data.get("data_target")
            quantity = smm_data.get("quantity")
            comments = smm_data.get("comments")
            usernames = smm_data.get("usernames")
            existing_order_id = smm_data.get("order_id")

            result = await create_order(service_id, data_target, quantity, comments, usernames)
            if result.get("status"):
                smm_order_id = str(result.get("data", {}).get("id", ""))
                order = None
                if existing_order_id:
                    order = await db.get(Order, UUID(existing_order_id))
                if order:
                    order.status = "Pending"
                    order.smm_order_id = smm_order_id
                    order.note = f"Paid via QRIS invoice {tx.id}"
                else:
                    svc = await db.get(SmmService, service_id)
                    order = Order(
                        user_id=user.id,
                        smm_order_id=smm_order_id,
                        service_id=service_id,
                        service_name=svc.service_name if svc else f"Service #{service_id}",
                        category=svc.category if svc else "SMM",
                        data_target=data_target,
                        quantity=quantity,
                        price=svc.original_price if svc else 0,
                        total_price=tx.amount,
                        status="Pending",
                        is_mass_order=False,
                        note=f"Paid via QRIS invoice {tx.id}",
                    )
                    db.add(order)
                await db.flush()
                create_notification(
                    db,
                    user.id,
                    "order.created",
                    kind="success",
                    data={"order_id": str(order.id), "service": order.service_name},
                    href="/orders",
                )
                tx.admin_note = f"SMM Order #{smm_order_id} placed via QRIS (total: Rp {int(float(total_paid)):,})"
            else:
                msg = result.get("data", {}).get("msg", "Unknown API error")
                logger.error("SMM API failed for tx=%s: %s. Refunding to user balance.", tx.id, msg)
                await record_ledger_entry(
                    db=db,
                    user=user,
                    amount=tx.amount,
                    entry_type="CREDIT",
                    category="topup_fallback",
                    reference_id=tx.id,
                    description=f"SMM API error ({msg}), dialihkan ke saldo dompet",
                )
                if existing_order_id:
                    ord_rec = await db.get(Order, UUID(existing_order_id))
                    if ord_rec:
                        ord_rec.status = "Failed"
                        ord_rec.note = f"Order failed ({msg}). Refunded to wallet balance."
                tx.admin_note = f"SMM API failed ({msg}), credited Rp {tx.amount} to user balance"
                create_notification(
                    db,
                    user.id,
                    "wallet.topup_approved",
                    kind="warning",
                    data={"tx_id": tx.id, "amount": tx.amount, "method": tx.method, "reason": f"SMM error: {msg}"},
                    href="/wallet",
                )
        except Exception as e:
            logger.error("Failed to fulfill SMM order for tx=%s: %s", tx.id, e)
            await record_ledger_entry(
                db=db,
                user=user,
                amount=tx.amount,
                entry_type="CREDIT",
                category="topup_fallback",
                reference_id=tx.id,
                description=f"SMM fulfillment exception ({e}), dialihkan ke saldo dompet",
            )
            tx.admin_note = f"SMM fulfillment exception ({e}), credited Rp {tx.amount} to balance"
            create_notification(
                db,
                user.id,
                "wallet.topup_approved",
                kind="warning",
                data={"tx_id": tx.id, "amount": tx.amount, "method": tx.method},
                href="/wallet",
            )

    elif tx.type == "marketplace" and tx.note:
        try:
            m_data = json.loads(tx.note)
            account_id_str = m_data.get("account_id")
            acc_uuid = UUID(account_id_str)

            stmt = (
                select(TelegramAccount)
                .where(
                    and_(
                        TelegramAccount.id == acc_uuid,
                        TelegramAccount.for_sale == True,
                        TelegramAccount.is_sold == False,
                    )
                )
                .with_for_update()
            )
            acc_res = await db.execute(stmt)
            account = acc_res.scalar_one_or_none()

            if account:
                seller_id = account.seller_id or account.user_id
                sell_price = account.sell_price or 7000
                buy_price = tx.amount

                if seller_id:
                    s_res = await db.execute(select(User).where(User.id == seller_id).with_for_update())
                    seller = s_res.scalar_one_or_none()
                    if seller:
                        await record_ledger_entry(
                            db=db,
                            user=seller,
                            amount=sell_price,
                            entry_type="CREDIT",
                            category="marketplace_sell",
                            reference_id=tx.id,
                            description=f"Hasil penjualan akun Telegram #{account.phone or str(account.id)[:8]}",
                        )

                account.user_id = user.id
                account.for_sale = False
                account.is_sold = False
                account.sold_at = now_utc
                account.buy_price = None
                account.sell_price = None
                account.seller_id = None
                account.is_active = True

                audit_seller = AccountAuditLog(
                    user_id=seller_id,
                    account_id=account.id,
                    action="sell",
                    price=sell_price,
                    phone=account.phone,
                    telegram_id=account.telegram_id,
                )
                db.add(audit_seller)

                audit_buyer = AccountAuditLog(
                    user_id=user.id,
                    account_id=account.id,
                    action="buy",
                    price=buy_price,
                    phone=account.phone,
                    telegram_id=account.telegram_id,
                )
                db.add(audit_buyer)

                if seller_id:
                    create_notification(
                        db,
                        seller_id,
                        "marketplace.sale_completed",
                        kind="success",
                        data={"account_id": str(account.id), "phone": account.phone, "price": sell_price},
                        href="/orders?tab=accounts",
                    )
                create_notification(
                    db,
                    user.id,
                    "marketplace.purchase_completed",
                    kind="success",
                    data={"account_id": str(account.id), "phone": account.phone, "price": buy_price},
                    href="/orders?tab=accounts",
                )

                tx.admin_note = f"Telegram account {account.phone} transferred via QRIS (total: Rp {int(float(total_paid)):,})"

                try:
                    import asyncio
                    asyncio.create_task(_safe_bg_reconnect_account(str(account.id)))
                except Exception as exc:
                    logger.warning("Failed to schedule auto-reconnect for account %s: %s", account.id, exc)
            else:
                logger.warning("Account %s no longer available for marketplace tx=%s. Crediting to buyer balance.", account_id_str, tx.id)
                await record_ledger_entry(
                    db=db,
                    user=user,
                    amount=tx.amount,
                    entry_type="CREDIT",
                    category="topup_fallback",
                    reference_id=tx.id,
                    description="Akun sudah terjual, dana dialihkan ke saldo dompet",
                )
                tx.admin_note = f"Account no longer available, credited Rp {tx.amount} to balance"
                create_notification(
                    db,
                    user.id,
                    "wallet.topup_approved",
                    kind="info",
                    data={"tx_id": tx.id, "amount": tx.amount, "reason": "Akun sudah terjual, dana dialihkan ke saldo dompet"},
                    href="/wallet",
                )
        except Exception as e:
            logger.error("Failed to fulfill marketplace transaction for tx=%s: %s", tx.id, e)
            await record_ledger_entry(
                db=db,
                user=user,
                amount=tx.amount,
                entry_type="CREDIT",
                category="topup_fallback",
                reference_id=tx.id,
                description=f"Marketplace error ({e}), dialihkan ke saldo dompet",
            )
            tx.admin_note = f"Marketplace error ({e}), credited Rp {tx.amount} to balance"
            create_notification(
                db,
                user.id,
                "wallet.topup_approved",
                kind="warning",
                data={"tx_id": tx.id, "amount": tx.amount},
                href="/wallet",
            )
    else:
        # Default: Top-up
        await record_ledger_entry(
            db=db,
            user=user,
            amount=tx.amount,
            entry_type="CREDIT",
            category="topup",
            reference_id=tx.id,
            description=f"Deposit QRIS otomatis disetujui (total: Rp {int(float(total_paid)):,})",
        )
        tx.admin_note = f"Auto-approved via KlikQRIS (total: Rp {int(float(total_paid)):,})"
        create_notification(
            db,
            user.id,
            "wallet.topup_approved",
            kind="success",
            data={
                "tx_id": tx.id,
                "amount": tx.amount,
                "method": tx.method,
            },
            href="/wallet",
        )

    tx.status = "approved"
    tx.processed_at = now_utc
    return True


@router.get("/wallet/topup/{order_id}/status", response_model=TopupStatusCheckResponse)
async def check_topup_status(
    order_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Check payment status for a specific top-up/subscription/order invoice.

    Actively checks with KlikQRIS gateway if status is still pending.
    """
    res = await db.execute(
        select(WalletTransaction)
        .where(
            WalletTransaction.id == order_id,
            WalletTransaction.user_id == current_user.id,
            WalletTransaction.type.in_(["topup", "subscription", "smm", "marketplace"]),
        )
        .with_for_update()
    )
    tx = res.scalar_one_or_none()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")

    now_utc = datetime.now(timezone.utc)

    # If still pending and KlikQRIS is configured, query gateway
    if tx.status == "pending" and is_klikqris_configured():
        gateway_data = await check_qris_status(order_id)
        if gateway_data:
            gw_status = str(gateway_data.get("status", "")).upper()
            if gw_status in ("SUCCESS", "PAID"):
                user_res = await db.execute(
                    select(User).where(User.id == current_user.id).with_for_update()
                )
                user = user_res.scalar_one_or_none()
                if user:
                    total_paid = gateway_data.get("total_amount") or tx.total_amount or tx.amount
                    await fulfill_wallet_transaction(db, tx, user, total_paid, now_utc)
                    await db.commit()
                    logger.info("Transaction %s (%s) auto-approved via status check", order_id, tx.type)
            elif gw_status == "EXPIRED":
                tx.status = "rejected"
                tx.processed_at = now_utc
                tx.admin_note = "Expired via KlikQRIS status check"
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

    return TopupStatusCheckResponse(
        id=tx.id,
        status=tx.status,
        amount=tx.amount,
        total_amount=tx.total_amount or tx.amount,
        is_paid=(tx.status == "approved"),
        type=tx.type,
        processed_at=tx.processed_at,
    )


@router.get("/wallet/ledger", response_model=WalletLedgerListResponse)
async def get_my_ledger(
    category: str | None = Query(None, description="topup, withdraw, order_smm, marketplace_buy, etc."),
    entry_type: str | None = Query(None, description="DEBIT or CREDIT"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get the immutable audit ledger entries (rekening koran) for the current user."""
    entries, total = await get_user_ledger_entries(
        db=db,
        user_id=current_user.id,
        category=category,
        entry_type=entry_type,
        limit=limit,
        offset=offset,
    )
    return WalletLedgerListResponse(
        entries=[WalletLedgerEntryResponse.model_validate(e) for e in entries],
        total=total,
    )


@router.get("/admin/wallet/reconcile/{user_id}", response_model=BalanceReconciliationResponse)
async def admin_reconcile_user_balance(
    user_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """Verify mathematical reconciliation: sum(CREDIT) - sum(DEBIT) == user.balance."""
    try:
        result = await reconcile_user_balance(db, user_id)
        return BalanceReconciliationResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


