"""Security Audit Log model — immutable ledger of sensitive security and administrative actions."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class SecurityAuditLog(Base):
    """Immutable, append-only record of security and administrative events.

    Captures actor, action, target, outcome, validated IP, and sanitized metadata.
    Plaintext passwords, secrets, OTPs, session strings, and tokens are STRICTLY prohibited.
    """

    __tablename__ = "security_audit_logs"
    __table_args__ = (
        Index("ix_security_audit_logs_created_at", "created_at"),
        Index("ix_security_audit_logs_action", "action"),
        Index("ix_security_audit_logs_actor_id", "actor_id"),
        Index("ix_security_audit_logs_actor_email", "actor_email"),
        Index("ix_security_audit_logs_outcome", "outcome"),
        Index("ix_security_audit_logs_severity", "severity"),
        Index("ix_security_audit_logs_action_created", "action", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # Actor information
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    actor_email: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    actor_role: Mapped[str | None] = mapped_column(
        String(32), nullable=True
    )

    # Event identification
    action: Mapped[str] = mapped_column(
        String(64), nullable=False
    )  # e.g. auth.login, auth.password_change, admin.role_change, api_key.created

    # Target details
    target_type: Mapped[str] = mapped_column(
        String(64), nullable=False, default="system"
    )  # user, account, api_key, system
    target_id: Mapped[str | None] = mapped_column(
        String(128), nullable=True
    )
    target_label: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )

    # Status and classification
    outcome: Mapped[str] = mapped_column(
        String(16), nullable=False, default="success"
    )  # success, failure, warning
    severity: Mapped[str] = mapped_column(
        String(16), nullable=False, default="info"
    )  # info, warning, critical

    # Client networking info
    ip_address: Mapped[str | None] = mapped_column(
        String(64), nullable=True
    )
    user_agent: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )

    # Sanitized, structured metadata payload
    metadata_payload: Mapped[dict] = mapped_column(
        "metadata", JSONB, nullable=False, default=dict, server_default="{}"
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    actor: Mapped["User | None"] = relationship("User", foreign_keys=[actor_id])


__all__ = ["SecurityAuditLog"]
