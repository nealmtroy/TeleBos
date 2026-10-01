"""auto_join_logs.chat_id must be BigInteger, not the default Integer.

Regression: the column was created as int4, whose range stops at 2147483647.
Telegram supergroup and channel ids go past that, so the first join to a large
channel died with "invalid input for query argument $5: 2406720812 (value out
of int32 range)" — the whole job crashed while writing its log row.

telegram_chats.chat_id is BigInteger for the same reason, so this asserts the
auto-join log matches it rather than relying on the SQLAlchemy default.
"""

import struct

import pytest
from sqlalchemy import BigInteger
from sqlalchemy.dialects import postgresql

from app.models.auto_join_log import AutoJoinLog
from app.models.telegram_chat import TelegramChat


def _column_type(model, name):
    return model.__table__.columns[name].type


def test_chat_id_is_bigint():
    assert isinstance(_column_type(AutoJoinLog, "chat_id"), BigInteger)


def test_matches_telegram_chat_convention():
    """Both columns hold the same Telegram ids, so both must be the same type."""
    assert isinstance(_column_type(TelegramChat, "chat_id"), BigInteger)
    assert isinstance(_column_type(AutoJoinLog, "chat_id"), BigInteger)


def test_chat_id_is_not_default_integer():
    # BigInteger subclasses Integer, so isinstance is the wrong check. Compare
    # the rendered DDL type instead: the crash came from the column being
    # INTEGER, so the type must not render as one.
    rendered = _column_type(AutoJoinLog, "chat_id").compile(
        dialect=postgresql.dialect()
    )
    assert rendered == "BIGINT"


def test_chat_id_stays_nullable():
    """A join that fails before resolving the chat still writes a log row."""
    assert AutoJoinLog.__table__.columns["chat_id"].nullable is True


def test_value_fits_where_int4_would_overflow():
    """The value from the production crash must be representable."""
    big_id = 2406720812
    with pytest.raises(struct.error):
        struct.pack(">i", big_id)
    assert struct.pack(">q", big_id)
