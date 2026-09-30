"""Clearing an optional profile field must actually clear it.

Telegram treats an empty last name as valid, but the API contract here
distinguishes "" (clear this field) from None (caller omitted it). A naive
``if last_name is not None`` guard silently drops the clear, so the value
snaps back on the next fetch.
"""

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.services import account_service


def _account(first_name="Ada", last_name="Lovelace", username="ada", bio="hi"):
    account = MagicMock()
    account.id = uuid4()
    account.session_string = "encrypted"
    account.first_name = first_name
    account.last_name = last_name
    account.username = username
    account.bio = bio
    return account


def _client():
    """A Telethon client whose __call__ is awaitable and records the request."""
    sent = {}

    async def _call(request):
        sent["request"] = request
        return MagicMock()

    client = AsyncMock()
    client.side_effect = _call
    client.sent = sent
    return client


@pytest.fixture
def pool():
    p = MagicMock()
    p.get = AsyncMock(return_value=_client())
    return p


@pytest.mark.asyncio
async def test_empty_last_name_is_cleared_in_db(pool):
    """Regression: "" must clear the field, not be ignored like None."""
    account = _account()
    db = MagicMock()
    db.flush = AsyncMock()
    client = await pool.get("x", "y")

    with patch.object(account_service, "client_pool", pool), \
         patch("app.services.account_service.decrypt", lambda s: "sess"):
        await account_service.update_profile(db, account, "Ada", "", None, None)

    # Telegram received the clear...
    assert client.sent["request"].last_name == ""
    # ...and so did the DB, or the UI would snap back to the old value.
    assert account.last_name is None


@pytest.mark.asyncio
async def test_none_last_name_leaves_value_untouched(pool):
    """None means "not supplied" and must not clear anything."""
    account = _account()
    db = MagicMock()
    db.flush = AsyncMock()
    client = await pool.get("x", "y")

    with patch.object(account_service, "client_pool", pool), \
         patch("app.services.account_service.decrypt", lambda s: "sess"):
        await account_service.update_profile(db, account, "Ada", None, None, None)

    assert client.sent["request"].last_name == "Lovelace"
    assert account.last_name == "Lovelace"


@pytest.mark.asyncio
async def test_last_name_set_to_a_value(pool):
    account = _account()
    db = MagicMock()
    db.flush = AsyncMock()
    client = await pool.get("x", "y")

    with patch.object(account_service, "client_pool", pool), \
         patch("app.services.account_service.decrypt", lambda s: "sess"):
        await account_service.update_profile(db, account, "Ada", "Byron", None, None)

    assert client.sent["request"].last_name == "Byron"
    assert account.last_name == "Byron"


@pytest.mark.asyncio
@pytest.mark.parametrize("blank", ["", "   "])
async def test_blank_first_name_is_rejected(pool, blank):
    """Telegram requires a first name; fail clearly instead of an RPC error."""
    account = _account()
    db = MagicMock()
    db.flush = AsyncMock()

    with patch.object(account_service, "client_pool", pool), \
         patch("app.services.account_service.decrypt", lambda s: "sess"):
        with pytest.raises(RuntimeError, match="Nama depan"):
            await account_service.update_profile(db, account, blank, "Byron", None, None)


@pytest.mark.asyncio
async def test_empty_username_and_bio_become_null(pool):
    account = _account()
    db = MagicMock()
    db.flush = AsyncMock()
    client = await pool.get("x", "y")

    with patch.object(account_service, "client_pool", pool), \
         patch("app.services.account_service.decrypt", lambda s: "sess"):
        await account_service.update_profile(db, account, "Ada", "", "", "")

    assert account.username is None
    assert account.bio is None
