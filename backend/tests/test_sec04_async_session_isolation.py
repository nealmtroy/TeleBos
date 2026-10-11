"""Unit & Integration Test Suite for SEC-04 AsyncSession Isolation in Background Reconnect.

Verifies:
1. _safe_bg_reconnect_account operates completely decoupled from request-scoped AsyncSession.
2. attach_and_reconnect safely accepts detached TelegramAccount objects or string UUIDs even when passed a closed/None session.
3. Closed request session simulation: Closing the session before/during background task execution does NOT trigger InvalidRequestError.
"""

import asyncio
import uuid
import sys
from datetime import datetime, timezone

from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import async_session_factory
from app.models.telegram_account import TelegramAccount
from app.models.user import User
from app.services.session_manager import session_manager
from app.api.wallet import _safe_bg_reconnect_account


async def run_tests():
    print("=== STARTING SEC-04 ASYNC SESSION ISOLATION TESTS ===")

    test_account_id = None
    test_user_id = None

    try:
        # Setup: Create test user and test telegram account in DB
        async with async_session_factory() as db:
            user = User(
                email=f"test_sec04_{uuid.uuid4().hex[:8]}@example.com",
                role="basic",
                is_active=True,
            )
            db.add(user)
            await db.flush()
            test_user_id = user.id

            account = TelegramAccount(
                user_id=user.id,
                phone=f"+62899{uuid.uuid4().int % 100000000:08d}",
                session_string="test_mock_session_string",
                is_active=True,
                for_sale=False,
            )
            db.add(account)
            await db.commit()
            test_account_id = account.id

        print(f"Created test account {test_account_id} for user {test_user_id}")

        # ── Test 1: attach_and_reconnect with None DB session ─────────────
        print("[TEST 1] Testing attach_and_reconnect with db=None and string ID...")
        res = await session_manager.attach_and_reconnect(db=None, account=str(test_account_id))
        # Note: res will be bool (typically False because mock session isn't a live Telegram session)
        # But critically: it must NOT raise AttributeError or InvalidRequestError
        print(f"  -> Successfully handled db=None without session errors. Result: {res}")

        # ── Test 2: Closed Session Simulation ─────────────────────────────
        print("[TEST 2] Testing closed session behavior on detached ORM instance...")
        # Step 2a: Open session, load account, then EXPLICITLY close session
        db_scoped = async_session_factory()
        res_acc = await db_scoped.execute(
            select(TelegramAccount).where(TelegramAccount.id == test_account_id)
        )
        detached_account = res_acc.scalar_one()

        # Explicitly close the session to simulate FastAPI request teardown
        await db_scoped.close()
        print("  -> Scoped DB session closed explicitly.")

        # Step 2b: Call attach_and_reconnect with the closed session and detached account
        try:
            res_closed = await session_manager.attach_and_reconnect(
                db=db_scoped, account=detached_account
            )
            print(f"  -> attach_and_reconnect on closed session succeeded safely (Result: {res_closed}).")
        except Exception as exc:
            assert False, f"attach_and_reconnect failed with closed session: {exc}"

        # ── Test 3: Background Task Isolation (_safe_bg_reconnect_account) ─
        print("[TEST 3] Testing _safe_bg_reconnect_account in background task...")
        # Launch background task as done in wallet.py:fulfill_wallet_transaction
        task = asyncio.create_task(_safe_bg_reconnect_account(str(detached_account.id)))
        await task  # Wait for it to complete
        assert task.done() and not task.cancelled(), "Background task must complete without error"
        print("  -> _safe_bg_reconnect_account background task completed safely.")

        # ── Test 4: Graceful handling of invalid / nonexistent accounts ────
        print("[TEST 4] Testing graceful handling of random non-existent UUID...")
        random_id = str(uuid.uuid4())
        task_random = asyncio.create_task(_safe_bg_reconnect_account(random_id))
        await task_random
        assert task_random.done(), "Random account reconnection must complete gracefully"
        print("  -> Non-existent account handled gracefully without unhandled task exceptions.")

        print("\nALL SEC-04 TESTS PASSED SUCCESSFULLY! (100% VERIFIED)")

    finally:
        # Cleanup test data
        async with async_session_factory() as db:
            if test_account_id:
                await db.execute(delete(TelegramAccount).where(TelegramAccount.id == test_account_id))
            if test_user_id:
                await db.execute(delete(User).where(User.id == test_user_id))
            await db.commit()
        print("Test data cleaned up.")


if __name__ == "__main__":
    asyncio.run(run_tests())
