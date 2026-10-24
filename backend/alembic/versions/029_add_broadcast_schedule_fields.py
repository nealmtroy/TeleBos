"""Add schedule fields to broadcast_jobs.

Revision ID: 029
Revises: 028
Create Date: 2026-10-24
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "029"
down_revision = "028"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()

    if "broadcast_jobs" in tables:
        columns = {col["name"] for col in inspector.get_columns("broadcast_jobs")}
        if "schedule_enabled" not in columns:
            op.add_column(
                "broadcast_jobs",
                sa.Column("schedule_enabled", sa.Boolean(), nullable=False, server_default="false"),
            )
        if "schedule_start_time" not in columns:
            op.add_column(
                "broadcast_jobs",
                sa.Column("schedule_start_time", sa.String(5), nullable=True),
            )
        if "schedule_end_time" not in columns:
            op.add_column(
                "broadcast_jobs",
                sa.Column("schedule_end_time", sa.String(5), nullable=True),
            )
        if "schedule_timezone" not in columns:
            op.add_column(
                "broadcast_jobs",
                sa.Column("schedule_timezone", sa.String(50), nullable=False, server_default="Asia/Jakarta"),
            )
        if "schedule_paused" not in columns:
            op.add_column(
                "broadcast_jobs",
                sa.Column("schedule_paused", sa.Boolean(), nullable=False, server_default="false"),
            )


def downgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()

    if "broadcast_jobs" in tables:
        columns = {col["name"] for col in inspector.get_columns("broadcast_jobs")}
        for col_name in ["schedule_enabled", "schedule_start_time", "schedule_end_time", "schedule_timezone", "schedule_paused"]:
            if col_name in columns:
                op.drop_column("broadcast_jobs", col_name)
