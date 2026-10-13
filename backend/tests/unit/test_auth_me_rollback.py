"""Unit tests for TASK-12 / REL-02:
Verification that /api/v1/auth/me executes await db.rollback() when analytics tracking
fails, preventing PendingRollbackError and aborted transaction errors in the get_db()
session lifecycle.
"""

from unittest.mock import AsyncMock, patch
import uuid
import pytest
from sqlalchemy.exc import DBAPIError, PendingRollbackError

from app.api.auth import me
from app.models.user import User


def _make_test_user() -> User:
    return User(
        id=uuid.uuid4(),
        email="developer@telebos.id",
        role="member",
        is_active=True,
    )


@pytest.mark.asyncio
async def test_me_success_commits_analytics():
    """When analytics tracking succeeds, /me commits the session and returns user."""
    user = _make_test_user()
    db = AsyncMock()

    with patch(
        "app.services.analytics_tracking_service.track_user_login",
        new=AsyncMock(return_value=None),
    ) as mock_track:
        result = await me(current_user=user, db=db)

        mock_track.assert_awaited_once_with(db, user_id=user.id)
        assert db.commit.await_count == 1
        assert db.rollback.await_count == 0
        assert result.id == user.id
        assert result.email == user.email


@pytest.mark.asyncio
async def test_me_analytics_failure_triggers_rollback():
    """When track_user_login raises an exception, /me executes await db.rollback() and returns user."""
    user = _make_test_user()
    db = AsyncMock()

    with patch(
        "app.services.analytics_tracking_service.track_user_login",
        new=AsyncMock(side_effect=RuntimeError("Simulated analytics database error")),
    ) as mock_track:
        result = await me(current_user=user, db=db)

        mock_track.assert_awaited_once_with(db, user_id=user.id)
        # Verify rollback was called to clear the aborted transaction state
        assert db.rollback.await_count == 1
        # Result should still successfully return current_user without crashing
        assert result.id == user.id
        assert result.email == user.email


@pytest.mark.asyncio
async def test_me_dbapi_error_triggers_rollback_and_prevents_crash():
    """When a low-level DBAPI error occurs during commit, /me catches it, rolls back, and returns 200."""
    user = _make_test_user()
    db = AsyncMock()
    # Simulate DBAPIError on commit
    db.commit.side_effect = DBAPIError("DB connection dropped", None, None)

    with patch(
        "app.services.analytics_tracking_service.track_user_login",
        new=AsyncMock(return_value=None),
    ):
        result = await me(current_user=user, db=db)

        assert db.rollback.await_count == 1
        assert result.id == user.id
        assert result.email == user.email


@pytest.mark.asyncio
async def test_session_state_clean_after_me_failure():
    """Verify that calling rollback on a session where an error occurred prevents PendingRollbackError."""
    # Test session double simulation
    session_dirty = True

    class MockSession:
        def __init__(self):
            self.rolled_back = False
            self.committed = False

        async def rollback(self):
            nonlocal session_dirty
            session_dirty = False
            self.rolled_back = True

        async def commit(self):
            nonlocal session_dirty
            if session_dirty:
                raise PendingRollbackError("Session is in rollback_only state! Issue rollback() first.")
            self.committed = True

    user = _make_test_user()
    mock_session = MockSession()

    with patch(
        "app.services.analytics_tracking_service.track_user_login",
        new=AsyncMock(side_effect=Exception("Database lock conflict")),
    ):
        result = await me(current_user=user, db=mock_session)

        # /me must have called rollback
        assert mock_session.rolled_back is True
        assert result.id == user.id

        # Now simulate get_db() lifecycle executing commit() after request completes
        # If /me did not call rollback, this would raise PendingRollbackError
        await mock_session.commit()
        assert mock_session.committed is True
