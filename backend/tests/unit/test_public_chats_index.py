"""Unit tests for public chats directory privacy and sanitization (SEC-01 / TASK-02)."""

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4
import pytest
from fastapi import HTTPException

from app.api.chats import list_public_chats_index
from app.models.telegram_chat import TelegramChat
from app.models.user import User


@pytest.mark.asyncio
async def test_public_chats_index_sanitizes_links_and_omits_account_id():
    """Verify SEC-01: Public index strictly exposes public username links and clears account_id."""
    db = AsyncMock()
    user = User(id=uuid4(), role="pro", email="pro@example.com")

    # Mock count query
    db.scalar.return_value = 1

    # Mock chat row
    mock_row = MagicMock()
    mock_row.chat_id = -1001234567890
    mock_row.title = "Crypto Community ID"
    mock_row.username = "cryptoid"
    mock_row.type = "supergroup"
    mock_row.member_count = 1500
    mock_row.online_count = 120
    mock_row.last_message_date = datetime.now(timezone.utc)
    mock_row.color_id = 1
    mock_row.photo_version = 2

    mock_exec_res = MagicMock()
    mock_exec_res.all.return_value = [mock_row]
    db.execute.return_value = mock_exec_res

    res = await list_public_chats_index(
        page=1,
        page_size=50,
        search=None,
        chat_type=None,
        sort_by="member_count",
        db=db,
        user=user,
    )

    assert res.total == 1
    assert len(res.chats) == 1
    chat = res.chats[0]
    assert chat.chat_id == -1001234567890
    assert chat.username == "cryptoid"
    # Strict public link format based on username
    assert chat.invite_link == "https://t.me/cryptoid"
    # Internal tenant account_id must be completely null to prevent cross-tenant enumeration
    assert chat.account_id is None


@pytest.mark.asyncio
async def test_public_chats_index_query_excludes_invite_link_clause():
    """Verify SEC-01 / CONS-05: Query criteria requires username and does not include invite_link fallback."""
    db = AsyncMock()
    user = User(id=uuid4(), role="premium", email="prem@example.com")

    db.scalar.return_value = 0
    mock_exec_res = MagicMock()
    mock_exec_res.all.return_value = []
    db.execute.return_value = mock_exec_res

    await list_public_chats_index(
        page=1,
        page_size=50,
        search=None,
        chat_type="group,supergroup",
        sort_by="member_count",
        db=db,
        user=user,
    )

    # Inspect the SQL statement compiled for db.execute
    stmt_called = db.execute.call_args[0][0]
    sql_string = str(stmt_called)

    # Must filter by username is not null
    assert "telegram_chats.username IS NOT NULL" in sql_string
    # Must NOT include invite_link as an alternative in where criteria
    assert "telegram_chats.invite_link IS NOT NULL" not in sql_string
