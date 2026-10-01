"""Auto-join log — one row per join attempt, so a closed tab loses nothing."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class AutoJoinLog(Base):
    __tablename__ = "auto_join_logs"

    __table_args__ = (
        Index("ix_auto_join_logs_job_joined", "job_id", "joined_at"),
        Index("ix_auto_join_logs_job_status", "job_id", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    job_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("auto_join_jobs.id", ondelete="CASCADE"),
        nullable=False,
    )

    # What was being joined
    target: Mapped[str] = mapped_column(String(500), nullable=False)
    target_type: Mapped[str | None] = mapped_column(String(20))

    # Telegram metadata returned by the join
    chat_id: Mapped[int | None] = mapped_column(nullable=True)
    chat_title: Mapped[str | None] = mapped_column(String(500))
    chat_username: Mapped[str | None] = mapped_column(String(255))
    chat_type: Mapped[str | None] = mapped_column(String(20))

    # success, already_member, error
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    error_type: Mapped[str | None] = mapped_column(String(50))
    error_message: Mapped[str | None] = mapped_column(Text)

    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    account_id_used: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("telegram_accounts.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )
    account_name: Mapped[str | None] = mapped_column(String(255))

    # Relationships
    job: Mapped["AutoJoinJob"] = relationship("AutoJoinJob", back_populates="logs")