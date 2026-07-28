"""add color_id to telegram_chats

Revision ID: 008
Revises: 007
Create Date: 2026-07-28 19:25:00
"""

from alembic import op
import sqlalchemy as sa

revision = "008"
down_revision = "007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    cols = {c["name"]: c for c in inspector.get_columns("telegram_chats")}

    if "color_id" not in cols:
        op.add_column("telegram_chats", sa.Column("color_id", sa.Integer(), nullable=True))


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    cols = {c["name"]: c for c in inspector.get_columns("telegram_chats")}

    if "color_id" in cols:
        op.drop_column("telegram_chats", "color_id")
