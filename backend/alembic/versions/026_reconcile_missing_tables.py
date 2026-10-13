"""Reconcile 6 missing production tables into official Alembic revision tree (DB-01 / ARCH-02 / TASK-25)

Creates:
1. telegram_id_prefix_prices
2. account_folders
3. account_folder_members
4. telegram_registration_datapoints
5. support_tickets
6. security_audit_logs

Revision ID: 026
Revises: 025
Create Date: 2026-10-13
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "026"
down_revision = "025"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()

    is_pg = conn.dialect.name == "postgresql"
    json_type = sa.JSON().with_variant(JSONB, "postgresql")
    json_empty_array = sa.text("'[]'::jsonb") if is_pg else sa.text("'[]'")
    json_empty_dict = sa.text("'{}'::jsonb") if is_pg else sa.text("'{}'")

    # 1. telegram_id_prefix_prices
    if "telegram_id_prefix_prices" not in tables:
        op.create_table(
            "telegram_id_prefix_prices",
            sa.Column(
                "id",
                UUID(as_uuid=True),
                primary_key=True,
                server_default=sa.text("gen_random_uuid()"),
            ),
            sa.Column("id_prefix", sa.String(20), nullable=False),
            sa.Column(
                "sell_price",
                sa.BigInteger(),
                nullable=False,
                server_default=sa.text("5500"),
            ),
            sa.Column("buy_price", sa.BigInteger(), nullable=True),
            sa.Column("note", sa.Text(), nullable=True),
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
        op.create_index(
            "ix_telegram_id_prefix_prices_id_prefix",
            "telegram_id_prefix_prices",
            ["id_prefix"],
            unique=True,
        )

    # 2. account_folders
    if "account_folders" not in tables:
        op.create_table(
            "account_folders",
            sa.Column(
                "id",
                UUID(as_uuid=True),
                primary_key=True,
                server_default=sa.text("gen_random_uuid()"),
            ),
            sa.Column(
                "user_id",
                UUID(as_uuid=True),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("name", sa.String(100), nullable=False),
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
        op.create_index("ix_account_folders_user_id", "account_folders", ["user_id"])

    # 3. account_folder_members
    if "account_folder_members" not in tables:
        op.create_table(
            "account_folder_members",
            sa.Column(
                "id",
                UUID(as_uuid=True),
                primary_key=True,
                server_default=sa.text("gen_random_uuid()"),
            ),
            sa.Column(
                "folder_id",
                UUID(as_uuid=True),
                sa.ForeignKey("account_folders.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "account_id",
                UUID(as_uuid=True),
                sa.ForeignKey("telegram_accounts.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.UniqueConstraint("folder_id", "account_id", name="uq_folder_account"),
        )
        op.create_index(
            "ix_account_folder_members_folder",
            "account_folder_members",
            ["folder_id"],
        )
        op.create_index(
            "ix_account_folder_members_account",
            "account_folder_members",
            ["account_id"],
        )

    # 4. telegram_registration_datapoints
    if "telegram_registration_datapoints" not in tables:
        op.create_table(
            "telegram_registration_datapoints",
            sa.Column("telegram_id", sa.BigInteger(), primary_key=True),
            sa.Column("registered_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column(
                "source",
                sa.String(50),
                nullable=False,
                server_default=sa.text("'seeded'"),
            ),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
        )
        op.create_index(
            "ix_telegram_registration_datapoints_registered_at",
            "telegram_registration_datapoints",
            ["registered_at"],
        )

    # 5. support_tickets
    if "support_tickets" not in tables:
        op.create_table(
            "support_tickets",
            sa.Column(
                "id",
                UUID(as_uuid=True),
                primary_key=True,
                server_default=sa.text("gen_random_uuid()"),
            ),
            sa.Column(
                "ticket_number",
                sa.String(30),
                nullable=False,
                unique=True,
            ),
            sa.Column(
                "user_id",
                UUID(as_uuid=True),
                sa.ForeignKey("users.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column("guest_name", sa.String(100), nullable=True),
            sa.Column("guest_contact", sa.String(150), nullable=True),
            sa.Column(
                "category",
                sa.String(50),
                nullable=False,
                server_default=sa.text("'general'"),
            ),
            sa.Column(
                "status",
                sa.String(20),
                nullable=False,
                server_default=sa.text("'open'"),
            ),
            sa.Column(
                "priority",
                sa.String(20),
                nullable=False,
                server_default=sa.text("'normal'"),
            ),
            sa.Column("subject", sa.String(255), nullable=False),
            sa.Column("summary", sa.Text(), nullable=True),
            sa.Column(
                "transcript",
                json_type,
                nullable=False,
                server_default=json_empty_array,
            ),
            sa.Column(
                "related_order_id",
                UUID(as_uuid=True),
                sa.ForeignKey("orders.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column("escalation_reason", sa.Text(), nullable=True),
            sa.Column("admin_notes", sa.Text(), nullable=True),
            sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
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
        op.create_index(
            "ix_support_tickets_ticket_number",
            "support_tickets",
            ["ticket_number"],
        )
        op.create_index("ix_support_tickets_user_id", "support_tickets", ["user_id"])
        op.create_index("ix_support_tickets_status", "support_tickets", ["status"])
        op.create_index(
            "ix_support_tickets_created_at",
            "support_tickets",
            ["created_at"],
        )

    # 6. security_audit_logs
    if "security_audit_logs" not in tables:
        op.create_table(
            "security_audit_logs",
            sa.Column(
                "id",
                UUID(as_uuid=True),
                primary_key=True,
                server_default=sa.text("gen_random_uuid()"),
            ),
            sa.Column(
                "actor_id",
                UUID(as_uuid=True),
                sa.ForeignKey("users.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column("actor_email", sa.String(255), nullable=True),
            sa.Column("actor_role", sa.String(32), nullable=True),
            sa.Column("action", sa.String(64), nullable=False),
            sa.Column(
                "target_type",
                sa.String(64),
                nullable=False,
                server_default=sa.text("'system'"),
            ),
            sa.Column("target_id", sa.String(128), nullable=True),
            sa.Column("target_label", sa.String(255), nullable=True),
            sa.Column(
                "outcome",
                sa.String(16),
                nullable=False,
                server_default=sa.text("'success'"),
            ),
            sa.Column(
                "severity",
                sa.String(16),
                nullable=False,
                server_default=sa.text("'info'"),
            ),
            sa.Column("ip_address", sa.String(64), nullable=True),
            sa.Column("user_agent", sa.String(255), nullable=True),
            sa.Column(
                "metadata",
                json_type,
                nullable=False,
                server_default=json_empty_dict,
            ),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
        )
        op.create_index(
            "ix_security_audit_logs_created_at",
            "security_audit_logs",
            ["created_at"],
        )
        op.create_index(
            "ix_security_audit_logs_action",
            "security_audit_logs",
            ["action"],
        )
        op.create_index(
            "ix_security_audit_logs_actor_id",
            "security_audit_logs",
            ["actor_id"],
        )
        op.create_index(
            "ix_security_audit_logs_actor_email",
            "security_audit_logs",
            ["actor_email"],
        )
        op.create_index(
            "ix_security_audit_logs_outcome",
            "security_audit_logs",
            ["outcome"],
        )
        op.create_index(
            "ix_security_audit_logs_severity",
            "security_audit_logs",
            ["severity"],
        )
        op.create_index(
            "ix_security_audit_logs_action_created",
            "security_audit_logs",
            ["action", "created_at"],
        )


def downgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()

    # Drop in reverse foreign-key dependency order
    if "security_audit_logs" in tables:
        op.drop_table("security_audit_logs")

    if "support_tickets" in tables:
        op.drop_table("support_tickets")

    if "telegram_registration_datapoints" in tables:
        op.drop_table("telegram_registration_datapoints")

    if "account_folder_members" in tables:
        op.drop_table("account_folder_members")

    if "account_folders" in tables:
        op.drop_table("account_folders")

    if "telegram_id_prefix_prices" in tables:
        op.drop_table("telegram_id_prefix_prices")
