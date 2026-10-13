"""Create user_bank_accounts table for server-side encrypted withdrawal destinations (SEC-03 / TASK-11)

Revision ID: 025
Revises: 024
Create Date: 2026-10-13
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "025"
down_revision = "024"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()

    if "user_bank_accounts" not in tables:
        op.create_table(
            "user_bank_accounts",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
            sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("account_type", sa.String(length=20), nullable=False, server_default="bank"),
            sa.Column("provider", sa.String(length=50), nullable=False),
            sa.Column("account_number_encrypted", sa.Text(), nullable=False),
            sa.Column("account_number_last4", sa.String(length=4), nullable=False),
            sa.Column("account_holder", sa.String(length=255), nullable=False),
            sa.Column("is_default", sa.Boolean(), nullable=False, server_default="false"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("ix_user_bank_accounts_user_id", "user_bank_accounts", ["user_id"])
        op.create_index("ix_user_bank_accounts_default", "user_bank_accounts", ["user_id", "is_default"])


def downgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()

    if "user_bank_accounts" in tables:
        op.drop_index("ix_user_bank_accounts_default", table_name="user_bank_accounts")
        op.drop_index("ix_user_bank_accounts_user_id", table_name="user_bank_accounts")
        op.drop_table("user_bank_accounts")
