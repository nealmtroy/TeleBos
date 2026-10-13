"""Unit test suite for TASK-08 / SEC-02:
Verification that auth dependency injection (get_current_user) never performs premature
DML transaction commits (await db.commit()), preserving transaction isolation and HTTP idempotency.
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4
import pytest
from fastapi import HTTPException

from app import dependencies as deps_mod
from app.models.user import User


class FakeRequest:
    def __init__(self, token: str = "valid-session-token"):
        self.headers = {"x-better-auth-token": token}
        self.cookies: dict[str, str] = {}


@pytest.mark.asyncio
async def test_expired_ban_user_is_restored_via_flush_without_commit():
    """When a temporarily suspended user's ban expires, get_current_user must restore

    the account via flush(), but MUST NOT call await db.commit() prematurely.
    """
    user_id = uuid4()
    expired_ban = datetime.now(timezone.utc) - timedelta(hours=2)

    user = User(
        id=user_id,
        email="rehabilitated@telebos.com",
        is_active=False,
        role="basic",
        ban_reason="Temporary rate limit penalty",
        ban_expires=expired_ban,
    )

    # Mock Better Auth session row
    session_row = MagicMock()
    session_row.user_id = str(user_id)
    session_row.expires_at = datetime.now(timezone.utc) + timedelta(days=1)

    session_result = MagicMock()
    session_result.one_or_none.return_value = session_row

    user_result = MagicMock()
    user_result.scalar_one_or_none.return_value = user

    executed_queries: list[str] = []

    async def fake_execute(stmt, params=None, *args, **kwargs):
        stmt_str = str(stmt)
        executed_queries.append(stmt_str)
        if "FROM session" in stmt_str:
            return session_result
        if "FROM users" in stmt_str or "FROM \"user\"" in stmt_str:
            return user_result
        mock_res = MagicMock()
        mock_res.scalar_one_or_none.return_value = user
        return mock_res

    db = MagicMock()
    db.execute = AsyncMock(side_effect=fake_execute)
    db.commit = AsyncMock()
    db.flush = AsyncMock()

    request = FakeRequest()
    authenticated_user = await deps_mod.get_current_user(request=request, db=db)

    # 1. User state in-memory is restored to active
    assert authenticated_user.id == user_id
    assert authenticated_user.is_active is True
    assert authenticated_user.ban_reason is None
    assert authenticated_user.ban_expires is None

    # 2. Database flush was called
    db.flush.assert_awaited()

    # 3. CRITICAL INVARIANT (SEC-02): db.commit was NEVER called during dependency evaluation!
    db.commit.assert_not_awaited()

    # 4. Verify SQL queries executed for restoring both tables
    all_sql = " ".join(executed_queries)
    assert 'UPDATE "user" SET banned = false' in all_sql
    assert 'UPDATE users SET is_active = true' in all_sql


@pytest.mark.asyncio
async def test_active_ban_user_raises_403_without_commit():
    """An actively banned user must receive 403 Forbidden without any commit."""
    user_id = uuid4()
    future_ban = datetime.now(timezone.utc) + timedelta(days=3)

    user = User(
        id=user_id,
        email="badactor@telebos.com",
        is_active=False,
        role="basic",
        ban_reason="Violation of terms",
        ban_expires=future_ban,
    )

    session_row = MagicMock()
    session_row.user_id = str(user_id)
    session_row.expires_at = datetime.now(timezone.utc) + timedelta(days=1)

    session_result = MagicMock()
    session_result.one_or_none.return_value = session_row

    user_result = MagicMock()
    user_result.scalar_one_or_none.return_value = user

    async def fake_execute(stmt, *args, **kwargs):
        stmt_str = str(stmt)
        if "FROM session" in stmt_str:
            return session_result
        return user_result

    db = MagicMock()
    db.execute = AsyncMock(side_effect=fake_execute)
    db.commit = AsyncMock()
    db.flush = AsyncMock()

    request = FakeRequest()
    with pytest.raises(HTTPException) as exc_info:
        await deps_mod.get_current_user(request=request, db=db)

    assert exc_info.value.status_code == 403
    assert "Akun Anda disuspend: Violation of terms" in exc_info.value.detail
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_normal_active_user_authenticates_without_commit():
    """Standard active user passes authentication without committing."""
    user_id = uuid4()

    user = User(
        id=user_id,
        email="regular@telebos.com",
        is_active=True,
        role="pro",
        ban_reason=None,
        ban_expires=None,
    )

    session_row = MagicMock()
    session_row.user_id = str(user_id)
    session_row.expires_at = datetime.now(timezone.utc) + timedelta(days=1)

    session_result = MagicMock()
    session_result.one_or_none.return_value = session_row

    user_result = MagicMock()
    user_result.scalar_one_or_none.return_value = user

    async def fake_execute(stmt, *args, **kwargs):
        stmt_str = str(stmt)
        if "FROM session" in stmt_str:
            return session_result
        return user_result

    db = MagicMock()
    db.execute = AsyncMock(side_effect=fake_execute)
    db.commit = AsyncMock()
    db.flush = AsyncMock()

    request = FakeRequest()
    authenticated_user = await deps_mod.get_current_user(request=request, db=db)

    assert authenticated_user.id == user_id
    assert authenticated_user.is_active is True
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_get_optional_user_restores_expired_ban_without_commit():
    """get_optional_user restores expired ban via flush without premature commit."""
    user_id = uuid4()
    expired_ban = datetime.now(timezone.utc) - timedelta(minutes=30)

    user = User(
        id=user_id,
        email="optional@telebos.com",
        is_active=False,
        role="basic",
        ban_reason="Temporary penalty",
        ban_expires=expired_ban,
    )

    session_row = MagicMock()
    session_row.user_id = str(user_id)
    session_row.expires_at = datetime.now(timezone.utc) + timedelta(days=1)

    session_result = MagicMock()
    session_result.one_or_none.return_value = session_row

    user_result = MagicMock()
    user_result.scalar_one_or_none.return_value = user

    async def fake_execute(stmt, *args, **kwargs):
        stmt_str = str(stmt)
        if "FROM session" in stmt_str:
            return session_result
        return user_result

    db = MagicMock()
    db.execute = AsyncMock(side_effect=fake_execute)
    db.commit = AsyncMock()
    db.flush = AsyncMock()

    request = FakeRequest()
    result_user = await deps_mod.get_optional_user(request=request, db=db)

    assert result_user is not None
    assert result_user.is_active is True
    db.flush.assert_awaited()
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_transaction_atomicity_preserved_on_downstream_route_error():
    """Simulates a route that authenticates via get_current_user and subsequently fails.

    Because get_current_user used flush() and never commit(), calling db.rollback()
    cleans up the entire transaction without leaving fractured state.
    """
    user_id = uuid4()
    expired_ban = datetime.now(timezone.utc) - timedelta(hours=1)

    user = User(
        id=user_id,
        email="atomic@telebos.com",
        is_active=False,
        role="basic",
        ban_reason="Penalty",
        ban_expires=expired_ban,
    )

    session_row = MagicMock()
    session_row.user_id = str(user_id)
    session_row.expires_at = datetime.now(timezone.utc) + timedelta(days=1)

    session_result = MagicMock()
    session_result.one_or_none.return_value = session_row

    user_result = MagicMock()
    user_result.scalar_one_or_none.return_value = user

    db = MagicMock()
    db.execute = AsyncMock(side_effect=lambda stmt, *args, **kwargs: (
        session_result if "FROM session" in str(stmt) else user_result
    ))
    db.commit = AsyncMock()
    db.flush = AsyncMock()
    db.rollback = AsyncMock()

    # Step 1: Authentication dependency runs
    request = FakeRequest()
    current_user = await deps_mod.get_current_user(request=request, db=db)
    assert current_user.is_active is True
    assert db.commit.call_count == 0

    # Step 2: Route handler starts and fails with an error
    try:
        raise RuntimeError("Downstream business logic error in route handler")
    except RuntimeError:
        await db.rollback()

    # Step 3: Transaction was rolled back cleanly, zero commits occurred
    db.commit.assert_not_awaited()
    db.rollback.assert_awaited_once()
