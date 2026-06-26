"""Broadcast job — tracks a broadcast session."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, Integer, Text, func, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from app.models.group_list import GroupList
    from app.models.text_list import TextList
    from app.models.broadcast_log import BroadcastLog

from app.database import Base


class BroadcastJob(Base):
    __tablename__ = "broadcast_jobs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    account_ids: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    group_list_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("group_lists.id")
    )
    text_list_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("text_lists.id")
    )

    mode: Mapped[str] = mapped_column(String(20), nullable=False, default="single_text")
    custom_text: Mapped[str | None] = mapped_column(Text)

    status: Mapped[str] = mapped_column(
        String(20), default="pending"
    )  # pending, running, paused, completed, cancelled, failed

    progress: Mapped[int] = mapped_column(Integer, default=0)
    total_groups: Mapped[int] = mapped_column(Integer, default=0)
    sent_count: Mapped[int] = mapped_column(Integer, default=0)
    fail_count: Mapped[int] = mapped_column(Integer, default=0)

    delay_per_group: Mapped[int] = mapped_column(Integer, default=5)
    delay_after_all: Mapped[int] = mapped_column(Integer, default=0)
    loop_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    delay_randomized: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")

    log_destination: Mapped[str | None] = mapped_column(String(255), default=None, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Relationships
    logs: Mapped[list["BroadcastLog"]] = relationship(
        "BroadcastLog", back_populates="job", cascade="all, delete-orphan"
    )
    group_list: Mapped["GroupList"] = relationship("GroupList")
    text_list: Mapped["TextList | None"] = relationship("TextList")
