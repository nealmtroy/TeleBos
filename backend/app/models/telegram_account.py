"""Telegram account model — stores session strings encrypted."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text, func, ForeignKey, BigInteger, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class TelegramAccount(Base):
    __tablename__ = "telegram_accounts"
    __table_args__ = (
        UniqueConstraint("phone", name="uq_telegram_account_phone"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    phone: Mapped[str] = mapped_column(String(20), nullable=False, unique=True, index=True)
    telegram_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    session_string: Mapped[str] = mapped_column(Text, default="", nullable=False)
    twofa_password: Mapped[str] = mapped_column(Text, default="", nullable=False)
    # Safe, masked Telegram 2FA metadata cached by the background synchronizer.
    twofa_has_recovery: Mapped[bool | None] = mapped_column(Boolean, nullable=True, default=None)
    twofa_hint: Mapped[str | None] = mapped_column(String(255), nullable=True, default=None)
    login_email_pattern: Mapped[str | None] = mapped_column(String(255), nullable=True, default=None)
    unconfirmed_email_pattern: Mapped[str | None] = mapped_column(String(255), nullable=True, default=None)
    twofa_status_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, default=None)
    twofa_status_retry_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, default=None)

    # Profile info (cached from Telegram)
    first_name: Mapped[str | None] = mapped_column(String(255))
    last_name: Mapped[str | None] = mapped_column(String(255))
    username: Mapped[str | None] = mapped_column(String(255))
    bio: Mapped[str | None] = mapped_column(Text)
    profile_photo_path: Mapped[str | None] = mapped_column(String(500))
    photo_version: Mapped[int] = mapped_column(BigInteger, default=0, server_default="0")
    profile_photo_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True, default=None)
    color_id: Mapped[int | None] = mapped_column(Integer, nullable=True, default=None)

    phone_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    twofa_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Marketplace fields
    for_sale: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", index=True)
    is_sold: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    sell_price: Mapped[int | None] = mapped_column(BigInteger, nullable=True, default=None)
    seller_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    sold_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sale_listed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, default=None)
    recovery_email: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Auto-reply (welcome message) settings
    auto_reply_enabled: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false"
    )
    auto_reply_text: Mapped[str | None] = mapped_column(Text, default=None, nullable=True)

    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    pts: Mapped[int | None] = mapped_column(BigInteger, nullable=True, default=None)
    qts: Mapped[int | None] = mapped_column(BigInteger, nullable=True, default=None)
    date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, default=None)

    # Cached dialog statistics (refreshed by background daily task)
    contacts_count: Mapped[int] = mapped_column(BigInteger, default=0, server_default="0")
    total_groups: Mapped[int] = mapped_column(BigInteger, default=0, server_default="0")
    owned_groups: Mapped[int] = mapped_column(BigInteger, default=0, server_default="0")
    total_channels: Mapped[int] = mapped_column(BigInteger, default=0, server_default="0")
    owned_channels: Mapped[int] = mapped_column(BigInteger, default=0, server_default="0")
    stats_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None, nullable=True)
    groups_channels_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None, nullable=True)

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

    @property
    def has_profile_photo(self) -> bool:
        """Whether Telegram reports a current profile photo for this account."""
        return self.profile_photo_id is not None

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="accounts", foreign_keys=[user_id])
    chat_folders: Mapped[list["ChatFolder"]] = relationship(
        "ChatFolder", back_populates="account", cascade="all, delete-orphan"
    )
    folders: Mapped[list["AccountFolder"]] = relationship(
        "AccountFolder",
        secondary="account_folder_members",
        viewonly=True,
    )
    chats: Mapped[list["TelegramChat"]] = relationship(
        "TelegramChat", back_populates="account", cascade="all, delete-orphan"
    )
