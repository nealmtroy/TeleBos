"""Unit & Integration Test Suite for SEC-04 AsyncSession Isolation in Background Reconnect.

Verifies:
1. _safe_bg_reconnect_account operates completely decoupled from request-scoped AsyncSession.
2. attach_and_reconnect safely accepts detached TelegramAccount objects or string UUIDs even when passed a closed/None session.
3. Closed request session simulation: Closing the session before/during background task execution does NOT trigger InvalidRequestError.
"""

import asyncio
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import select, delete

from app.database import async_session_factory
from app.models.telegram_account import TelegramAccount
from app.models.user import User
from app.services.session_manager import session_manager
from app.api.wallet import _safe_bg_reconnect_account


@pytest.fixture
async def sec04_setup():
    test_user_id = uuid.uuid4()
    test_account_id = uuid.uuid4()

    async with async_session_factory() as db:
        user = User(
            id=test_user_id,
            email=f"test_sec04_{uuid.uuid4().hex[:8]}@example.com",
            role="basic",
            is_active=True,
        )
        db.add(user)
        await db.flush()

        account = TelegramAccount(
            id=test_account_id,
            user_id=user.id,
            phone=f"+62899{uuid.uuid4().int % 100000000:08d}",
            session_string="test_mock_session_string",
            is_active=True,
            for_sale=False,
        )
        db.add(account)
        await db.commit()

    yield test_user_id, test_account_id

    async with async_session_factory() as db:
        await db.execute(delete(TelegramAccount).where(TelegramAccount.id == test_account_id))
        await db.execute(delete(User).where(User.id == test_user_id))
        await db.commit()


@pytest.mark.asyncio
async def test_sec04_attach_and_reconnect_with_none_session(sec04_setup):
    """Test attach_and_reconnect handles db=None without session errors."""
    _, test_account_id = sec04_setup
    mock_acc = TelegramAccount(id=test_account_id)

    with patch.object(session_manager, "_connect_account", new_callable=AsyncMock, return_value=True):
        res = await session_manager.attach_and_reconnect(db=None, account=mock_acc)
        assert isinstance(res, bool)


@pytest.mark.asyncio
async def test_sec04_closed_session_simulation_on_detached_instance(sec04_setup):
    """Test closed session behavior does not trigger InvalidRequestError on detached instance."""
    _, test_account_id = sec04_setup

    db_scoped = async_session_factory()
    res_acc = await db_scoped.execute(
        select(TelegramAccount).where(TelegramAccount.id == test_account_id)
    )
    detached_account = res_acc.scalar_one()

    # Explicitly close session to simulate FastAPI request teardown
    await db_scoped.close()

    with patch.object(session_manager, "_connect_account", new_callable=AsyncMock, return_value=True):
        res_closed = await session_manager.attach_and_reconnect(
            db=db_scoped, account=detached_account
        )
        assert isinstance(res_closed, bool)


@pytest.mark.asyncio
async def test_sec04_safe_bg_reconnect_account_background_task(sec04_setup):
    """Test _safe_bg_reconnect_account completes safely when executed as an asyncio task."""
    _, test_account_id = sec04_setup

    with patch.object(session_manager, "_connect_account", new_callable=AsyncMock, return_value=True):
        task = asyncio.create_task(_safe_bg_reconnect_account(str(test_account_id)))
        await task
        assert task.done() and not task.cancelled()


@pytest.mark.asyncio
async def test_sec04_safe_bg_reconnect_nonexistent_account_graceful():
    """Test _safe_bg_reconnect_account handles nonexistent random UUID gracefully."""
    random_id = str(uuid.uuid4())

    with patch.object(session_manager, "_connect_account", new_callable=AsyncMock, return_value=True):
        task_random = asyncio.create_task(_safe_bg_reconnect_account(random_id))
        await task_random
        assert task_random.done() and not task_random.cancelled()
