"""Telegram account model — stores session strings encrypted."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, Text, func, ForeignKey, BigInteger
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class TelegramAccount(Base):
    __tablename__ = "telegram_accounts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    telegram_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    session_string: Mapped[str] = mapped_column(Text, default="", nullable=False)
    twofa_password: Mapped[str] = mapped_column(Text, default="", nullable=False)

    # Profile info (cached from Telegram)
    first_name: Mapped[str | None] = mapped_column(String(255))
    last_name: Mapped[str | None] = mapped_column(String(255))
    username: Mapped[str | None] = mapped_column(String(255))
    bio: Mapped[str | None] = mapped_column(Text)
    profile_photo_path: Mapped[str | None] = mapped_column(String(500))

    phone_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    twofa_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Marketplace fields
    for_sale: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", index=True)
    is_sold: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    seller_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    sold_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    recovery_email: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Auto-reply (welcome message) settings
    auto_reply_enabled: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false"
    )
    auto_reply_text: Mapped[str | None] = mapped_column(Text, default=None, nullable=True)

    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Cached dialog statistics (refreshed by background daily task)
    contacts_count: Mapped[int] = mapped_column(BigInteger, default=0, server_default="0")
    total_groups: Mapped[int] = mapped_column(BigInteger, default=0, server_default="0")
    owned_groups: Mapped[int] = mapped_column(BigInteger, default=0, server_default="0")
    total_channels: Mapped[int] = mapped_column(BigInteger, default=0, server_default="0")
    owned_channels: Mapped[int] = mapped_column(BigInteger, default=0, server_default="0")
    stats_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None, nullable=True)

    # Spam limit checking fields
    spam_status: Mapped[str | None] = mapped_column(String(50), default="unknown", server_default="unknown")
    spam_detail: Mapped[str | None] = mapped_column(Text, default=None, nullable=True)
    spam_last_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="accounts")
    chat_folders: Mapped[list["ChatFolder"]] = relationship(
        "ChatFolder", back_populates="account", cascade="all, delete-orphan"
    )
