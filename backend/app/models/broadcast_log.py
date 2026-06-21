"""Per-group broadcast delivery log."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, Integer, Text, func, ForeignKey, BigInteger, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class BroadcastLog(Base):
    __tablename__ = "broadcast_logs"

    __table_args__ = (
        Index("ix_broadcast_logs_job_sent", "job_id", "sent_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    job_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("broadcast_jobs.id", ondelete="CASCADE"),
        nullable=False,
    )
    account_id_used: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("telegram_accounts.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )

    cycle_number: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    # Text (unbounded) — some imported group_list items can be very long
    # (e.g. a paste of many links that wasn't split). Don't fail the insert on length.
    group_identifier: Mapped[str] = mapped_column(Text, nullable=False)
    group_id: Mapped[int | None] = mapped_column(BigInteger)

    status: Mapped[str] = mapped_column(String(20), nullable=False)  # success, error
    error_type: Mapped[str | None] = mapped_column(
        String(50)
    )  # muted, banned, flood, slowmode, admin_only, invalid_username, invalid_link, etc.
    error_message: Mapped[str | None] = mapped_column(Text)
    sent_text: Mapped[str | None] = mapped_column(Text)

    sent_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    duration_ms: Mapped[int | None] = mapped_column(Integer)

    # Relationships
    job: Mapped["BroadcastJob"] = relationship("BroadcastJob", back_populates="logs")
