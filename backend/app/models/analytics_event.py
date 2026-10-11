"""Analytics models — event stream and daily rollup snapshots."""

from datetime import date, datetime, timezone
import uuid

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class AnalyticsEvent(Base):
    """Immutable audit and telemetry event journal.

    Separates product, financial, automation, account, subscription, and system
    events while enforcing payload sanitization and idempotent deduplication.
    """

    __tablename__ = "analytics_events"
    __table_args__ = (
        CheckConstraint(
            "event_category IN ('product', 'financial', 'automation', 'account', 'subscription', 'system')",
            name="chk_analytics_event_category",
        ),
        Index("ix_analytics_events_name_created", "event_name", "created_at"),
        Index("ix_analytics_events_user_created", "user_id", "created_at"),
        Index("ix_analytics_events_category_created", "event_category", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    event_category: Mapped[str] = mapped_column(
        String(32), nullable=False, index=True
    )  # product, financial, automation, account, subscription, system
    event_name: Mapped[str] = mapped_column(
        String(64), nullable=False, index=True
    )  # user_registered, user_login, account_connected, etc.

    # Sanitized, structured event properties (PII masked, passwords/tokens strictly forbidden)
    properties: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict, server_default="{}"
    )

    # Optional deduplication token to prevent double-counting across retries or replays
    dedup_key: Mapped[str | None] = mapped_column(
        String(128), unique=True, nullable=True, index=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        nullable=False,
        index=True,
    )

    # Relationship
    user: Mapped["User | None"] = relationship("User", foreign_keys=[user_id])


class DailyAnalyticsSnapshot(Base):
    """Pre-aggregated daily metrics rollup for ultra-fast analytics dashboard queries."""

    __tablename__ = "daily_analytics_snapshots"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    snapshot_date: Mapped[date] = mapped_column(
        Date, unique=True, nullable=False, index=True
    )

    # User metrics
    new_users_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    active_users_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Automation metrics
    total_broadcast_sent: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_broadcast_failed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_invites_sent: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Financial & revenue metrics (IDR)
    smm_gross_revenue: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    smm_provider_cost: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    smm_net_margin: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    marketplace_gmv: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    marketplace_margin: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    topup_volume: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    withdraw_volume: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    user_balance_liability: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)

    # Flexible metadata for custom segment breakdowns
    metadata_json: Mapped[dict] = mapped_column(
        "metadata", JSONB, nullable=False, default=dict, server_default="{}"
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
