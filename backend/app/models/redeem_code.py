"""Redeem code model — used for balance top-ups and subscription upgrades."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class RedeemCode(Base):
    __tablename__ = "redeem_codes"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    code_type: Mapped[str] = mapped_column(String(20), nullable=False)  # "balance" | "subscription"
    plan: Mapped[str | None] = mapped_column(String(20), nullable=True)  # "pro" | "premium" — null for balance
    amount: Mapped[int | None] = mapped_column(Integer, nullable=True)  # credits — null for subscription
    max_uses: Mapped[int] = mapped_column(Integer, default=1)
    used_count: Mapped[int] = mapped_column(Integer, default=0)
    duration_days: Mapped[int | None] = mapped_column(Integer, nullable=True)  # null for balance
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, default=None
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    creator: Mapped["User"] = relationship("User", backref="created_redeem_codes")
    logs: Mapped[list["RedeemLog"]] = relationship(
        "RedeemLog", back_populates="redeem_code", cascade="all, delete-orphan"
    )
