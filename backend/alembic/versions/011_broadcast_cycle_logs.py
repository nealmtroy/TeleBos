"""migrate broadcast_logs to cycle-level storage with JSONB details

Revision ID: 011
Revises: 010
Create Date: 2026-09-08 00:00:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "011"
down_revision = "010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Truncate stale flat logs to immediately free disk space (742MB+)
    op.execute("TRUNCATE TABLE broadcast_logs;")

    # 2. Drop old indexes
    try:
        op.drop_index("ix_broadcast_logs_job_sent", table_name="broadcast_logs")
    except Exception:
        pass

    try:
        op.drop_index("ix_broadcast_logs_account_id_used", table_name="broadcast_logs")
    except Exception:
        pass

    # 3. Drop old foreign key and per-message columns
    try:
        op.drop_constraint("broadcast_logs_account_id_used_fkey", "broadcast_logs", type_="foreignkey")
    except Exception:
        pass

    columns_to_drop = [
        "account_id_used",
        "group_identifier",
        "group_id",
        "status",
        "error_type",
        "error_message",
        "sent_text",
        "sent_at",
    ]
    for col in columns_to_drop:
        try:
            op.drop_column("broadcast_logs", col)
        except Exception:
            pass

    # 4. Add cycle-level aggregate columns and JSONB details
    op.add_column(
        "broadcast_logs",
        sa.Column("total_groups", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "broadcast_logs",
        sa.Column("sent_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "broadcast_logs",
        sa.Column("fail_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "broadcast_logs",
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.add_column(
        "broadcast_logs",
        sa.Column(
            "details",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )

    # 5. Create new indexes for cycle-based queries
    op.create_index(
        "ix_broadcast_logs_job_cycle",
        "broadcast_logs",
        ["job_id", "cycle_number"],
    )
    op.create_index(
        "ix_broadcast_logs_job_created",
        "broadcast_logs",
        ["job_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_broadcast_logs_job_created", table_name="broadcast_logs")
    op.drop_index("ix_broadcast_logs_job_cycle", table_name="broadcast_logs")

    op.drop_column("broadcast_logs", "details")
    op.drop_column("broadcast_logs", "created_at")
    op.drop_column("broadcast_logs", "fail_count")
    op.drop_column("broadcast_logs", "sent_count")
    op.drop_column("broadcast_logs", "total_groups")

    op.add_column("broadcast_logs", sa.Column("sent_at", sa.DateTime(timezone=True), server_default=sa.func.now()))
    op.add_column("broadcast_logs", sa.Column("sent_text", sa.Text(), nullable=True))
    op.add_column("broadcast_logs", sa.Column("error_message", sa.Text(), nullable=True))
    op.add_column("broadcast_logs", sa.Column("error_type", sa.String(50), nullable=True))
    op.add_column("broadcast_logs", sa.Column("status", sa.String(20), nullable=False, server_default="error"))
    op.add_column("broadcast_logs", sa.Column("group_id", sa.BigInteger(), nullable=True))
    op.add_column("broadcast_logs", sa.Column("group_identifier", sa.Text(), nullable=False, server_default=""))
    op.add_column("broadcast_logs", sa.Column("account_id_used", postgresql.UUID(as_uuid=True), nullable=True))

    op.create_foreign_key(
        "broadcast_logs_account_id_used_fkey",
        "broadcast_logs",
        "telegram_accounts",
        ["account_id_used"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_broadcast_logs_job_sent", "broadcast_logs", ["job_id", "sent_at"])
