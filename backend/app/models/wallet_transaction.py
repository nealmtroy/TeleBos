"""Wallet transaction model — tracks deposits, withdrawals, redeems, and admin adjustments."""

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def generate_wallet_tx_id() -> str:
    return f"TRX-{uuid.uuid4().hex[:8].upper()}"


class WalletTransaction(Base):
    __tablename__ = "wallet_transactions"

    id: Mapped[str] = mapped_column(
        String(64), primary_key=True, default=generate_wallet_tx_id
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    type: Mapped[str] = mapped_column(
        String(32), nullable=False, index=True
    )  # "topup", "withdraw", "redeem", "admin_adjustment"
    amount: Mapped[int] = mapped_column(BigInteger, nullable=False)
    total_amount: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    method: Mapped[str] = mapped_column(String(64), nullable=False, default="QRIS")
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="pending", index=True
    )  # "pending", "approved", "rejected"
    signature: Mapped[str | None] = mapped_column(String(255), nullable=True)
    qris_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    qris_image: Mapped[str | None] = mapped_column(Text, nullable=True)
    admin_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    expired_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    processed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    user: Mapped["User"] = relationship("User", backref="wallet_transactions")

