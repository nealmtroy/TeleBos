"""Integration tests for Telegram Bot Authenticator-Style Token Linking System."""

import json
import uuid
import pytest
from sqlalchemy import select, delete

from app.database import async_session_factory
from app.models.user import User
from app.services import telegram_bot_service
from app.utils.redis import redis_client


@pytest.fixture
async def tg_link_users():
    test_user_id = uuid.uuid4()
    other_user_id = uuid.uuid4()
    test_email = f"tg_test_{uuid.uuid4().hex[:8]}@example.com"
    other_email = f"tg_other_{uuid.uuid4().hex[:8]}@example.com"
    dummy_chat_id = 987654321

    async with async_session_factory() as db:
        user = User(
            id=test_user_id,
            email=test_email,
            role="pro",
            is_active=True,
        )
        other_user = User(
            id=other_user_id,
            email=other_email,
            role="basic",
            is_active=True,
            telegram_chat_id=dummy_chat_id,
        )
        db.add_all([user, other_user])
        await db.commit()

    yield {
        "user_id": test_user_id,
        "other_user_id": other_user_id,
        "email": test_email,
        "other_email": other_email,
        "dummy_chat_id": dummy_chat_id,
    }

    # Cleanup DB and Redis
    async with async_session_factory() as db:
        await db.execute(delete(User).where(User.id.in_([test_user_id, other_user_id])))
        await db.commit()

    for uid in (test_user_id, other_user_id):
        await redis_client.delete(f"user_tg_link_token:{uid}")
        await redis_client.delete(f"tg_gen_rate:{uid}")
    await redis_client.delete(f"tg_link_fail:{dummy_chat_id}")


@pytest.mark.asyncio
async def test_tg_bot_token_generation_and_redis_ttl(tg_link_users):
    """Test generating a linking token stores in Redis with proper TTL."""
    test_user_id = tg_link_users["user_id"]
    test_email = tg_link_users["email"]

    async with async_session_factory() as db:
        res_u = await db.execute(select(User).where(User.id == test_user_id))
        u = res_u.scalar_one()

        token_data = await telegram_bot_service.generate_linking_token(db, u)
        token = token_data["token"]
        assert token.startswith("TB-")
        assert len(token) == 9
        assert token_data["expires_in"] == 600

        # Verify in Redis
        raw_stored = await redis_client.get(f"tg_link_token:{token}")
        assert raw_stored is not None
        stored_data = json.loads(raw_stored)
        assert stored_data["user_id"] == str(test_user_id)
        assert stored_data["email"] == test_email

        ttl = await redis_client.ttl(f"tg_link_token:{token}")
        assert 500 <= ttl <= 600


@pytest.mark.asyncio
async def test_tg_bot_token_replacement_invalidates_old_token(tg_link_users):
    """Test generating a new token immediately burns the old active token."""
    test_user_id = tg_link_users["user_id"]

    async with async_session_factory() as db:
        res_u = await db.execute(select(User).where(User.id == test_user_id))
        u = res_u.scalar_one()

        token_data_1 = await telegram_bot_service.generate_linking_token(db, u)
        old_token = token_data_1["token"]

        token_data_2 = await telegram_bot_service.generate_linking_token(db, u)
        new_token = token_data_2["token"]
        assert new_token != old_token

        # Verify old token was burned
        old_stored = await redis_client.get(f"tg_link_token:{old_token}")
        assert old_stored is None

        # Verify new token is stored
        new_stored = await redis_client.get(f"tg_link_token:{new_token}")
        assert new_stored is not None


@pytest.mark.asyncio
async def test_tg_bot_token_invalid_rejection_and_brute_force_lockout(tg_link_users):
    """Test invalid token rejection and brute-force lockout on excessive attempts."""
    test_user_id = tg_link_users["user_id"]
    fake_chat_id = 1122334455

    async with async_session_factory() as db:
        res_u = await db.execute(select(User).where(User.id == test_user_id))
        u = res_u.scalar_one()
        token_data = await telegram_bot_service.generate_linking_token(db, u)
        valid_token = token_data["token"]

        # 1. Invalid token attempt
        ok, msg, _ = await telegram_bot_service.verify_and_link_token(
            db, "TB-WRONG1", fake_chat_id
        )
        assert not ok
        assert "Token tidak valid" in msg

        # 2. Exhaust attempts (5 attempts total)
        for i in range(4):
            ok, msg, _ = await telegram_bot_service.verify_and_link_token(
                db, f"TB-WRONG{i+2}", fake_chat_id
            )
            assert not ok

        # 6th attempt hits lockout even with valid token
        ok, msg, _ = await telegram_bot_service.verify_and_link_token(
            db, valid_token, fake_chat_id
        )
        assert not ok
        assert "Terlalu banyak percobaan gagal" in msg or "dibatasi" in msg

    await redis_client.delete(f"tg_link_fail:{fake_chat_id}")


@pytest.mark.asyncio
async def test_tg_bot_token_successful_linking_uniqueness_and_single_use(tg_link_users):
    """Test successful token verification, single-use burn, replay prevention, and 1-to-1 uniqueness."""
    test_user_id = tg_link_users["user_id"]
    other_user_id = tg_link_users["other_user_id"]
    dummy_chat_id = tg_link_users["dummy_chat_id"]

    async with async_session_factory() as db:
        res_u = await db.execute(select(User).where(User.id == test_user_id))
        u = res_u.scalar_one()
        token_data = await telegram_bot_service.generate_linking_token(db, u)
        token = token_data["token"]

        # Link token
        ok, msg, linked_user = await telegram_bot_service.verify_and_link_token(
            db, token, dummy_chat_id
        )
        assert ok
        assert linked_user is not None
        assert linked_user.id == test_user_id
        assert linked_user.telegram_chat_id == dummy_chat_id

        # Verify single-use burn
        consumed = await redis_client.get(f"tg_link_token:{token}")
        assert consumed is None

        # Replay attempt fails
        ok_replay, _, _ = await telegram_bot_service.verify_and_link_token(
            db, token, dummy_chat_id
        )
        assert not ok_replay

    # Verify DB state: previous owner detached, new owner attached
    async with async_session_factory() as db:
        u_check = (await db.execute(select(User).where(User.id == test_user_id))).scalar_one()
        other_check = (await db.execute(select(User).where(User.id == other_user_id))).scalar_one()

        assert u_check.telegram_chat_id == dummy_chat_id
        assert other_check.telegram_chat_id is None


@pytest.mark.asyncio
async def test_tg_bot_token_status_and_unlinking(tg_link_users):
    """Test status retrieval and unlinking of connected Telegram account."""
    test_user_id = tg_link_users["user_id"]
    standalone_chat_id = 9988776655

    async with async_session_factory() as db:
        res_u = await db.execute(select(User).where(User.id == test_user_id))
        u = res_u.scalar_one()
        u.telegram_chat_id = standalone_chat_id
        await db.commit()

        status_data = await telegram_bot_service.get_telegram_status(db, u)
        assert status_data["is_connected"] is True
        assert status_data["telegram_chat_id"] == standalone_chat_id

        # Unlink
        unlinked = await telegram_bot_service.unlink_telegram(db, u)
        assert unlinked is True

        status_after = await telegram_bot_service.get_telegram_status(db, u)
        assert status_after["is_connected"] is False
        assert status_after["telegram_chat_id"] is None
