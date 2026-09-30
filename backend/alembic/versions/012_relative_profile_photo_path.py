"""Normalize telegram_accounts.profile_photo_path to a relative filename

The column used to store an absolute OS path (e.g. a Windows dev path or a
container path). Those go stale the moment the app runs on a different host or
image, and the backend never needed them: photo_helper.get_photo_path()
recomputes the real location from the account id.

This migration rewrites every stored value to the bare ``"<account_id>.jpg"``
filename so the value stays portable. Rows whose filename no longer matches the
account id (or is empty) are nulled, which is the same "no cached photo" state
the response schema already produces for missing files.
"""

import os

revision = "012"
down_revision = "011"
branch_labels = None
depends_on = None


def _basename(value: str) -> str:
    """Return the filename portion of a stored path, POSIX or Windows style."""
    return os.path.basename(value.replace("\\", "/").rstrip("/"))


def upgrade():
    from alembic import op
    from sqlalchemy import inspect, text

    conn = op.get_bind()
    inspector = inspect(conn)
    if "telegram_accounts" not in inspector.get_table_names():
        return
    cols = {c["name"] for c in inspector.get_columns("telegram_accounts")}
    if "profile_photo_path" not in cols:
        return

    rows = conn.execute(
        text("SELECT id, profile_photo_path FROM telegram_accounts "
             "WHERE profile_photo_path IS NOT NULL AND profile_photo_path <> ''")
    ).fetchall()

    for account_id, stored in rows:
        expected = f"{account_id}.jpg"
        new_value = expected if _basename(stored) == expected else None
        conn.execute(
            text("UPDATE telegram_accounts SET profile_photo_path = :value "
                 "WHERE id = :id"),
            {"value": new_value, "id": account_id},
        )


def downgrade():
    # No reverse: the absolute directory prefix is not recoverable from the
    # filename alone, and the application does not depend on it.
    pass
