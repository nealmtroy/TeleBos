"""Ledger service — Centralized double-entry bookkeeping and balance reconciliation."""

from datetime import datetime, timezone
import logging
from uuid import UUID
import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.wallet_ledger import WalletLedger

logger = logging.getLogger(__name__)


async def record_ledger_entry(
    db: AsyncSession,
    user: User,
    amount: int,
    entry_type: str,
    category: str,
    reference_id: str | None = None,
    description: str | None = None,
) -> WalletLedger:
    """Record an immutable ledger entry and mutate user balance atomically.

    Parameters:
    -----------
    db:
        Active SQLAlchemy AsyncSession.
    user:
        The locked User model instance whose balance is being mutated.
    amount:
        Positive integer amount in IDR.
    entry_type:
        'DEBIT' (reduces balance) or 'CREDIT' (increases balance).
    category:
        Audit category, e.g. 'topup', 'withdraw', 'order_smm', 'order_smm_refund',
        'marketplace_buy', 'marketplace_sell', 'redeem_voucher', 'admin_adjustment'.
    reference_id:
        External identifier for traceability (transaction ID, order ID, listing ID, etc.).
    description:
        Human-readable audit description.

    Returns:
    --------
    WalletLedger:
        The newly created and persisted ledger journal entry.
    """
    if amount <= 0:
        raise ValueError(f"Ledger amount must be strictly positive (> 0), got: {amount}")

    norm_entry_type = entry_type.upper().strip()
    if norm_entry_type not in ("DEBIT", "CREDIT"):
        raise ValueError(f"Invalid ledger entry_type '{entry_type}'. Must be 'DEBIT' or 'CREDIT'")

    balance_before = user.balance

    if norm_entry_type == "DEBIT":
        if user.balance < amount:
            raise ValueError(
                f"Saldo tidak mencukupi untuk mutasi debit: Saldo {user.balance}, diperlukan {amount}"
            )
        user.balance -= amount
        balance_after = user.balance
    else:  # CREDIT
        user.balance += amount
        balance_after = user.balance

    # Verify mathematical invariant
    if norm_entry_type == "DEBIT":
        assert balance_after == balance_before - amount, "Invariant violation: balance_after != balance_before - amount"
    else:
        assert balance_after == balance_before + amount, "Invariant violation: balance_after != balance_before + amount"

    ledger = WalletLedger(
        id=uuid.uuid4(),
        user_id=user.id,
        entry_type=norm_entry_type,
        amount=amount,
        balance_before=balance_before,
        balance_after=balance_after,
        category=category,
        reference_id=str(reference_id) if reference_id else None,
        description=description,
        created_at=datetime.now(timezone.utc),
    )
    db.add(ledger)

    # Track financial telemetry event idempotently
    try:
        from app.services.analytics_tracking_service import track_financial_mutation

        await track_financial_mutation(
            db=db,
            user_id=user.id,
            ledger_id=ledger.id,
            amount=amount,
            entry_type=norm_entry_type,
            category=category,
            reference_id=str(reference_id) if reference_id else None,
            balance_before=balance_before,
            balance_after=balance_after,
        )
    except Exception as exc:
        logger.warning("Could not record analytics event for ledger %s: %s", ledger.id, exc)

    logger.info(
        "Ledger mutation: user=%s | %s %d IDR [%s] | %d -> %d | ref=%s",
        user.id,
        norm_entry_type,
        amount,
        category,
        balance_before,
        balance_after,
        reference_id,
    )

    return ledger


async def get_user_ledger_entries(
    db: AsyncSession,
    user_id: UUID,
    category: str | None = None,
    entry_type: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[WalletLedger], int]:
    """Retrieve paginated ledger statement (rekening koran) for a user."""
    query = select(WalletLedger).where(WalletLedger.user_id == user_id)

    if category:
        query = query.where(WalletLedger.category == category)
    if entry_type:
        query = query.where(WalletLedger.entry_type == entry_type.upper())

    # Count total
    count_stmt = select(func.count()).select_from(query.subquery())
    total_count = (await db.execute(count_stmt)).scalar() or 0

    # Paginate
    query = query.order_by(WalletLedger.created_at.desc()).offset(offset).limit(limit)
    res = await db.execute(query)
    entries = list(res.scalars().all())

    return entries, total_count


async def reconcile_user_balance(
    db: AsyncSession,
    user_id: UUID,
) -> dict:
    """Verify mathematical integrity: sum(CREDIT) - sum(DEBIT) == current_balance."""
    user = await db.get(User, user_id)
    if not user:
        raise ValueError("User not found for balance reconciliation.")

    # Calculate total credits
    credit_stmt = select(func.coalesce(func.sum(WalletLedger.amount), 0)).where(
        WalletLedger.user_id == user_id,
        WalletLedger.entry_type == "CREDIT",
    )
    total_credits = (await db.execute(credit_stmt)).scalar() or 0

    # Calculate total debits
    debit_stmt = select(func.coalesce(func.sum(WalletLedger.amount), 0)).where(
        WalletLedger.user_id == user_id,
        WalletLedger.entry_type == "DEBIT",
    )
    total_debits = (await db.execute(debit_stmt)).scalar() or 0

    computed_balance = total_credits - total_debits
    actual_balance = user.balance
    discrepancy = actual_balance - computed_balance
    is_reconciled = (discrepancy == 0)

    if not is_reconciled:
        logger.warning(
            "Ledger Discrepancy detected for user %s: actual=%d, computed=%d (diff=%d)",
            user_id,
            actual_balance,
            computed_balance,
            discrepancy,
        )

    return {
        "user_id": str(user_id),
        "actual_balance": actual_balance,
        "total_credits": total_credits,
        "total_debits": total_debits,
        "computed_balance": computed_balance,
        "discrepancy": discrepancy,
        "is_reconciled": is_reconciled,
    }
