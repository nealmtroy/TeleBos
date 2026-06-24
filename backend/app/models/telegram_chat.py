"""Telegram chat model."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, Integer, Text, func, ForeignKey, BigInteger, Boolean, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class TelegramChat(Base):
    __tablename__ = "telegram_chats"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("telegram_accounts.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    chat_id: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    username: Mapped[str | None] = mapped_column(String(255), nullable=True)
    type: Mapped[str] = mapped_column(String(50), nullable=False)  # "group", "supergroup", "channel", "user", "bot", "unknown"
    unread_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    last_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_message_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    photo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    is_creator: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Composite Unique Constraint to prevent duplicates
    __table_args__ = (
        UniqueConstraint("account_id", "chat_id", name="uq_telegram_chat_account_chat"),
    )

    # Relationships
    account: Mapped["TelegramAccount"] = relationship(
        "TelegramAccount", back_populates="chats"
    )
