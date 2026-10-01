"""widen auto_join_logs.chat_id to bigint

Revision ID: 014
Revises: 013
Create Date: 2026-10-02 00:00:00

auto_join_logs.chat_id was created as INTEGER, whose int4 range tops out at
2147483647. Telegram channel and supergroup ids exceed that, so the first join
to a large channel crashed the job with "value out of int32 range" when writing
its log row.

telegram_chats.chat_id has always been BigInteger for this reason; this brings
the auto-join log in line. Only the column type changes — no rows are
rewritten and the values already stored still fit.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "014"
down_revision = "013"
branch_labels = None
depends_on = None


def _chat_id_is_int4(conn) -> bool:
    cols = {
        c["name"]: c
        for c in inspect(conn).get_columns("auto_join_logs")
    }
    col = cols.get("chat_id")
    if col is None:
        return False
    # BIGINT reports as (64,) and INTEGER as (32,) through get_columns.
    return col["type"].compile(dialect=conn.dialect) in ("INTEGER", "INT", "INT4")


def upgrade() -> None:
    conn = op.get_bind()
    if "auto_join_logs" not in inspect(conn).get_table_names():
        return
    if _chat_id_is_int4(conn):
        op.alter_column(
            "auto_join_logs",
            "chat_id",
            existing_type=sa.Integer(),
            type_=sa.BigInteger(),
            existing_nullable=True,
        )


def downgrade() -> None:
    # Narrowing back to int4 would fail for any row holding a large channel id,
    # so this only runs on an empty table.
    conn = op.get_bind()
    if "auto_join_logs" not in inspect(conn).get_table_names():
        return
    if not _chat_id_is_int4(conn):
        op.alter_column(
            "auto_join_logs",
            "chat_id",
            existing_type=sa.BigInteger(),
            type_=sa.Integer(),
            existing_nullable=True,
        )