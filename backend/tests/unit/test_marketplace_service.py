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

    def scalar_one_or_none(self):
        return self._accounts[0] if self._accounts else None

    def scalar_one(self):
        return self._accounts[0]


class FakeDatabase:
    def __init__(self, account):
        self.account = account
        self.execute = AsyncMock(return_value=FakeResult([account]))
        self.flush = AsyncMock()
        self.add = MagicMock()


def make_account(owner_id, *, for_sale=False, sell_price=None):
    return SimpleNamespace(
        id=uuid.uuid4(),
        user_id=owner_id,
        phone="+628123456789",
        telegram_id=123456789,
        seller_id=owner_id if for_sale else None,
        for_sale=for_sale,
        is_sold=False,
        is_active=True,
        sell_price=sell_price,
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


async def test_cancel_listing_audits_original_price():
    owner_id = uuid.uuid4()
    account = make_account(owner_id, for_sale=True, sell_price=5500)
    db = FakeDatabase(account)
    user = SimpleNamespace(id=owner_id)

    result = await marketplace_service.cancel_sell_account(db, user, str(account.id))

    assert result is account
    assert account.for_sale is False
    assert account.is_active is True
    assert account.sell_price is None
    assert account.seller_id is None
    added = [call.args[0] for call in db.add.call_args_list]
    audit = next(item for item in added if getattr(item, "action", None) == "cancel_sale")
    notification = next(item for item in added if getattr(item, "event", None))
    assert audit.action == "cancel_sale"
    assert audit.price == 5500
    assert notification.event == "marketplace.listing_cancelled"
    db.flush.assert_awaited_once()


async def test_cancel_legacy_listing_resolves_missing_price(monkeypatch):
    owner_id = uuid.uuid4()
    account = make_account(owner_id, for_sale=True, sell_price=None)
    db = FakeDatabase(account)
    user = SimpleNamespace(id=owner_id)
    resolve_price = AsyncMock(return_value=6000)
    monkeypatch.setattr(
        "app.services.user_account_price_service.resolve_telegram_id_price",
        resolve_price,
    )

    await marketplace_service.cancel_sell_account(db, user, str(account.id))

    resolve_price.assert_awaited_once_with(db, account)
    added = [call.args[0] for call in db.add.call_args_list]
    audit = next(item for item in added if getattr(item, "action", None) == "cancel_sale")
    assert audit.action == "cancel_sale"
    assert audit.price == 6000
    assert account.sell_price is None
    db.flush.assert_awaited_once()


async def test_invalid_session_delists_account_without_reactivating_it():
    owner_id = uuid.uuid4()
    account = make_account(owner_id, for_sale=True, sell_price=5500)
    db = FakeDatabase(account)

    cancelled = await marketplace_service.cancel_invalid_listing(db, str(account.id))

    assert cancelled is True
    assert account.for_sale is False
    assert account.is_active is False
    assert account.sell_price is None
    assert account.seller_id is None
    added = [call.args[0] for call in db.add.call_args_list]
    audit = next(item for item in added if getattr(item, "action", None) == "listing_invalid")
    notification = next(item for item in added if getattr(item, "event", None))
    assert audit.action == "listing_invalid"
    assert audit.price == 5500
    assert notification.event == "marketplace.listing_invalid"
    db.flush.assert_awaited_once()


async def test_purchase_notifies_buyer_and_seller():
    id1, id2 = sorted([uuid.uuid4(), uuid.uuid4()])
    buyer_id, seller_id = id1, id2
    account = make_account(seller_id, for_sale=True, sell_price=5500)
    buyer = SimpleNamespace(id=buyer_id, balance=10000)
    seller = SimpleNamespace(id=seller_id, balance=0)
    db = SimpleNamespace(
        execute=AsyncMock(
            side_effect=[FakeResult([account]), FakeResult([buyer]), FakeResult([seller])]
        ),
        add=MagicMock(),
        flush=AsyncMock(),
    )

    await marketplace_service.buy_account(db, SimpleNamespace(id=buyer_id), str(account.id))

    events = {
        item.event
        for call in db.add.call_args_list
        if (item := call.args[0]) and getattr(item, "event", None)
    }
    assert events == {
        "marketplace.purchase_completed",
        "marketplace.sale_completed",
    }
    assert buyer.balance == 4500
    assert seller.balance == 5500
