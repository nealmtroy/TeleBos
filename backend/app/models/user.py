"""Web application user model."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, func, BigInteger
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    full_name: Mapped[str | None] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    role: Mapped[str] = mapped_column(String(20), default="basic")
    balance: Mapped[int] = mapped_column(default=0)
    subscription_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, default=None
    )
    telegram_chat_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True, unique=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    accounts: Mapped[list["TelegramAccount"]] = relationship(
        "TelegramAccount",
        back_populates="user",
        cascade="all, delete-orphan",
        foreign_keys="[TelegramAccount.user_id]"
    )
    group_lists: Mapped[list["GroupList"]] = relationship(
        "GroupList", back_populates="user", cascade="all, delete-orphan"
    )
    text_lists: Mapped[list["TextList"]] = relationship(
        "TextList", back_populates="user", cascade="all, delete-orphan"
    )
    orders: Mapped[list["Order"]] = relationship(
        "Order", back_populates="user", cascade="all, delete-orphan"
    )
    account_folders: Mapped[list["AccountFolder"]] = relationship(
        "AccountFolder", back_populates="user", cascade="all, delete-orphan"
    )
