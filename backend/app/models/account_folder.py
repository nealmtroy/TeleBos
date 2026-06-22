"""Account folder model — user-defined groupings for Telegram accounts."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, func, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class AccountFolder(Base):
    __tablename__ = "account_folders"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="account_folders")
    members: Mapped[list["AccountFolderMember"]] = relationship(
        "AccountFolderMember", back_populates="folder", cascade="all, delete-orphan",
    )
    accounts: Mapped[list["TelegramAccount"]] = relationship(
        "TelegramAccount",
        secondary="account_folder_members",
        viewonly=True,
    )
