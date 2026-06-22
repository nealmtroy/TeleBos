"""Add photo_version column to telegram_accounts

Version-based profile photo caching: each account tracks a photo_version
counter that increments on photo upload/delete. The frontend uses this
in the URL (?v=N) instead of Date.now() so browser caching works properly.
"""

revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None


def upgrade():
    from alembic import op
    from sqlalchemy import inspect

    conn = op.get_bind()
    inspector = inspect(conn)
    cols = {c["name"]: c for c in inspector.get_columns("telegram_accounts")}

    if "photo_version" not in cols:
        op.execute(
            "ALTER TABLE telegram_accounts "
            "ADD COLUMN photo_version BIGINT NOT NULL DEFAULT 0"
        )


def downgrade():
    from alembic import op
    from sqlalchemy import inspect

    conn = op.get_bind()
    inspector = inspect(conn)
    cols = {c["name"]: c for c in inspector.get_columns("telegram_accounts")}

    if "photo_version" in cols:
        op.execute("ALTER TABLE telegram_accounts DROP COLUMN photo_version")
