"""Integration tests for Telegram Bot Authenticator-Style Token Linking System."""

import asyncio
import json
import uuid
from sqlalchemy import select

from app.database import async_session_factory
from app.models.user import User
from app.services import telegram_bot_service
from app.utils.redis import redis_client


async def run_tests():
    print("\n=== STARTING TELEGRAM BOT TOKEN LINKING INTEGRATION TESTS ===")

    test_user_id = None
    other_user_id = None
    test_email = f"tg_test_{uuid.uuid4().hex[:8]}@example.com"
    other_email = f"tg_other_{uuid.uuid4().hex[:8]}@example.com"
    dummy_chat_id = 987654321

    try:
        # [SETUP] Create test users
        async with async_session_factory() as db:
            user = User(
                email=test_email,
                role="pro",
                is_active=True,
            )
            other_user = User(
                email=other_email,
                role="basic",
                is_active=True,
                telegram_chat_id=dummy_chat_id,  # Already linked to dummy_chat_id
            )
            db.add_all([user, other_user])
            await db.commit()
            await db.refresh(user)
            await db.refresh(other_user)
            test_user_id = user.id
            other_user_id = other_user.id

        print(f"[SETUP] Created users: User={test_user_id}, OtherUser={other_user_id}")

        # ── TEST 1: Generate Linking Token ────────────────────────────────────
        print("\n[TEST 1] Testing token generation and Redis storage...")
        async with async_session_factory() as db:
            res_u = await db.execute(select(User).where(User.id == test_user_id))
            u = res_u.scalar_one()

            token_data = await telegram_bot_service.generate_linking_token(db, u)
            token = token_data["token"]
            assert token.startswith("TB-")
            assert len(token) == 9  # "TB-" (3) + 6 chars
            assert token_data["expires_in"] == 600

            # Verify in Redis
            raw_stored = await redis_client.get(f"tg_link_token:{token}")
            assert raw_stored is not None
            stored_data = json.loads(raw_stored)
            assert stored_data["user_id"] == str(test_user_id)
            assert stored_data["email"] == test_email

            ttl = await redis_client.ttl(f"tg_link_token:{token}")
            assert 550 <= ttl <= 600
            print(f"  ✓ Token generated: {token}, verified in Redis with TTL={ttl}s")

        # ── TEST 2: Active Token Replacement Invalidation ─────────────────────
        print("\n[TEST 2] Testing token replacement invalidates old token...")
        async with async_session_factory() as db:
            res_u = await db.execute(select(User).where(User.id == test_user_id))
            u = res_u.scalar_one()

            token_data_2 = await telegram_bot_service.generate_linking_token(db, u)
            new_token = token_data_2["token"]
            assert new_token != token

            # Verify old token was burned
            old_stored = await redis_client.get(f"tg_link_token:{token}")
            assert old_stored is None, "Old token must be deleted when a new token is generated"

            # Verify new token is stored
            new_stored = await redis_client.get(f"tg_link_token:{new_token}")
            assert new_stored is not None
            print(f"  ✓ Old token {token} successfully invalidated, new token {new_token} active.")

        # ── TEST 3: Verification with Invalid Token & Brute-Force Lockout ────
        print("\n[TEST 3] Testing invalid token rejection and brute-force lockout...")
        fake_chat_id = 1122334455
        async with async_session_factory() as db:
            # 1. Invalid token attempt
            ok, msg, _ = await telegram_bot_service.verify_and_link_token(
                db, "TB-WRONG1", fake_chat_id
            )
            assert not ok
            assert "Token tidak valid" in msg
            print(f"  ✓ Rejected invalid token: {msg}")

            # 2. Exhaust attempts (5 attempts total)
            for i in range(4):
                ok, msg, _ = await telegram_bot_service.verify_and_link_token(
                    db, f"TB-WRONG{i+2}", fake_chat_id
                )
                assert not ok

            # 6th attempt should hit lockout
            ok, msg, _ = await telegram_bot_service.verify_and_link_token(
                db, new_token, fake_chat_id  # Even with correct token, should be locked out!
            )
            assert not ok
            assert "Terlalu banyak percobaan gagal" in msg or "dibatasi" in msg
            print(f"  ✓ Brute-force lockout enforced on chat ID {fake_chat_id}: {msg}")

            # Clean up lockout key for test isolation
            await redis_client.delete(f"tg_link_fail:{fake_chat_id}")

        # ── TEST 4: Successful Token Verification, 1-to-1 Mapping & Single-Use ─
        print("\n[TEST 4] Testing successful linking, 1-to-1 mapping, and single-use burn...")
        async with async_session_factory() as db:
            # dummy_chat_id was initially bound to other_user_id
            ok, msg, linked_user = await telegram_bot_service.verify_and_link_token(
                db, new_token, dummy_chat_id
            )
            assert ok
            assert linked_user is not None
            assert linked_user.id == test_user_id
            assert linked_user.telegram_chat_id == dummy_chat_id
            print(f"  ✓ Successfully linked token {new_token} to chat ID {dummy_chat_id}")

            # Verify single-use: token must be deleted from Redis
            consumed = await redis_client.get(f"tg_link_token:{new_token}")
            assert consumed is None, "Token must be burned immediately upon use"
            print("  ✓ Single-use guarantee verified: token was burned from Redis.")

            # Replay attack: repeating the same token must fail
            ok_replay, msg_replay, _ = await telegram_bot_service.verify_and_link_token(
                db, new_token, dummy_chat_id
            )
            assert not ok_replay
            print(f"  ✓ Replay attack blocked: {msg_replay}")

        # Verify DB state for both users
        async with async_session_factory() as db:
            u_check = (await db.execute(select(User).where(User.id == test_user_id))).scalar_one()
            other_check = (await db.execute(select(User).where(User.id == other_user_id))).scalar_one()

            assert u_check.telegram_chat_id == dummy_chat_id
            assert other_check.telegram_chat_id is None, "Previous owner of chat ID must be detached"
            print("  ✓ 1-to-1 uniqueness enforced: previous owner detached cleanly.")

        # ── TEST 5: Status Endpoint & Unlinking ────────────────────────────────
        print("\n[TEST 5] Testing status retrieval and unlinking...")
        async with async_session_factory() as db:
            u_check = (await db.execute(select(User).where(User.id == test_user_id))).scalar_one()
            status_data = await telegram_bot_service.get_telegram_status(db, u_check)
            assert status_data["is_connected"] is True
            assert status_data["telegram_chat_id"] == dummy_chat_id
            print(f"  ✓ Status verified: Connected with chat_id={status_data['telegram_chat_id']}")

            # Unlink
            unlinked = await telegram_bot_service.unlink_telegram(db, u_check)
            assert unlinked is True

            status_after = await telegram_bot_service.get_telegram_status(db, u_check)
            assert status_after["is_connected"] is False
            assert status_after["telegram_chat_id"] is None
            print("  ✓ Successfully unlinked account: status now Disconnected.")

        print("\n🎉 ALL TELEGRAM BOT TOKEN LINKING TESTS PASSED SUCCESSFULLY! 🎉\n")

    finally:
        # [CLEANUP]
        print("[CLEANUP] Cleaning up test records and Redis keys...")
        async with async_session_factory() as db:
            if test_user_id:
                u = await db.get(User, test_user_id)
                if u:
                    await db.delete(u)
            if other_user_id:
                ou = await db.get(User, other_user_id)
                if ou:
                    await db.delete(ou)
            await db.commit()

        # Clean any remaining test keys in Redis
        for uid in (test_user_id, other_user_id):
            if uid:
                await redis_client.delete(f"user_tg_link_token:{uid}")
                await redis_client.delete(f"tg_gen_rate:{uid}")
        await redis_client.delete(f"tg_link_fail:{dummy_chat_id}")
        await redis_client.delete(f"tg_link_fail:{fake_chat_id}")
        print("[CLEANUP] Done.")


if __name__ == "__main__":
    asyncio.run(run_tests())
