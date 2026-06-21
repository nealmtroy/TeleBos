"""Add cycle_number column to broadcast_logs"""

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade():
    """Add cycle_number column if it doesn't exist."""
    from alembic import op
    from sqlalchemy import inspect, text

    conn = op.get_bind()
    inspector = inspect(conn)
    columns = [c["name"] for c in inspector.get_columns("broadcast_logs")]

    if "cycle_number" not in columns:
        op.execute(
            "ALTER TABLE broadcast_logs ADD COLUMN cycle_number INTEGER DEFAULT 1 NOT NULL"
        )


def downgrade():
    """No-op — we don't drop columns in rollback."""
    pass
