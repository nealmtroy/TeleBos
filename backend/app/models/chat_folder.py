"""Telegram chat folder model."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, Integer, Text, func, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ChatFolder(Base):
    __tablename__ = "chat_folders"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("telegram_accounts.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    folder_id: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    emoji: Mapped[str | None] = mapped_column(String(10))
    color: Mapped[int | None] = mapped_column(Integer)

    included_chat_ids: Mapped[dict] = mapped_column(JSONB, default=list)
    excluded_chat_ids: Mapped[dict] = mapped_column(JSONB, default=list)
    pinned_chat_ids: Mapped[dict] = mapped_column(JSONB, default=list)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    account: Mapped["TelegramAccount"] = relationship(
        "TelegramAccount", back_populates="chat_folders"
    )
