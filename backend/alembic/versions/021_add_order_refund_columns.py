"""Add is_refunded and refunded_amount columns to orders

Revision ID: 021
Revises: 020
Create Date: 2026-10-11
"""

from alembic import op
import sqlalchemy as sa

revision = "021"
down_revision = "020"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    cols = {c["name"] for c in inspector.get_columns("orders")}

    if "is_refunded" not in cols:
        op.add_column(
            "orders",
            sa.Column("is_refunded", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        )
        op.create_index("ix_orders_is_refunded", "orders", ["is_refunded"])

    if "refunded_amount" not in cols:
        op.add_column(
            "orders",
            sa.Column("refunded_amount", sa.BigInteger(), nullable=False, server_default=sa.text("0")),
        )


def downgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    cols = {c["name"] for c in inspector.get_columns("orders")}

    if "is_refunded" in cols:
        op.drop_index("ix_orders_is_refunded", table_name="orders")
        op.drop_column("orders", "is_refunded")

    if "refunded_amount" in cols:
        op.drop_column("orders", "refunded_amount")
