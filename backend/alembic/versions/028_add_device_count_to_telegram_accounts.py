"""Add device_count to telegram_accounts.

Revision ID: 028
Revises: 027
Create Date: 2026-10-24
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "028"
down_revision = "027"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()

    if "telegram_accounts" in tables:
        columns = {col["name"] for col in inspector.get_columns("telegram_accounts")}
        if "device_count" not in columns:
            op.add_column(
                "telegram_accounts",
                sa.Column("device_count", sa.BigInteger(), nullable=False, server_default="1"),
            )


def downgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()

    if "telegram_accounts" in tables:
        columns = {col["name"] for col in inspector.get_columns("telegram_accounts")}
        if "device_count" in columns:
            op.drop_column("telegram_accounts", "device_count")
