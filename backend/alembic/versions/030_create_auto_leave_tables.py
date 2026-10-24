"""create auto-leave job and log tables

Revision ID: 030
Revises: 029
Create Date: 2026-10-24 08:00:00

Tracks auto-leave bulk jobs (leaving groups and channels) and detailed logs per attempt.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "030"
down_revision = "029"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    if "auto_leave_jobs" not in existing_tables:
        op.create_table(
            "auto_leave_jobs",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column(
                "account_ids",
                postgresql.JSONB(),
                nullable=False,
                server_default=sa.text("'[]'::jsonb"),
            ),
            sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column(
                "leave_type",
                sa.String(20),
                nullable=False,
                server_default="groups",
            ),
            sa.Column(
                "skip_creator",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("true"),
            ),
            sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
            sa.Column("total_tasks", sa.Integer, nullable=False, server_default="0"),
            sa.Column("success_count", sa.Integer, nullable=False, server_default="0"),
            sa.Column("skipped_count", sa.Integer, nullable=False, server_default="0"),
            sa.Column("fail_count", sa.Integer, nullable=False, server_default="0"),
            sa.Column("progress", sa.Integer, nullable=False, server_default="0"),
            sa.Column("delay_per_chat", sa.Integer, nullable=False, server_default="5"),
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
        op.create_index("ix_auto_leave_jobs_user_id", "auto_leave_jobs", ["user_id"])
        op.create_index(
            "ix_auto_leave_jobs_user_status", "auto_leave_jobs", ["user_id", "status"]
        )
        op.create_index(
            "ix_auto_leave_jobs_account_ids_gin",
            "auto_leave_jobs",
            ["account_ids"],
            postgresql_using="gin",
        )

    if "auto_leave_logs" not in existing_tables:
        op.create_table(
            "auto_leave_logs",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("job_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("target", sa.String(500), nullable=False),
            sa.Column("chat_id", sa.BigInteger, nullable=True),
            sa.Column("chat_title", sa.String(500), nullable=True),
            sa.Column("chat_username", sa.String(255), nullable=True),
            sa.Column("chat_type", sa.String(20), nullable=True),
            sa.Column("status", sa.String(20), nullable=False),
            sa.Column("error_type", sa.String(50), nullable=True),
            sa.Column("error_message", sa.Text, nullable=True),
            sa.Column(
                "left_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.Column("account_id_used", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("account_name", sa.String(255), nullable=True),
            sa.ForeignKeyConstraint(["job_id"], ["auto_leave_jobs.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(
                ["account_id_used"], ["telegram_accounts.id"], ondelete="SET NULL"
            ),
        )
        op.create_index("ix_auto_leave_logs_job_id", "auto_leave_logs", ["job_id"])
        op.create_index(
            "ix_auto_leave_logs_account_id_used", "auto_leave_logs", ["account_id_used"]
        )
        op.create_index(
            "ix_auto_leave_logs_job_left", "auto_leave_logs", ["job_id", "left_at"]
        )
        op.create_index(
            "ix_auto_leave_logs_job_status", "auto_leave_logs", ["job_id", "status"]
        )


def downgrade() -> None:
    op.drop_table("auto_leave_logs")
    op.drop_table("auto_leave_jobs")
