import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.services import account_service


class FakeResult:
    def __init__(self, items):
        self._items = items

    def scalars(self):
        return SimpleNamespace(all=lambda: self._items)

    def scalar_one_or_none(self):
        return self._items[0] if self._items else None

    def scalar(self):
        return self._items[0] if self._items else None


@pytest.mark.asyncio
async def test_transfer_accounts_success():
    owner = SimpleNamespace(id=uuid.uuid4(), role="owner", email="owner@test.com")
    target_user = SimpleNamespace(id=uuid.uuid4(), role="pro", email="target@test.com", is_active=True)
    acc1 = SimpleNamespace(id=uuid.uuid4(), user_id=owner.id, phone="+628111", for_sale=False, updated_at=None)
    acc2 = SimpleNamespace(id=uuid.uuid4(), user_id=owner.id, phone="+628222", for_sale=False, updated_at=None)

    db = AsyncMock()
    # 1st execute: find target user
    # 2nd execute: find accounts
    # 3rd execute: delete from folder members
    # 4th execute: delete from folder members
    db.execute.side_effect = [
        FakeResult([target_user]),
        FakeResult([acc1, acc2]),
        None,
        None,
    ]
    db.scalar.return_value = 2  # target has 2 accounts currently, pro limit is 10
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    with patch("app.services.session_manager.session_manager.is_account_in_active_job", AsyncMock(return_value=False)), \
         patch("app.services.event_relay.event_relay.detach", AsyncMock()), \
         patch("app.services.telegram_client.client_pool.remove", AsyncMock()):
        count, user_res, transferred = await account_service.transfer_accounts(
            db, owner, [acc1.id, acc2.id], "target@test.com"
        )

    assert count == 2
    assert user_res.id == target_user.id
    assert acc1.user_id == target_user.id
    assert acc2.user_id == target_user.id
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_transfer_accounts_non_owner_forbidden():
    non_owner = SimpleNamespace(id=uuid.uuid4(), role="pro", email="user@test.com")
    db = AsyncMock()

    with pytest.raises(ValueError, match="Hanya role owner"):
        await account_service.transfer_accounts(
            db, non_owner, [uuid.uuid4()], "target@test.com"
        )


@pytest.mark.asyncio
async def test_transfer_accounts_target_not_found():
    owner = SimpleNamespace(id=uuid.uuid4(), role="owner", email="owner@test.com")
    db = AsyncMock()
    db.execute.return_value = FakeResult([])

    with pytest.raises(ValueError, match="tidak ditemukan"):
        await account_service.transfer_accounts(
            db, owner, [uuid.uuid4()], "nonexistent@test.com"
        )


@pytest.mark.asyncio
async def test_transfer_accounts_target_inactive():
    owner = SimpleNamespace(id=uuid.uuid4(), role="owner", email="owner@test.com")
    inactive_target = SimpleNamespace(id=uuid.uuid4(), role="pro", email="inactive@test.com", is_active=False)
    db = AsyncMock()
    db.execute.return_value = FakeResult([inactive_target])

    with pytest.raises(ValueError, match="tidak aktif"):
        await account_service.transfer_accounts(
            db, owner, [uuid.uuid4()], "inactive@test.com"
        )


@pytest.mark.asyncio
async def test_transfer_accounts_for_sale_blocked():
    owner = SimpleNamespace(id=uuid.uuid4(), role="owner", email="owner@test.com")
    target = SimpleNamespace(id=uuid.uuid4(), role="pro", email="target@test.com", is_active=True)
    acc = SimpleNamespace(id=uuid.uuid4(), user_id=owner.id, phone="+628111", for_sale=True, updated_at=None)

    db = AsyncMock()
    db.execute.side_effect = [
        FakeResult([target]),
        FakeResult([acc]),
    ]

    with patch("app.services.session_manager.session_manager.is_account_in_active_job", AsyncMock(return_value=False)):
        with pytest.raises(ValueError, match="sedang didaftarkan jual"):
            await account_service.transfer_accounts(
                db, owner, [acc.id], "target@test.com"
            )


@pytest.mark.asyncio
async def test_transfer_accounts_quota_exceeded_and_override():
    owner = SimpleNamespace(id=uuid.uuid4(), role="owner", email="owner@test.com")
    # basic role limit is 1
    basic_target = SimpleNamespace(id=uuid.uuid4(), role="basic", email="basic@test.com", is_active=True)
    acc1 = SimpleNamespace(id=uuid.uuid4(), user_id=owner.id, phone="+628111", for_sale=False, updated_at=None)
    acc2 = SimpleNamespace(id=uuid.uuid4(), user_id=owner.id, phone="+628222", for_sale=False, updated_at=None)

    db = AsyncMock()
    db.execute.side_effect = [
        FakeResult([basic_target]),
        FakeResult([acc1, acc2]),
    ]
    db.scalar.return_value = 1  # already has 1 account, limit is 1

    with patch("app.services.session_manager.session_manager.is_account_in_active_job", AsyncMock(return_value=False)):
        # Without override -> raises ValueError
        with pytest.raises(ValueError, match="Batas kuota akun"):
            await account_service.transfer_accounts(
                db, owner, [acc1.id, acc2.id], "basic@test.com", override_limit=False
            )

    # With override -> succeeds
    db.execute.side_effect = [
        FakeResult([basic_target]),
        FakeResult([acc1, acc2]),
        None,
        None,
    ]
    with patch("app.services.session_manager.session_manager.is_account_in_active_job", AsyncMock(return_value=False)), \
         patch("app.services.event_relay.event_relay.detach", AsyncMock()), \
         patch("app.services.telegram_client.client_pool.remove", AsyncMock()):
        count, _, _ = await account_service.transfer_accounts(
            db, owner, [acc1.id, acc2.id], "basic@test.com", override_limit=True
        )
    assert count == 2
