"""Per-cycle broadcast delivery log with JSONB group details."""

import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy import DateTime, Integer, func, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class BroadcastLog(Base):
    __tablename__ = "broadcast_logs"

    __table_args__ = (
        Index("ix_broadcast_logs_job_cycle", "job_id", "cycle_number"),
        Index("ix_broadcast_logs_job_created", "job_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    job_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("broadcast_jobs.id", ondelete="CASCADE"),
        nullable=False,
    )

    cycle_number: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    total_groups: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    sent_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    fail_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Details of each group delivery attempt in this cycle
    details: Mapped[list[dict]] = mapped_column(
        JSONB().with_variant(sa.JSON(), "sqlite"),
        default=list,
        server_default=sa.text("'[]'"),
        nullable=False,
    )

    # Relationships
    job: Mapped["BroadcastJob"] = relationship("BroadcastJob", back_populates="logs")

