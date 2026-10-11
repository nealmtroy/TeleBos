"""Wallet ledger model — immutable, append-only journal of all balance mutations."""

from datetime import datetime, timezone
import uuid

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class WalletLedger(Base):
    __tablename__ = "wallet_ledgers"
    __table_args__ = (
        CheckConstraint("amount > 0", name="chk_ledger_amount_positive"),
        CheckConstraint("entry_type IN ('DEBIT', 'CREDIT')", name="chk_ledger_entry_type"),
        Index("ix_wallet_ledgers_user_created", "user_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    entry_type: Mapped[str] = mapped_column(
        String(16), nullable=False, index=True
    )  # "DEBIT" or "CREDIT"
    amount: Mapped[int] = mapped_column(BigInteger, nullable=False)
    balance_before: Mapped[int] = mapped_column(BigInteger, nullable=False)
    balance_after: Mapped[int] = mapped_column(BigInteger, nullable=False)
    category: Mapped[str] = mapped_column(
        String(32), nullable=False, index=True
    )  # "topup", "withdraw", "withdraw_refund", "order_smm", "order_smm_refund", "marketplace_buy", "marketplace_sell", "redeem_voucher", "admin_adjustment", "initial_balance"
    reference_id: Mapped[str | None] = mapped_column(
        String(64), nullable=True, index=True
    )
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        nullable=False,
        index=True,
    )

    # Relationships
    user: Mapped["User"] = relationship("User", backref="ledger_entries")
