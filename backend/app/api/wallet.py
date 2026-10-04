"""Wallet and transaction endpoints — topup, withdraw, and transaction history."""

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user, require_role
from app.models.user import User
from app.models.wallet_transaction import WalletTransaction, generate_wallet_tx_id
from app.schemas.wallet import (
    AdminTransactionStatusUpdate,
    TopupCreateRequest,
    WalletTransactionListResponse,
    WalletTransactionResponse,
    WithdrawCreateRequest,
)
from app.utils.rate_limiter import rate_limiter

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
            method=tx.method,
            note=tx.note,
            status=tx.status,
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
    """Create a new top-up invoice (QRIS)."""
    ip = request.client.host
    if not await rate_limiter.check(f"topup:ip:{ip}"):
        raise HTTPException(status_code=429, detail="Too many topup requests. Try later.")

    invoice_id = generate_wallet_tx_id()
    qr_data = generate_qris_string(invoice_id, payload.amount)

    tx = WalletTransaction(
        id=invoice_id,
        user_id=current_user.id,
        type="topup",
        amount=payload.amount,
        method=payload.method or "QRIS",
        note=payload.note or "QRIS TeleBos",
        status="pending",
    )
    db.add(tx)
    await db.flush()

    return {
        "id": tx.id,
        "amount": tx.amount,
        "method": tx.method,
        "note": tx.note,
        "status": tx.status,
        "qr_string": qr_data,
        "created_at": tx.created_at.isoformat() if tx.created_at else datetime.now(timezone.utc).isoformat(),
        "expires_at": (datetime.now(timezone.utc).timestamp() + 15 * 60),
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
        created_at=tx.created_at,
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
            method=tx.method,
            note=tx.note,
            status=tx.status,
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
    elif tx.type == "withdraw":
        if payload.status == "rejected":
            # Refund balance back to user
            user.balance += tx.amount

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
        method=tx.method,
        note=tx.note,
        status=tx.status,
        admin_note=tx.admin_note,
        created_at=tx.created_at,
        processed_at=tx.processed_at,
    )
