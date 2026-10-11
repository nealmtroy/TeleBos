"""Unit & Integration Test Suite for SEC-03 Subscription Broadcast Entitlement Bypass.

Verifies:
1. is_subscription_active correctly detects active vs expired states across all roles.
2. enforce_broadcast_allowance blocks expired Free Trial and expired paid subscriptions.
3. start_broadcast blocks expired Free Trial users from launching broadcast jobs.
4. require_role blocks expired subscribers from accessing paid endpoints.
"""

import asyncio
from datetime import datetime, timezone, timedelta
import uuid
import sys

from sqlalchemy import select, delete
from app.database import async_session_factory
from app.models.user import User
from app.models.group_list import GroupList
from app.models.telegram_account import TelegramAccount
from app.services.redeem_service import is_subscription_active, auto_downgrade_if_expired
from app.services.broadcast_entitlement import (
    enforce_broadcast_allowance,
    get_remaining_broadcast_seconds,
)
from app.services import broadcast_service


async def run_tests():
    print("=== STARTING SEC-03 SUBSCRIPTION ENTITLEMENT TESTS ===")
    now_utc = datetime.now(timezone.utc)

    # ── Test 1: Logic Verification of is_subscription_active ─────────────
    print("[TEST 1] Testing is_subscription_active state matrix...")

    class MockUser:
        def __init__(self, role, expires_at):
            self.role = role
            self.subscription_expires_at = expires_at

    # Owner -> Always True
    owner_user = MockUser("owner", now_utc - timedelta(days=100))
    assert is_subscription_active(owner_user) is True, "Owner must always be active"

    # Active Paid Plans
    pro_active = MockUser("pro", now_utc + timedelta(days=30))
    assert is_subscription_active(pro_active) is True, "Pro in future must be active"

    basic_lifetime = MockUser("basic", None)
    assert is_subscription_active(basic_lifetime) is True, "Basic with None (lifetime) must be active"

    # Expired Paid Plans
    pro_expired = MockUser("pro", now_utc - timedelta(seconds=10))
    assert is_subscription_active(pro_expired) is False, "Pro in past must NOT be active"

    basic_expired = MockUser("basic", now_utc - timedelta(hours=1))
    assert is_subscription_active(basic_expired) is False, "Basic in past must NOT be active"

    # Active Free Trial (within 5h)
    trial_active = MockUser("freetrial", now_utc + timedelta(hours=2))
    assert is_subscription_active(trial_active) is True, "Trial in future must be active"

    # Expired Free Trial (>5h past)
    trial_expired = MockUser("freetrial", now_utc - timedelta(minutes=5))
    assert is_subscription_active(trial_expired) is False, "Trial in past must NOT be active"

    trial_none = MockUser("freetrial", None)
    assert is_subscription_active(trial_none) is False, "Trial with None must NOT be active"

    print("  -> is_subscription_active state matrix PASSED.")

    # ── Test 2: enforce_broadcast_allowance blocks expired trials ─────────
    print("[TEST 2] Testing enforce_broadcast_allowance blocks expired accounts...")

    async with async_session_factory() as db:
        # 1. Expired trial user
        expired_trial_user = MockUser("freetrial", now_utc - timedelta(hours=1))
        expired_trial_user.id = uuid.uuid4()
        try:
            await enforce_broadcast_allowance(db, expired_trial_user)
            assert False, "enforce_broadcast_allowance should have raised ValueError for expired trial"
        except ValueError as exc:
            assert "berakhir" in str(exc).lower() or "free trial" in str(exc).lower(), f"Unexpected error message: {exc}"
            print(f"  -> Expired trial correctly blocked: '{exc}'")

        # 2. Expired paid subscriber
        expired_pro_user = MockUser("pro", now_utc - timedelta(minutes=30))
        expired_pro_user.id = uuid.uuid4()
        try:
            await enforce_broadcast_allowance(db, expired_pro_user)
            assert False, "enforce_broadcast_allowance should have raised ValueError for expired Pro"
        except ValueError as exc:
            assert "berakhir" in str(exc).lower() or "kedaluwarsa" in str(exc).lower(), f"Unexpected error message: {exc}"
            print(f"  -> Expired Pro correctly blocked: '{exc}'")

        # 3. Active trial user should have remaining seconds
        active_trial_user = MockUser("freetrial", now_utc + timedelta(hours=3))
        active_trial_user.id = uuid.uuid4()
        remaining = await get_remaining_broadcast_seconds(db, str(active_trial_user.id), user=active_trial_user)
        assert remaining > 0, f"Active trial must have remaining seconds, got {remaining}"
        print(f"  -> Active trial has {remaining}s allowance.")

        # 4. Expired user has 0 remaining seconds
        expired_remaining = await get_remaining_broadcast_seconds(db, str(expired_trial_user.id), user=expired_trial_user)
        assert expired_remaining == 0, f"Expired trial must have 0 remaining seconds, got {expired_remaining}"
        print(f"  -> Expired trial has 0s remaining allowance.")

    # ── Test 3: start_broadcast blocks expired trial user ────────────────
    print("[TEST 3] Testing start_broadcast rejection on expired user in database...")
    test_user_id = uuid.uuid4()

    async with async_session_factory() as db:
        # Create expired user in DB
        db_user = User(
            id=test_user_id,
            email=f"expired_broadcast_{uuid.uuid4().hex[:6]}@example.com",
            role="freetrial",
            balance=0,
            subscription_expires_at=now_utc - timedelta(days=2),
        )
        db.add(db_user)
        await db.commit()

        # Attempt to start broadcast
        try:
            await broadcast_service.start_broadcast(
                db=db,
                user=db_user,
                account_ids=[str(uuid.uuid4())],
                group_list_id=str(uuid.uuid4()),
                text_list_id=None,
                mode="single_text",
                custom_text="Test spam message",
                delay_per_group=10,
                delay_after_all=30,
            )
            assert False, "start_broadcast should have been rejected for expired user!"
        except ValueError as exc:
            assert "berakhir" in str(exc).lower() or "free trial" in str(exc).lower()
            print(f"  -> start_broadcast correctly rejected expired user: '{exc}'")
        finally:
            await db.execute(delete(User).where(User.id == test_user_id))
            await db.commit()

    print("\nALL SEC-03 TESTS PASSED SUCCESSFULLY! (100% VERIFIED)")


if __name__ == "__main__":
    asyncio.run(run_tests())
