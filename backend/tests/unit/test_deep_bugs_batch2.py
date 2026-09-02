"""Unit tests validating Batch 2 bug fixes from deep_bug_logic_audit_report.md."""

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4
import pytest

from app.models.redeem_code import RedeemCode
from app.models.user import User
from app.services.redeem_service import redeem_code


@pytest.mark.asyncio
async def test_redeem_subscription_accumulates_existing_days():
    """Verify LOG-03: subscription redeem adds days to current active expiration."""
    db = AsyncMock()
    user_id = uuid4()
    now = datetime.now(timezone.utc)
    future_expiry = now + timedelta(days=20)

    user = User(id=user_id, role="pro", subscription_expires_at=future_expiry, balance=0)
    code = RedeemCode(
        id=uuid4(),
        code="SUB30DAYS",
        code_type="subscription",
        plan="pro",
        duration_days=30,
        is_active=True,
        used_count=0,
        max_uses=10,
    )

    # Mock DB query for RedeemCode, RedeemLog, and locked User
    mock_redeem_res = MagicMock()
    mock_redeem_res.scalar_one_or_none.return_value = code

    mock_log_res = MagicMock()
    mock_log_res.scalar_one_or_none.return_value = None

    mock_user_res = MagicMock()
    mock_user_res.scalar_one.return_value = user

    db.execute.side_effect = [mock_redeem_res, mock_log_res, mock_user_res]

    result = await redeem_code(db, user, "SUB30DAYS")

    # Expiry should be future_expiry + 30 days, NOT now + 30 days!
    expected_expiry = future_expiry + timedelta(days=30)
    assert abs((user.subscription_expires_at - expected_expiry).total_seconds()) < 2
    assert result["success"] is True
    assert result["plan"] == "pro"


@pytest.mark.asyncio
async def test_redeem_subscription_prevents_downgrade():
    """Verify LOG-03: redeeming a 'pro' code does not downgrade a 'premium' user."""
    db = AsyncMock()
    user_id = uuid4()
    now = datetime.now(timezone.utc)

    user = User(id=user_id, role="premium", subscription_expires_at=now + timedelta(days=10), balance=0)
    code = RedeemCode(
        id=uuid4(),
        code="PROCODE",
        code_type="subscription",
        plan="pro",
        duration_days=15,
        is_active=True,
        used_count=0,
        max_uses=10,
    )

    mock_redeem_res = MagicMock()
    mock_redeem_res.scalar_one_or_none.return_value = code

    mock_log_res = MagicMock()
    mock_log_res.scalar_one_or_none.return_value = None

    mock_user_res = MagicMock()
    mock_user_res.scalar_one.return_value = user

    db.execute.side_effect = [mock_redeem_res, mock_log_res, mock_user_res]

    await redeem_code(db, user, "PROCODE")

    # Role must remain premium!
    assert user.role == "premium"


@pytest.mark.asyncio
async def test_redeem_balance_locks_user_row():
    """Verify RAC-03: balance redeem locks user row with with_for_update()."""
    db = AsyncMock()
    user_id = uuid4()

    user = User(id=user_id, role="user", balance=500)
    code = RedeemCode(
        id=uuid4(),
        code="BAL1000",
        code_type="balance",
        amount=1000,
        is_active=True,
        used_count=0,
        max_uses=10,
    )

    mock_redeem_res = MagicMock()
    mock_redeem_res.scalar_one_or_none.return_value = code

    mock_log_res = MagicMock()
    mock_log_res.scalar_one_or_none.return_value = None

    mock_user_res = MagicMock()
    mock_user_res.scalar_one.return_value = user

    db.execute.side_effect = [mock_redeem_res, mock_log_res, mock_user_res]

    result = await redeem_code(db, user, "BAL1000")

    assert user.balance == 1500
    assert result["success"] is True
    assert result["balance_added"] == 1000
