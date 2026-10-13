"""Unit tests for Free Trial 5-hour lifecycle, entitlement checks, and auto-downgrade.

Verifies the canonical 5-hour anti-abuse trial duration, expiry checks, and role transitions.
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock
import uuid
import pytest

from app.models.user import User
from app.services.redeem_service import (
    auto_downgrade_if_expired,
    is_subscription_active,
)


def _make_user(role: str, expires_at: datetime | None, created_at: datetime | None = None) -> User:
    u = MagicMock(spec=User)
    u.id = uuid.uuid4()
    u.role = role
    u.subscription_expires_at = expires_at
    u.created_at = created_at
    return u


def test_freetrial_active_within_5_hours():
    """Verify that a freetrial user within their 5-hour window has active subscription."""
    now = datetime.now(timezone.utc)
    user = _make_user(role="freetrial", expires_at=now + timedelta(hours=3))
    assert is_subscription_active(user) is True


def test_freetrial_expired_after_5_hours():
    """Verify that a freetrial user past their 5-hour window has inactive subscription."""
    now = datetime.now(timezone.utc)
    user = _make_user(role="freetrial", expires_at=now - timedelta(minutes=10))
    assert is_subscription_active(user) is False


def test_freetrial_without_expires_at_inactive():
    """Verify that a freetrial user without an expiration timestamp is inactive."""
    user = _make_user(role="freetrial", expires_at=None)
    assert is_subscription_active(user) is False


@pytest.mark.asyncio
async def test_auto_downgrade_expired_paid_user_to_freetrial():
    """Verify that an expired paid subscriber is automatically downgraded to 'freetrial'."""
    now = datetime.now(timezone.utc)
    mock_db = AsyncMock()
    user = _make_user(role="pro", expires_at=now - timedelta(days=1))

    updated_user = await auto_downgrade_if_expired(mock_db, user)

    assert updated_user.role == "freetrial"
    # Verify both 'users' and Better Auth '"user"' table updates were executed
    assert mock_db.execute.await_count == 2
    mock_db.flush.assert_awaited_once()


@pytest.mark.asyncio
async def test_auto_downgrade_active_paid_user_not_touched():
    """Verify that an active paid subscriber retains their role without db updates."""
    now = datetime.now(timezone.utc)
    mock_db = AsyncMock()
    user = _make_user(role="premium", expires_at=now + timedelta(days=20))

    updated_user = await auto_downgrade_if_expired(mock_db, user)

    assert updated_user.role == "premium"
    mock_db.execute.assert_not_called()


@pytest.mark.asyncio
async def test_freetrial_missing_expires_at_gets_5_hour_window():
    """Verify that a freetrial user lacking an expiry timestamp is backfilled with a 5-hour window."""
    now = datetime.now(timezone.utc)
    mock_db = AsyncMock()
    user = _make_user(role="freetrial", expires_at=None, created_at=now)

    updated_user = await auto_downgrade_if_expired(mock_db, user)

    assert updated_user.subscription_expires_at is not None
    expected_expiry = now + timedelta(hours=5)
    delta = abs((updated_user.subscription_expires_at - expected_expiry).total_seconds())
    assert delta < 5.0
    mock_db.execute.assert_awaited_once()
    mock_db.flush.assert_awaited_once()
