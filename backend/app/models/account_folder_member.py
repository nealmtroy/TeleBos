"""Account-Folder association table (many-to-many)."""

import uuid

from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class AccountFolderMember(Base):
    __tablename__ = "account_folder_members"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    folder_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("account_folders.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("telegram_accounts.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    __table_args__ = (
        UniqueConstraint("folder_id", "account_id", name="uq_folder_account"),
    )

    # Relationships
    folder: Mapped["AccountFolder"] = relationship("AccountFolder", back_populates="members")
    account: Mapped["TelegramAccount"] = relationship("TelegramAccount")
