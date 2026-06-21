"""Invite job — tracks a member invite operation from source groups to destination."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, Integer, Text, func, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class InviteJob(Base):
    __tablename__ = "invite_jobs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # Multiple accounts (JSONB array of UUID strings) for round-robin inviting
    account_ids: Mapped[list[str]] = mapped_column(
        JSONB, default=list, nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    # Destination group/channel
    destination_group: Mapped[str] = mapped_column(String(500), nullable=False)
    destination_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default="username"
    )  # username, link, group_id

    # Source groups — JSON array of {"type": "...", "value": "..."}
    source_groups: Mapped[list[dict]] = mapped_column(
        JSONB, default=list, nullable=False
    )

    status: Mapped[str] = mapped_column(
        String(20), default="pending"
    )  # pending, running, paused, completed, cancelled, failed

    # Counters
    total_members: Mapped[int] = mapped_column(Integer, default=0)
    invited_count: Mapped[int] = mapped_column(Integer, default=0)
    already_member_count: Mapped[int] = mapped_column(Integer, default=0)
    fail_count: Mapped[int] = mapped_column(Integer, default=0)
    skip_count: Mapped[int] = mapped_column(Integer, default=0)
    progress: Mapped[int] = mapped_column(Integer, default=0)

    # Delay settings
    delay_per_invite: Mapped[int] = mapped_column(Integer, default=30)
    delay_per_batch: Mapped[int] = mapped_column(Integer, default=60)
    batch_size: Mapped[int] = mapped_column(Integer, default=5)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Relationships
    logs: Mapped[list["InviteLog"]] = relationship(
        "InviteLog", back_populates="job", cascade="all, delete-orphan"
    )
