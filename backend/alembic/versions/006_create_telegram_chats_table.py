"""Create telegram_chats table

Caching Telegram groups, channels, supergroups, and user chats in PostgreSQL to avoid FloodWaitError.
"""

revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


def upgrade():
    from alembic import op
    from sqlalchemy import inspect, Column, String, Integer, Text, BigInteger, Boolean, DateTime, ForeignKey, UniqueConstraint
    import sqlalchemy as sa
    from sqlalchemy.dialects.postgresql import UUID

    conn = op.get_bind()
    inspector = inspect(conn)
    tables = inspector.get_table_names()

    if "telegram_chats" not in tables:
        op.create_table(
            "telegram_chats",
            Column("id", UUID(as_uuid=True), primary_key=True),
            Column(
                "account_id",
                UUID(as_uuid=True),
                ForeignKey("telegram_accounts.id", ondelete="CASCADE"),
                nullable=False,
            ),
            Column("chat_id", BigInteger, nullable=False),
            Column("title", String(255), nullable=False),
            Column("username", String(255), nullable=True),
            Column("type", String(50), nullable=False),
            Column("unread_count", Integer, nullable=False, server_default="0"),
            Column("last_message", Text, nullable=True),
            Column("last_message_date", DateTime(timezone=True), nullable=True),
            Column("photo_url", String(500), nullable=True),
            Column("is_active", Boolean, nullable=False, server_default="true"),
            Column("is_creator", Boolean, nullable=False, server_default="false"),
            Column("created_at", DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            Column("updated_at", DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            UniqueConstraint("account_id", "chat_id", name="uq_telegram_chat_account_chat"),
        )
        op.create_index("ix_telegram_chats_account_id", "telegram_chats", ["account_id"])
        op.create_index("ix_telegram_chats_chat_id", "telegram_chats", ["chat_id"])


def downgrade():
    from alembic import op
    from sqlalchemy import inspect

    conn = op.get_bind()
    inspector = inspect(conn)
    tables = inspector.get_table_names()

    if "telegram_chats" in tables:
        op.drop_table("telegram_chats")
