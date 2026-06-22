"""Add sell_price and sale_listed_at columns to telegram_accounts

Per-account marketplace pricing: each account listed for sale now carries
its own sell_price (BigInteger, nullable) instead of relying on a single
global price. The sale_listed_at timestamp tracks when it was listed.

The old global SmmSetting prices remain as fallback defaults.
"""

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade():
    from alembic import op
    from sqlalchemy import inspect

    conn = op.get_bind()
    inspector = inspect(conn)
    cols = {c["name"]: c for c in inspector.get_columns("telegram_accounts")}

    if "sell_price" not in cols:
        op.execute(
            "ALTER TABLE telegram_accounts "
            "ADD COLUMN sell_price BIGINT"
        )

    if "sale_listed_at" not in cols:
        op.execute(
            "ALTER TABLE telegram_accounts "
            "ADD COLUMN sale_listed_at TIMESTAMP WITH TIME ZONE"
        )


def downgrade():
    from alembic import op
    from sqlalchemy import inspect

    conn = op.get_bind()
    inspector = inspect(conn)
    cols = {c["name"]: c for c in inspector.get_columns("telegram_accounts")}

    if "sell_price" in cols:
        op.execute("ALTER TABLE telegram_accounts DROP COLUMN sell_price")

    if "sale_listed_at" in cols:
        op.execute("ALTER TABLE telegram_accounts DROP COLUMN sale_listed_at")
