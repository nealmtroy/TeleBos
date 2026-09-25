"""Unit tests for Auto-Reply Scalability and Audit Fixes."""

import uuid
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from app.utils.redis import (
    get_auto_reply_config,
    set_auto_reply_config,
    invalidate_auto_reply_config,
    is_auto_reply_sent_to_user,
    mark_auto_reply_sent_to_user,
    check_auto_reply_rate_limit,
)
from app.database import engine
from app.services.session_manager import session_manager


@pytest.mark.asyncio
async def test_redis_auto_reply_config_caching():
    """Test setting, getting, and invalidating auto-reply config in Redis."""
    account_id = str(uuid.uuid4())
    fake_storage = {}

    async def fake_hset(key, mapping=None):
        fake_storage[key] = mapping.copy()

    async def fake_hgetall(key):
        return fake_storage.get(key, {})

    async def fake_expire(key, seconds):
        pass

    async def fake_delete(key):
        fake_storage.pop(key, None)

    with patch("app.utils.redis.redis_client.hset", side_effect=fake_hset), \
         patch("app.utils.redis.redis_client.hgetall", side_effect=fake_hgetall), \
         patch("app.utils.redis.redis_client.expire", side_effect=fake_expire), \
         patch("app.utils.redis.redis_client.delete", side_effect=fake_delete):

        # Initial cache miss
        conf = await get_auto_reply_config(account_id)
        assert conf is None

        # Set config
        await set_auto_reply_config(account_id, enabled=True, text="Halo, selamat datang!")
        conf = await get_auto_reply_config(account_id)
        assert conf is not None
        assert conf["enabled"] is True
        assert conf["text"] == "Halo, selamat datang!"

        # Invalidate config
        await invalidate_auto_reply_config(account_id)
        conf = await get_auto_reply_config(account_id)
        assert conf is None


@pytest.mark.asyncio
async def test_redis_user_replied_dedup_cache():
    """Test 30-day user replied deduplication cache in Redis."""
    account_id = str(uuid.uuid4())
    sender_id = 99887766
    replied_set = set()

    async def fake_setex(key, ttl, val):
        replied_set.add(key)

    async def fake_exists(key):
        return 1 if key in replied_set else 0

    with patch("app.utils.redis.redis_client.setex", side_effect=fake_setex), \
         patch("app.utils.redis.redis_client.exists", side_effect=fake_exists):

        # Initially not replied
        assert await is_auto_reply_sent_to_user(account_id, sender_id) is False

        # Mark replied
        await mark_auto_reply_sent_to_user(account_id, sender_id)
        assert await is_auto_reply_sent_to_user(account_id, sender_id) is True


@pytest.mark.asyncio
async def test_service_notification_sender_filtering():
    """Ensure service notifications (777000, 42777, SpamBot) are blocked from triggering auto-replies."""
    from app.services.event_relay import TelegramEventRelay

    relay = TelegramEventRelay()
    account_id = str(uuid.uuid4())

    # Mock event with sender 777000 (Telegram Notifications)
    event_service_777000 = MagicMock()
    event_service_777000.is_private = True
    msg_mock = MagicMock()
    msg_mock.text = "Telegram login code: 12345"
    msg_mock.out = False
    msg_mock.media = None
    event_service_777000.message = msg_mock

    sender_777000 = MagicMock()
    sender_777000.id = 777000
    sender_777000.bot = False
    sender_777000.username = "Telegram"
    sender_777000.is_self = False

    event_service_777000.get_sender = AsyncMock(return_value=sender_777000)
    event_service_777000.get_chat = AsyncMock(return_value=sender_777000)
    event_service_777000.client = MagicMock()
    event_service_777000.client.send_message = AsyncMock()

    # Track handler in relay
    relay._handlers[account_id] = [MagicMock()]

    with patch("app.services.event_relay.manager.broadcast", new_callable=AsyncMock):
        await relay._on_new_message(account_id, event_service_777000)

    # Event client send_message must NOT have been called for 777000
    event_service_777000.client.send_message.assert_not_called()


@pytest.mark.asyncio
async def test_spambot_sender_filtering():
    """Ensure SpamBot notifications are blocked from triggering auto-replies."""
    from app.services.event_relay import TelegramEventRelay

    relay = TelegramEventRelay()
    account_id = str(uuid.uuid4())

    event_spambot = MagicMock()
    event_spambot.is_private = True
    msg_mock = MagicMock()
    msg_mock.text = "Your account is limited."
    msg_mock.out = False
    msg_mock.media = None
    event_spambot.message = msg_mock

    sender_spambot = MagicMock()
    sender_spambot.id = 178220800
    sender_spambot.bot = True
    sender_spambot.username = "SpamBot"
    sender_spambot.is_self = False

    event_spambot.get_sender = AsyncMock(return_value=sender_spambot)
    event_spambot.get_chat = AsyncMock(return_value=sender_spambot)
    event_spambot.client = MagicMock()
    event_spambot.client.send_message = AsyncMock()

    relay._handlers[account_id] = [MagicMock()]

    with patch("app.services.event_relay.manager.broadcast", new_callable=AsyncMock):
        await relay._on_new_message(account_id, event_spambot)

    event_spambot.client.send_message.assert_not_called()


@pytest.mark.asyncio
async def test_database_connection_pool_settings():
    """Verify that PostgreSQL engine pool size and max overflow are scaled to 50."""
    assert engine.pool.size() == 50
    assert engine.pool._max_overflow == 50


@pytest.mark.asyncio
async def test_session_manager_on_job_completed():
    """Verify on_job_completed re-connects auto-reply accounts after worker release."""
    account_id = str(uuid.uuid4())
    fake_account = MagicMock()
    fake_account.id = uuid.UUID(account_id)
    fake_account.is_active = True
    fake_account.auto_reply_enabled = True

    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = fake_account
    mock_db.execute.return_value = mock_result

    with patch("app.database.async_session_factory") as mock_factory, \
         patch.object(session_manager, "is_account_in_active_job", new_callable=AsyncMock, return_value=False), \
         patch.object(session_manager, "ensure_connected_on_demand", new_callable=AsyncMock) as mock_ensure:

        mock_factory.return_value.__aenter__.return_value = mock_db
        session_manager._running = True

        await session_manager.on_job_completed([account_id])

        mock_ensure.assert_called_once_with(account_id)
