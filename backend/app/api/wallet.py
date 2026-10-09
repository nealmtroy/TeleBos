from datetime import datetime, timedelta, timezone
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.database import get_db
from app.dependencies import get_current_user, require_role
from app.models.user import User
from app.models.wallet_transaction import WalletTransaction, generate_wallet_tx_id
from app.schemas.wallet import (
    AdminTransactionStatusUpdate,
    TopupCreateRequest,
    TopupStatusCheckResponse,
    WalletTransactionListResponse,
    WalletTransactionResponse,
    WithdrawCreateRequest,
)
from app.services.klikqris_service import (
    check_qris_status,
    create_qris_transaction,
    is_klikqris_configured,
    verify_signature,
)
from app.services.notification_service import create_notification
from app.utils.rate_limiter import rate_limiter

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


@router.post("/wallet/withdraw", response_model=WalletTransactionResponse)
async def request_withdraw(
    request: Request,
    payload: WithdrawCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Request a withdrawal from balance."""
    ip = request.client.host
    if not await rate_limiter.check(f"withdraw:ip:{ip}"):
        raise HTTPException(status_code=429, detail="Too many withdrawal requests. Try later.")

    # Lock user row to prevent race condition
    user_res = await db.execute(select(User).where(User.id == current_user.id).with_for_update())
    locked_user = user_res.scalar_one_or_none()
    if not locked_user:
        raise HTTPException(status_code=404, detail="User not found")

    if locked_user.balance < payload.amount:
        raise HTTPException(status_code=400, detail="Saldo tidak mencukupi untuk penarikan ini.")

    # Deduct balance immediately
    locked_user.balance -= payload.amount

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

    if tx.type == "topup":
        if payload.status == "approved":
            user.balance += tx.amount
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
        elif payload.status == "rejected":
            create_notification(
                db,
                user.id,
                "wallet.topup_rejected",
                kind="warning",
                data={
                    "tx_id": tx.id,
                    "amount": tx.amount,
                    "method": tx.method,
                    "reason": payload.admin_note or "Dibatalkan oleh Admin",
                },
                href="/wallet",
            )
    elif tx.type == "withdraw":
        if payload.status == "approved":
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
            # Refund balance back to user
            user.balance += tx.amount
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

    tx.status = payload.status
    tx.admin_note = payload.admin_note
    tx.processed_at = now

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

    res = await db.execute(
        select(WalletTransaction)
        .where(WalletTransaction.id == order_id)
        .with_for_update()
    )
    tx = res.scalar_one_or_none()
    if not tx:
        logger.warning("KlikQRIS webhook: order_id=%s not found in database", order_id)
        return {"status": "error", "message": f"Order {order_id} not found"}

    # Double security: validate signature against creation signature
    if tx.signature and incoming_sig:
        if not verify_signature(tx.signature, incoming_sig):
            logger.error(
                "KlikQRIS webhook: signature mismatch for order_id=%s (expected %s, got %s)",
                order_id,
                tx.signature,
                incoming_sig,
            )
            return {"status": "error", "message": "Invalid signature"}

    now_utc = datetime.now(timezone.utc)

    # Idempotency check: if already approved or rejected, acknowledge without double crediting
    if tx.status != "pending":
        logger.info(
            "KlikQRIS webhook: order_id=%s already in state '%s'. Skipping.",
            order_id,
            tx.status,
        )
        return {"status": "ok", "message": f"Transaction already in {tx.status} state"}

    # Process payment confirmation
    if raw_status in ("PAID", "SUCCESS"):
        user_res = await db.execute(
            select(User).where(User.id == tx.user_id).with_for_update()
        )
        user = user_res.scalar_one_or_none()
        if not user:
            logger.error("KlikQRIS webhook: user_id=%s not found for tx=%s", tx.user_id, order_id)
            return {"status": "error", "message": "User not found"}

        # Credit user balance
        user.balance += tx.amount
        tx.status = "approved"
        tx.processed_at = now_utc
        total_paid = payload.get("total_amount") or tx.total_amount or tx.amount
        tx.admin_note = f"Auto-approved via KlikQRIS webhook (total: Rp {int(float(total_paid)):,})"
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

        await db.commit()
        logger.info(
            "KlikQRIS webhook: Successfully credited Rp %d to user %s for invoice %s",
            tx.amount,
            user.id,
            order_id,
        )
        return {"status": "ok", "message": "Payment verified and credited"}

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


@router.get("/wallet/topup/{order_id}/status", response_model=TopupStatusCheckResponse)
async def check_topup_status(
    order_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Check payment status for a specific top-up invoice.

    Actively checks with KlikQRIS gateway if status is still pending.
    """
    res = await db.execute(
        select(WalletTransaction)
        .where(
            WalletTransaction.id == order_id,
            WalletTransaction.user_id == current_user.id,
            WalletTransaction.type == "topup",
        )
        .with_for_update()
    )
    tx = res.scalar_one_or_none()
    if not tx:
        raise HTTPException(status_code=404, detail="Top-up transaction not found")

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
                    user.balance += tx.amount
                    tx.status = "approved"
                    tx.processed_at = now_utc
                    total_paid = gateway_data.get("total_amount") or tx.total_amount or tx.amount
                    tx.admin_note = f"Auto-approved via KlikQRIS status check (total: Rp {int(float(total_paid)):,})"
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
                    await db.commit()
                    logger.info("Topup %s auto-approved via status check", order_id)
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
        processed_at=tx.processed_at,
    )

