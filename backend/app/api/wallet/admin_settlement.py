"""Admin wallet transaction settlement, approval workflows, and ledger reconciliation."""

from datetime import datetime, timezone
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import require_role
from app.models.user import User
from app.models.wallet_transaction import WalletTransaction
from app.schemas.wallet import (
    AdminTransactionStatusUpdate,
    BalanceReconciliationResponse,
    WalletTransactionListResponse,
    WalletTransactionResponse,
)
from app.services.ledger_service import (
    reconcile_user_balance,
    record_ledger_entry,
)
from app.services.notification_service import create_notification
from app.services.wallet_service import fulfill_wallet_transaction

logger = logging.getLogger(__name__)

router = APIRouter()


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
