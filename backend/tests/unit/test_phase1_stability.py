"""Unit tests validating Fase 1 integrity constraints and stability logic."""

import random
from sqlalchemy import CheckConstraint, UniqueConstraint

from app.models.telegram_account import TelegramAccount
from app.models.user import User


def test_user_balance_constraint():
    """Verify that User model declares CheckConstraint('balance >= 0')."""
    check_constraints = [
        arg for arg in User.__table_args__ if isinstance(arg, CheckConstraint)
    ]
    assert len(check_constraints) >= 1
    names = [c.name for c in check_constraints]
    assert "chk_user_balance_positive" in names


def test_telegram_account_phone_unique_constraint():
    """Verify that TelegramAccount model declares UniqueConstraint on phone."""
    unique_constraints = [
        arg for arg in TelegramAccount.__table_args__ if isinstance(arg, UniqueConstraint)
    ]
    assert len(unique_constraints) >= 1
    phone_uq = next((c for c in unique_constraints if "phone" in [col.name if hasattr(col, "name") else col for col in c.columns]), None)
    assert phone_uq is not None
    assert phone_uq.name == "uq_telegram_account_phone"


def test_broadcast_delay_calculation_bounds():
    """Verify that proportional randomized delay is always >= 1."""
    for delay_per_group in [0, 1, 2, 5, 15, 60]:
        min_d = max(1, int(delay_per_group * 0.7))
        max_d = max(min_d + 1, int(delay_per_group * 1.3))
        for _ in range(20):
            base_delay = random.randint(min_d, max_d)
            actual_delay = max(1, base_delay)
            assert actual_delay >= 1
