"""add avatar metadata

Revision ID: 009
Revises: 008
Create Date: 2026-07-28 20:00:00
"""

from alembic import op
import sqlalchemy as sa


revision = "009"
down_revision = "008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    account_columns = {
        column["name"] for column in inspector.get_columns("telegram_accounts")
    }
    if "color_id" not in account_columns:
        op.add_column(
            "telegram_accounts", sa.Column("color_id", sa.Integer(), nullable=True)
        )

    chat_columns = {
        column["name"] for column in inspector.get_columns("telegram_chats")
    }
    if "photo_version" not in chat_columns:
        op.add_column(
            "telegram_chats", sa.Column("photo_version", sa.BigInteger(), nullable=True)
        )


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    chat_columns = {
        column["name"] for column in inspector.get_columns("telegram_chats")
    }
    if "photo_version" in chat_columns:
        op.drop_column("telegram_chats", "photo_version")

    account_columns = {
        column["name"] for column in inspector.get_columns("telegram_accounts")
    }
    if "color_id" in account_columns:
        op.drop_column("telegram_accounts", "color_id")
