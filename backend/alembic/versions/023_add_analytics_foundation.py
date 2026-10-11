"""Add analytics_events and daily_analytics_snapshots tables with performance indexes

Revision ID: 023
Revises: 022
Create Date: 2026-10-12
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "023"
down_revision = "022"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()

    # 1. Create analytics_events table
    if "analytics_events" not in tables:
        op.create_table(
            "analytics_events",
            sa.Column(
                "id",
                UUID(as_uuid=True),
                primary_key=True,
                server_default=sa.text("gen_random_uuid()"),
            ),
            sa.Column(
                "user_id",
                UUID(as_uuid=True),
                sa.ForeignKey("users.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column("event_category", sa.String(32), nullable=False),
            sa.Column("event_name", sa.String(64), nullable=False),
            sa.Column(
                "properties",
                JSONB,
                nullable=False,
                server_default=sa.text("'{}'::jsonb"),
            ),
            sa.Column("dedup_key", sa.String(128), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
            sa.CheckConstraint(
                "event_category IN ('product', 'financial', 'automation', 'account', 'subscription', 'system')",
                name="chk_analytics_event_category",
            ),
        )
        op.create_index("ix_analytics_events_user_id", "analytics_events", ["user_id"])
        op.create_index("ix_analytics_events_category", "analytics_events", ["event_category"])
        op.create_index("ix_analytics_events_name", "analytics_events", ["event_name"])
        op.create_index("ix_analytics_events_created_at", "analytics_events", ["created_at"])
        op.create_index("uq_analytics_events_dedup_key", "analytics_events", ["dedup_key"], unique=True)
        op.create_index("ix_analytics_events_name_created", "analytics_events", ["event_name", "created_at"])
        op.create_index("ix_analytics_events_user_created", "analytics_events", ["user_id", "created_at"])
        op.create_index("ix_analytics_events_category_created", "analytics_events", ["event_category", "created_at"])

    # 2. Create daily_analytics_snapshots table
    if "daily_analytics_snapshots" not in tables:
        op.create_table(
            "daily_analytics_snapshots",
            sa.Column(
                "id",
                UUID(as_uuid=True),
                primary_key=True,
                server_default=sa.text("gen_random_uuid()"),
            ),
            sa.Column("snapshot_date", sa.Date(), nullable=False, unique=True),
            sa.Column("new_users_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("active_users_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("total_broadcast_sent", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("total_broadcast_failed", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("total_invites_sent", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("smm_gross_revenue", sa.BigInteger(), nullable=False, server_default="0"),
            sa.Column("smm_provider_cost", sa.BigInteger(), nullable=False, server_default="0"),
            sa.Column("smm_net_margin", sa.BigInteger(), nullable=False, server_default="0"),
            sa.Column("marketplace_gmv", sa.BigInteger(), nullable=False, server_default="0"),
            sa.Column("marketplace_margin", sa.BigInteger(), nullable=False, server_default="0"),
            sa.Column("topup_volume", sa.BigInteger(), nullable=False, server_default="0"),
            sa.Column("withdraw_volume", sa.BigInteger(), nullable=False, server_default="0"),
            sa.Column("user_balance_liability", sa.BigInteger(), nullable=False, server_default="0"),
            sa.Column("metadata", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
        )
        op.create_index("ix_daily_snapshots_date", "daily_analytics_snapshots", ["snapshot_date"], unique=True)

    # 3. Create performance indexes on high-volume tables for date-range analytics queries
    def ensure_index(table_name, index_name, columns):
        if table_name in tables:
            existing_indices = [idx["name"] for idx in inspector.get_indexes(table_name)]
            if index_name not in existing_indices:
                op.create_index(index_name, table_name, columns)

    ensure_index("orders", "ix_orders_created_at", ["created_at"])
    ensure_index("broadcast_logs", "ix_broadcast_logs_created_at", ["created_at"])
    ensure_index("telegram_accounts", "ix_telegram_accounts_created_at", ["created_at"])
    ensure_index("users", "ix_users_created_at", ["created_at"])
    ensure_index("users", "ix_users_role", ["role"])
    ensure_index("wallet_transactions", "ix_wallet_transactions_created_at", ["created_at"])


def downgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()

    if "daily_analytics_snapshots" in tables:
        op.drop_table("daily_analytics_snapshots")

    if "analytics_events" in tables:
        op.drop_table("analytics_events")
