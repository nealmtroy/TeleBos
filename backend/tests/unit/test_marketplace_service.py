import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services import marketplace_profile_service, marketplace_service
from app.services.marketplace_profile_service import MarketplaceProfilePreparationError


class FakeResult:
    def __init__(self, accounts):
        self._accounts = accounts

    def scalars(self):
        return SimpleNamespace(all=lambda: self._accounts)


class FakeDatabase:
    def __init__(self, account):
        self.account = account
        self.execute = AsyncMock(return_value=FakeResult([account]))
        self.flush = AsyncMock()
        self.add = MagicMock()


def make_account(owner_id):
    return SimpleNamespace(
        id=uuid.uuid4(),
        user_id=owner_id,
        phone="+628123456789",
        for_sale=False,
        is_sold=False,
        is_active=True,
        auto_reply_enabled=True,
    )


async def test_listing_does_not_change_marketplace_state_when_profile_preparation_fails(
    monkeypatch,
):
    owner_id = uuid.uuid4()
    account = make_account(owner_id)
    db = FakeDatabase(account)
    user = SimpleNamespace(id=owner_id)
    prepare = AsyncMock(
        side_effect=MarketplaceProfilePreparationError("Unable to update the Telegram profile.")
    )

    monkeypatch.setattr(marketplace_profile_service, "prepare_account_for_sale", prepare)
    monkeypatch.setattr(
        "app.services.user_account_price_service.resolve_telegram_id_price",
        AsyncMock(return_value=5500),
    )

    with pytest.raises(MarketplaceProfilePreparationError):
        await marketplace_service.sell_accounts(db, user, [str(account.id)])

    prepare.assert_awaited_once()
    assert account.for_sale is False
    assert account.is_sold is False
    assert account.is_active is True
    assert account.auto_reply_enabled is True
    db.flush.assert_not_awaited()
    db.add.assert_not_called()


async def test_listing_rejects_duplicate_account_ids_before_profile_preparation(monkeypatch):
    owner_id = uuid.uuid4()
    account = make_account(owner_id)
    db = FakeDatabase(account)
    user = SimpleNamespace(id=owner_id)
    prepare = AsyncMock()

    monkeypatch.setattr(marketplace_profile_service, "prepare_account_for_sale", prepare)

    with pytest.raises(ValueError, match="only be listed once"):
        await marketplace_service.sell_accounts(db, user, [str(account.id), str(account.id)])

    prepare.assert_not_awaited()
    db.execute.assert_not_awaited()
