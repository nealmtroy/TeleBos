"""Auto-leave job — tracks bulk group & channel leave operations for Telegram accounts."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class AutoLeaveJob(Base):
    __tablename__ = "auto_leave_jobs"
    __table_args__ = (
        Index("ix_auto_leave_jobs_account_ids_gin", "account_ids", postgresql_using="gin"),
        Index("ix_auto_leave_jobs_user_status", "user_id", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    account_ids: Mapped[list[str]] = mapped_column(
        JSONB, default=list, nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Leave target mode: "groups", "channels", or "both"
    leave_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default="groups"
    )

    # Whether to skip groups/channels where the account is the creator/owner
    skip_creator: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )

    # pending, running, paused, completed, cancelled, failed
    status: Mapped[str] = mapped_column(
        String(20), default="pending"
    )

    total_tasks: Mapped[int] = mapped_column(Integer, default=0)
    success_count: Mapped[int] = mapped_column(Integer, default=0)
    skipped_count: Mapped[int] = mapped_column(Integer, default=0)
    fail_count: Mapped[int] = mapped_column(Integer, default=0)
    progress: Mapped[int] = mapped_column(Integer, default=0)

    delay_per_chat: Mapped[int] = mapped_column(Integer, default=5)
    delay_randomized: Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    logs: Mapped[list["AutoLeaveLog"]] = relationship(
        "AutoLeaveLog", back_populates="job", cascade="all, delete-orphan"
    )
