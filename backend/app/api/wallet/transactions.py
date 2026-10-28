"""User wallet transactions and ledger endpoints."""

from datetime import datetime, timedelta, timezone
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.models.wallet_transaction import WalletTransaction, generate_wallet_tx_id
from app.schemas.wallet import (
    TopupCreateRequest,
    TopupStatusCheckResponse,
    WalletLedgerEntryResponse,
    WalletLedgerListResponse,
    WalletTransactionListResponse,
    WalletTransactionResponse,
)
from app.services.klikqris_service import (
    check_qris_status,
    create_qris_transaction,
    is_klikqris_configured as _orig_is_klikqris_configured,
)
from app.services.ledger_service import get_user_ledger_entries
from app.services.notification_service import create_notification
from app.services.wallet_service import (
    fulfill_wallet_transaction,
    generate_qris_string,
)
from app.utils.rate_limiter import rate_limiter

logger = logging.getLogger(__name__)

router = APIRouter()


def _get_is_klikqris_configured():
    """Retrieve is_klikqris_configured function, resolving monkeypatches on app.api.wallet."""
    import sys

    wallet_mod = sys.modules.get("app.api.wallet")
    if wallet_mod and hasattr(wallet_mod, "is_klikqris_configured"):
        return wallet_mod.is_klikqris_configured
    return _orig_is_klikqris_configured


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

    is_configured_fn = _get_is_klikqris_configured()
    # Dynamic KlikQRIS generation when credentials are configured
    if is_configured_fn():
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
            logger.warning("Failed to create KlikQRIS transaction for order %s: %s", invoice_id, e)
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
    is_configured_fn = _get_is_klikqris_configured()
    if tx.status == "pending" and is_configured_fn():
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
