"""Per-member invite log — tracks the result of each invite attempt."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, Integer, Text, func, ForeignKey, BigInteger, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class InviteLog(Base):
    __tablename__ = "invite_logs"

    __table_args__ = (
        Index("ix_invite_logs_job_invited", "job_id", "invited_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    job_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("invite_jobs.id", ondelete="CASCADE"),
        nullable=False,
    )

    # Telegram user info
    user_id_tg: Mapped[int] = mapped_column(BigInteger, nullable=False)
    username: Mapped[str | None] = mapped_column(String(255))
    first_name: Mapped[str | None] = mapped_column(String(255))

    # Which source group this member came from
    source_group: Mapped[str] = mapped_column(String(500), nullable=False)

    # Result
    status: Mapped[str] = mapped_column(
        String(20), nullable=False
    )  # success, error, skipped, already_member
    error_type: Mapped[str | None] = mapped_column(String(50))
    error_message: Mapped[str | None] = mapped_column(Text)

    invited_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    account_id_used: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("telegram_accounts.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )

    # Relationships
    job: Mapped["InviteJob"] = relationship("InviteJob", back_populates="logs")
