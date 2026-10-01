"""Clearing a profile field must not send an empty value to Telegram.

Regression: an account with no username could not save its profile at all.
Saving sent username="" to Telegram, because "" is what the form sends for a
cleared field and the service forwarded it. Telegram has no API for removing a
username and rejects an empty one, so every save came back 400 and nothing
persisted — the user-visible symptom was "save does nothing".

Telegram does support clearing last_name and about, so those still go through
as empty strings. Only username is local-only when cleared.
"""

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.services import account_service


def _account(username=None):
    account = MagicMock()
    account.id = uuid4()
    account.session_string = "encrypted"
    account.first_name = "Ujang"
    account.last_name = None
    account.username = username
    account.bio = None
    return account


def _client():
    sent = {}

    async def _call(request):
        sent.setdefault("requests", []).append(request)
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


def _username_calls(client):
    from telethon.tl.functions.account import UpdateUsernameRequest

    return [
        r for r in client.sent.get("requests", [])
        if isinstance(r, UpdateUsernameRequest)
    ]


def _profile_calls(client):
    from telethon.tl.functions.account import UpdateProfileRequest

    return [
        r for r in client.sent.get("requests", [])
        if isinstance(r, UpdateProfileRequest)
    ]


async def _update(pool, account, first, last, username, bio):
    db = MagicMock()
    db.flush = AsyncMock()
    client = await pool.get("x", "y")
    with patch.object(account_service, "client_pool", pool), \
         patch("app.services.account_service.decrypt", lambda s: "sess"):
        await account_service.update_profile(db, account, first, last, username, bio)
    return client


@pytest.mark.asyncio
async def test_empty_username_is_not_pushed_to_telegram(pool):
    """Regression: username="" made every save fail with 400."""
    account = _account(username=None)
    client = await _update(pool, account, "Ujang", "", "", "")

    assert _username_calls(client) == [], "empty username must not be sent"
    assert account.username is None


@pytest.mark.asyncio
async def test_empty_username_clears_existing_value_locally(pool):
    account = _account(username="oldhandle")
    client = await _update(pool, account, "Ujang", "", "", "")

    assert _username_calls(client) == []
    assert account.username is None


@pytest.mark.asyncio
async def test_username_none_leaves_value_untouched(pool):
    account = _account(username="oldhandle")
    client = await _update(pool, account, "Ujang", None, None, None)

    assert _username_calls(client) == []
    assert account.username == "oldhandle"


@pytest.mark.asyncio
async def test_real_username_is_still_pushed(pool):
    account = _account(username=None)
    client = await _update(pool, account, "Ujang", "", "newhandle", "")

    calls = _username_calls(client)
    assert len(calls) == 1
    assert calls[0].username == "newhandle"
    assert account.username == "newhandle"


@pytest.mark.asyncio
async def test_unchanged_username_is_not_resent(pool):
    account = _account(username="samehandle")
    client = await _update(pool, account, "Ujang", "", "samehandle", "")

    assert _username_calls(client) == []


@pytest.mark.asyncio
async def test_cleared_last_name_and_bio_still_go_to_telegram(pool):
    """Telegram does accept empty last_name/about, unlike username."""
    account = _account()
    client = await _update(pool, account, "Ujang", "", "", "")

    profile = _profile_calls(client)
    assert len(profile) == 1
    assert profile[0].last_name == ""
    assert profile[0].about == ""