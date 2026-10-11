"""Add wallet_ledgers table for double-entry bookkeeping and balance reconciliation

Revision ID: 022
Revises: 021
Create Date: 2026-10-11
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "022"
down_revision = "021"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()

    if "wallet_ledgers" not in tables:
        op.create_table(
            "wallet_ledgers",
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
            sa.Column("entry_type", sa.String(16), nullable=False),
            sa.Column("amount", sa.BigInteger(), nullable=False),
            sa.Column("balance_before", sa.BigInteger(), nullable=False),
            sa.Column("balance_after", sa.BigInteger(), nullable=False),
            sa.Column("category", sa.String(32), nullable=False),
            sa.Column("reference_id", sa.String(64), nullable=True),
            sa.Column("description", sa.String(255), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
            sa.CheckConstraint("amount > 0", name="chk_ledger_amount_positive"),
            sa.CheckConstraint("entry_type IN ('DEBIT', 'CREDIT')", name="chk_ledger_entry_type"),
        )
        op.create_index("ix_wallet_ledgers_user_id", "wallet_ledgers", ["user_id"])
        op.create_index("ix_wallet_ledgers_entry_type", "wallet_ledgers", ["entry_type"])
        op.create_index("ix_wallet_ledgers_category", "wallet_ledgers", ["category"])
        op.create_index("ix_wallet_ledgers_reference_id", "wallet_ledgers", ["reference_id"])
        op.create_index("ix_wallet_ledgers_created_at", "wallet_ledgers", ["created_at"])
        op.create_index("ix_wallet_ledgers_user_created", "wallet_ledgers", ["user_id", "created_at"])

        # Baseline seed: credit existing balances so ledger reconciles from day 1
        op.execute(
            """
            INSERT INTO wallet_ledgers (id, user_id, entry_type, amount, balance_before, balance_after, category, description, created_at)
            SELECT gen_random_uuid(), id, 'CREDIT', balance, 0, balance, 'initial_balance', 'Baseline ledger balance prior to migration 022', NOW()
            FROM users
            WHERE balance > 0;
            """
        )


def downgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()

    if "wallet_ledgers" in tables:
        op.drop_table("wallet_ledgers")
