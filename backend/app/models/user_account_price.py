"""UserAccountPrice model — owner sets per-user prices for selling Telegram accounts."""

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class UserAccountPrice(Base):
    """Per-user pricing for marketplace. Owner sets how much each user
    gets per account when they sell.

    If no row exists for a user, the global default SmmSetting
    account_sell_price is used as fallback.
    """
    __tablename__ = "user_account_prices"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, unique=True, index=True,
    )
    sell_price: Mapped[int] = mapped_column(
        BigInteger, nullable=False, default=5500,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationship
    user: Mapped["User"] = relationship("User")
