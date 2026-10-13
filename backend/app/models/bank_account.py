"""User Bank Account model for withdrawal destinations with encrypted account numbers."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class UserBankAccount(Base):
    __tablename__ = "user_bank_accounts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    account_type: Mapped[str] = mapped_column(String(20), nullable=False, default="bank")
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    account_number_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    account_number_last4: Mapped[str] = mapped_column(String(4), nullable=False)
    account_holder: Mapped[str] = mapped_column(String(255), nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    user = relationship("User", back_populates="bank_accounts")


__all__ = ["UserBankAccount"]
