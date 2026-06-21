"""Widen broadcast_logs.group_identifier from VARCHAR(500) to TEXT

Some group_list items contain very long pasted blobs (multiple links merged
into one value). The 500-char cap caused asyncpg StringDataRightTruncationError
and rolled back the whole broadcast transaction.
"""

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade():
    from alembic import op
    from sqlalchemy import inspect

    conn = op.get_bind()
    inspector = inspect(conn)
    cols = {c["name"]: c for c in inspector.get_columns("broadcast_logs")}

    if "group_identifier" in cols:
        op.execute(
            "ALTER TABLE broadcast_logs "
            "ALTER COLUMN group_identifier TYPE TEXT "
            "USING group_identifier::TEXT"
        )


def downgrade():
    # No-op: narrowing back to VARCHAR(500) would truncate data.
    pass
