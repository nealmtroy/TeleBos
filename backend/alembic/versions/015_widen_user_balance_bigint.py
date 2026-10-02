"""Widen users.balance from INTEGER to BIGINT

`User.balance` was declared as `mapped_column(default=0)` with a plain
`Mapped[int]` annotation, so SQLAlchemy inferred INTEGER. It is a money column:
it accumulates marketplace sales, SMM order charges, redeem top-ups, and admin
adjustments, and it is guarded by a ``balance >= 0`` check constraint rather
than any upper bound. On an active deployment the cumulative credits exceed the
2,147,483,647 ceiling of INTEGER, at which point further top-ups raise
``NumericValueOutOfRange`` and the transaction fails.

Every other money column in the schema (telegram_accounts.sell_price /
buy_price, orders.price / total_price, telegram_accounts.contacts_count and
friends) already uses BigInteger, so this also removes an inconsistency.

Introspects before altering so the migration is a no-op on databases where the
column is already 64-bit.
"""

revision = "015"
down_revision = "014"
branch_labels = None
depends_on = None


def upgrade():
    from alembic import op
    from sqlalchemy import inspect

    conn = op.get_bind()
    inspector = inspect(conn)
    cols = {c["name"]: c for c in inspector.get_columns("users")}

    if "balance" not in cols:
        return

    # Already 64-bit: nothing to do.
    if str(cols["balance"]["type"]).upper() in ("BIGINT", "INT8"):
        return

    op.execute(
        "ALTER TABLE users "
        "ALTER COLUMN balance TYPE BIGINT "
        "USING balance::BIGINT"
    )


def downgrade():
    # No-op: narrowing back to INTEGER would overflow any balance that has
    # already grown past the 32-bit ceiling, which is the very reason for
    # this migration.
    pass
