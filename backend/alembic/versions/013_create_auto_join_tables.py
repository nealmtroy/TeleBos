"""create auto-join job tables

Revision ID: 013
Revises: 012
Create Date: 2026-10-02 00:00:00

Auto-join used to run entirely in the browser, so closing the tab dropped the
run and its log. It now runs in the async worker like Broadcast and Invite, and
needs somewhere to persist the job and its per-join log.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "013"
down_revision = "012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "auto_join_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "account_ids",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "targets",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "distribution_mode",
            sa.String(20),
            nullable=False,
            server_default="all",
        ),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("total_tasks", sa.Integer, nullable=False, server_default="0"),
        sa.Column("success_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("already_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("fail_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("progress", sa.Integer, nullable=False, server_default="0"),
        sa.Column("delay_per_group", sa.Integer, nullable=False, server_default="5"),
        sa.Column("delay_randomized", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_auto_join_jobs_user_id", "auto_join_jobs", ["user_id"])

    op.create_table(
        "auto_join_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("job_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("target", sa.String(500), nullable=False),
        sa.Column("target_type", sa.String(20), nullable=True),
        sa.Column("chat_id", sa.BigInteger, nullable=True),
        sa.Column("chat_title", sa.String(500), nullable=True),
        sa.Column("chat_username", sa.String(255), nullable=True),
        sa.Column("chat_type", sa.String(20), nullable=True),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("error_type", sa.String(50), nullable=True),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column(
            "joined_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("account_id_used", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("account_name", sa.String(255), nullable=True),
        sa.ForeignKeyConstraint(["job_id"], ["auto_join_jobs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["account_id_used"], ["telegram_accounts.id"], ondelete="SET NULL"
        ),
    )
    op.create_index("ix_auto_join_logs_job_id", "auto_join_logs", ["job_id"])
    op.create_index("ix_auto_join_logs_account_id_used", "auto_join_logs", ["account_id_used"])
    op.create_index(
        "ix_auto_join_logs_job_joined", "auto_join_logs", ["job_id", "joined_at"]
    )
    op.create_index(
        "ix_auto_join_logs_job_status", "auto_join_logs", ["job_id", "status"]
    )


def downgrade() -> None:
    op.drop_table("auto_join_logs")
    op.drop_table("auto_join_jobs")
