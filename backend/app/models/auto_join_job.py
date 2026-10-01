"""Auto-join job — tracks a bulk "join these groups with these accounts" run.

Unlike the old browser-driven auto-join, the run lives here so it survives the
tab closing and can be paused, resumed and inspected later.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class AutoJoinJob(Base):
    __tablename__ = "auto_join_jobs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # JSONB array of UUID strings — the accounts that take part in the run
    account_ids: Mapped[list[str]] = mapped_column(
        JSONB, default=list, nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    # Targets to join — JSON array of {"type": "username"|"link", "value": "..."}
    targets: Mapped[list[dict]] = mapped_column(
        JSONB, default=list, nullable=False
    )

    # all  = every account joins every group
    # distribute = each group is handled by a single account, round-robin
    distribution_mode: Mapped[str] = mapped_column(
        String(20), nullable=False, default="all"
    )

    status: Mapped[str] = mapped_column(
        String(20), default="pending"
    )  # pending, running, paused, completed, cancelled, failed

    # Counters — number of joins attempted, not number of targets
    total_tasks: Mapped[int] = mapped_column(Integer, default=0)
    success_count: Mapped[int] = mapped_column(Integer, default=0)
    already_count: Mapped[int] = mapped_column(Integer, default=0)
    fail_count: Mapped[int] = mapped_column(Integer, default=0)
    progress: Mapped[int] = mapped_column(Integer, default=0)

    # Pacing. The delay applies between groups, not between individual joins.
    delay_per_group: Mapped[int] = mapped_column(Integer, default=5)
    delay_randomized: Mapped[bool] = mapped_column(default=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Relationships
    logs: Mapped[list["AutoJoinLog"]] = relationship(
        "AutoJoinLog", back_populates="job", cascade="all, delete-orphan"
    )
