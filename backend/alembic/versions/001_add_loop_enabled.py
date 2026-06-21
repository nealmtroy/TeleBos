"""Add loop_enabled column to broadcast_jobs"""

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    """Add loop_enabled column if it doesn't exist."""
    from alembic import op
    from sqlalchemy import inspect

    conn = op.get_bind()
    inspector = inspect(conn)
    columns = [c["name"] for c in inspector.get_columns("broadcast_jobs")]

    if "loop_enabled" not in columns:
        op.execute("ALTER TABLE broadcast_jobs ADD COLUMN loop_enabled BOOLEAN DEFAULT false NOT NULL")


def downgrade():
    """No-op — we don't drop columns in rollback."""
    pass
