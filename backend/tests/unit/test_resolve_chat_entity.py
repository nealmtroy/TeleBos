"""Regression tests for PYTHON-FASTAPI-6: ChatIdInvalidError on basic groups.

``resolve_chat_entity`` chose the Telethon input-peer type from the stored
``TelegramChat.type``, but ``"group"`` -- the value ``_classify_chat`` writes for
every Telethon ``Chat`` entity -- was missing from the branch list and fell into
a catch-all ``else``.

The deciding mistake was gating the whole block on ``access_hash is not None``.
A basic group is a ``Chat``, and Telethon's ``Chat`` has no ``access_hash`` field
at all, so that gate never passed. Resolution fell through to a bare-int
``client.get_entity(chat_id)``, which Telethon resolves against an ambiguous
scope, yielding an ``InputPeerChat`` the server then rejects with
``ChatIdInvalidError``.

Every basic group's message history was a 500.
"""

import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from telethon.tl.types import (
    InputPeerChannel,
    InputPeerChat,
    InputPeerUser,
    PeerChannel,
    PeerUser,
)

from app.services.chat_service import _classify_chat, resolve_chat_entity

ACCOUNT_ID = uuid.UUID("4e6bca80-2adc-416f-97c3-e71a28493596")
# The chat id from the production event.
GROUP_CHAT_ID = 8793386352
USER_ID = 8392488007
ACCESS_HASH = 555555555


class _FakeClient:
    """Client whose cache always misses, forcing the DB path."""

    def __init__(self):
        self.get_input_entity = AsyncMock(side_effect=ValueError("cache miss"))
        self.get_entity = AsyncMock(side_effect=AssertionError("must not reach bare-int fallback"))


async def _resolve(chat_type, access_hash, chat_id, client=None):
    """Run resolve_chat_entity with a stubbed DB row."""
    client = client or _FakeClient()
    row = (access_hash, chat_type)

    session = AsyncMock()
    session.execute = AsyncMock(return_value=SimpleNamespace(first=lambda: row))
    session_ctx = AsyncMock()
    session_ctx.__aenter__ = AsyncMock(return_value=session)
    session_ctx.__aexit__ = AsyncMock(return_value=False)

    with patch("app.database.async_session_factory", return_value=session_ctx):
        return await resolve_chat_entity(client, ACCOUNT_ID, chat_id), client


@pytest.mark.asyncio
async def test_basic_group_resolves_to_input_peer_chat():
    """The production crash: a basic group must resolve to InputPeerChat."""
    entity, client = await _resolve("group", None, GROUP_CHAT_ID)

    assert isinstance(entity, InputPeerChat)
    assert entity.chat_id == GROUP_CHAT_ID
    # It must be resolved locally -- no network round-trip needed.
    client.get_entity.assert_not_called()


@pytest.mark.asyncio
async def test_basic_group_resolves_even_if_access_hash_present():
    """Type decides the peer, not access_hash."""
    entity, _ = await _resolve("group", ACCESS_HASH, GROUP_CHAT_ID)
    assert isinstance(entity, InputPeerChat)


@pytest.mark.asyncio
async def test_user_resolves_to_input_peer_user():
    entity, client = await _resolve("user", ACCESS_HASH, USER_ID)
    assert isinstance(entity, InputPeerUser)
    assert entity.user_id == USER_ID
    assert entity.access_hash == ACCESS_HASH
    client.get_entity.assert_not_called()


@pytest.mark.asyncio
async def test_bot_resolves_to_input_peer_user():
    """_classify_chat stores "bot" for bot users; they are User entities."""
    entity, _ = await _resolve("bot", ACCESS_HASH, USER_ID)
    assert isinstance(entity, InputPeerUser)


@pytest.mark.asyncio
@pytest.mark.parametrize("chat_type", ["channel", "supergroup"])
async def test_channel_and_supergroup_resolve_to_input_peer_channel(chat_type):
    entity, client = await _resolve(chat_type, ACCESS_HASH, -1001234567890)
    assert isinstance(entity, InputPeerChannel)
    assert entity.channel_id == -1001234567890
    assert entity.access_hash == ACCESS_HASH
    client.get_entity.assert_not_called()


@pytest.mark.asyncio
async def test_network_fallback_uses_explicit_peer_not_bare_int():
    """When the DB has no usable hash, resolve via a typed Peer."""
    client = _FakeClient()
    client.get_input_entity = AsyncMock(side_effect=ValueError("cache miss"))
    client.get_input_entity.side_effect = [
        ValueError("cache miss"),
        InputPeerUser(user_id=USER_ID, access_hash=ACCESS_HASH),
    ]

    # access_hash is None -> must fall through to the peer-based path.
    entity, _ = await _resolve("user", None, USER_ID, client=client)

    assert isinstance(entity, InputPeerUser)
    # [0] is the bare-int cache attempt; [1] is the typed-peer fallback.
    peer_arg = client.get_input_entity.await_args_list[1].args[0]
    assert isinstance(peer_arg, PeerUser)
    assert peer_arg.user_id == USER_ID
    client.get_entity.assert_not_called()


@pytest.mark.asyncio
async def test_supergroup_fallback_uses_peer_channel():
    client = _FakeClient()
    client.get_input_entity = AsyncMock(side_effect=ValueError("cache miss"))
    client.get_input_entity.side_effect = [
        ValueError("cache miss"),
        InputPeerChannel(channel_id=-100999, access_hash=ACCESS_HASH),
    ]

    await _resolve("supergroup", None, -100999, client=client)

    peer_arg = client.get_input_entity.await_args_list[1].args[0]
    assert isinstance(peer_arg, PeerChannel)
    assert peer_arg.channel_id == -100999


@pytest.mark.asyncio
async def test_unresolvable_chat_raises_user_facing_runtime_error():
    """PYTHON-FASTAPI-8: no cached entity, no access_hash, network misses too.

    Every resolution path failed, so this must surface as a RuntimeError the API
    turns into a 400 -- not an unhandled ValueError that becomes a 500.
    """
    client = _FakeClient()
    client.get_input_entity = AsyncMock(side_effect=ValueError("cache miss"))
    client.get_input_entity.side_effect = [
        ValueError("cache miss"),  # bare-int cache attempt
        ValueError("not in cache"),  # typed PeerUser attempt
    ]
    client.get_entity = AsyncMock(
        side_effect=ValueError("Could not find the input entity for PeerUser(user_id=8630793717)")
    )

    with pytest.raises(RuntimeError) as exc_info:
        await _resolve("user", None, 8630793717, client=client)

    msg = str(exc_info.value)
    assert "no longer accessible" in msg
    # The original Telethon error must be chained, not swallowed.
    assert isinstance(exc_info.value.__cause__, ValueError)


@pytest.mark.asyncio
async def test_unresolvable_chat_message_is_sanitizer_safe():
    """sanitize_exception passes RuntimeError text straight to the client."""
    from app.utils.sanitize import sanitize_exception

    client = _FakeClient()
    client.get_input_entity = AsyncMock(side_effect=ValueError("cache miss"))
    client.get_input_entity.side_effect = [ValueError("a"), ValueError("b")]
    client.get_entity = AsyncMock(side_effect=ValueError("boom"))

    with pytest.raises(RuntimeError) as exc_info:
        await _resolve("user", None, 8630793717, client=client)

    detail = sanitize_exception(exc_info.value)
    assert detail == str(exc_info.value)
    assert "Traceback" not in detail
    assert "/usr/local/lib" not in detail


def test_classify_chat_uses_group_for_basic_chat_entity():
    """Pin the vocabulary the resolver depends on."""
    from telethon.tl.types import Channel, Chat, User

    class _FakeChat(Chat):
        def __init__(self):  # bypass required-arg construction
            self.photo = None

    assert _classify_chat(_FakeChat()) == "group"
    # Sanity: the other mappings the resolver branches on.
    assert _classify_chat(User(id=1, bot=False)) == "user"
    assert _classify_chat(User(id=2, bot=True)) == "bot"
