"""Alter wallet_ledgers.user_id foreign key from CASCADE to RESTRICT

Revision ID: 024
Revises: 023
Create Date: 2026-10-13
"""

from alembic import op
import sqlalchemy as sa

revision = "024"
down_revision = "023"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()

    if "wallet_ledgers" not in tables:
        return

    # Find existing foreign key constraint referencing users
    fks = inspector.get_foreign_keys("wallet_ledgers")
    fk_name = "wallet_ledgers_user_id_fkey"
    for fk in fks:
        if fk.get("referred_table") == "users" and "user_id" in fk.get("constrained_columns", []):
            if fk.get("name"):
                fk_name = fk["name"]
            op.drop_constraint(fk_name, "wallet_ledgers", type_="foreignkey")
            break

    op.create_foreign_key(
        "wallet_ledgers_user_id_fkey",
        "wallet_ledgers",
        "users",
        ["user_id"],
        ["id"],
        ondelete="RESTRICT",
    )


def downgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()

    if "wallet_ledgers" not in tables:
        return

    fks = inspector.get_foreign_keys("wallet_ledgers")
    for fk in fks:
        if fk.get("referred_table") == "users" and "user_id" in fk.get("constrained_columns", []):
            op.drop_constraint(fk["name"], "wallet_ledgers", type_="foreignkey")
            break

    op.create_foreign_key(
        "wallet_ledgers_user_id_fkey",
        "wallet_ledgers",
        "users",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )
