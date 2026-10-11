"""Add is_premium column to telegram_accounts

Revision ID: 020
Revises: 019
Create Date: 2026-10-10
"""

from alembic import op
import sqlalchemy as sa

revision = "020"
down_revision = "019"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    cols = {c["name"] for c in inspector.get_columns("telegram_accounts")}

    if "is_premium" not in cols:
        op.add_column(
            "telegram_accounts",
            sa.Column("is_premium", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        )
        op.create_index("ix_telegram_accounts_is_premium", "telegram_accounts", ["is_premium"])


def downgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    cols = {c["name"] for c in inspector.get_columns("telegram_accounts")}

    if "is_premium" in cols:
        op.drop_index("ix_telegram_accounts_is_premium", table_name="telegram_accounts")
        op.drop_column("telegram_accounts", "is_premium")
