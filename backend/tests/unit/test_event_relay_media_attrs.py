"""Regression tests for PYTHON-FASTAPI-2: 'NoneType' object is not iterable.

Telethon models ``Document.thumbs``, ``Document.attributes`` and ``Photo.sizes``
as optional and defaults them to ``None``. ``getattr(obj, "thumbs", [])`` returns
``None`` in that case -- the ``[]`` default only applies when the attribute is
*absent*, not when it is present-and-null -- so iterating the result raises
``TypeError: 'NoneType' object is not iterable``.

This crashed the websocket event relay for every video/document message that
carried no thumbnail, aborting the update before it reached subscribers.

These tests drive the real ``TelegramEventRelay._on_new_message`` handler and
assert that the broadcast payload is still published.
"""

import datetime
import types
from unittest.mock import AsyncMock, patch

import pytest
from telethon.tl.types import (
    Document,
    DocumentAttributeFilename,
    MessageMediaDocument,
    MessageMediaPhoto,
    Photo,
)

from app.services.event_relay import TelegramEventRelay

ACCOUNT_ID = "6eec69a4-0fac-4e10-be9f-f385b2186027"


def _document(*, thumbs=None, attributes=None, mime_type="video/mp4"):
    return Document(
        id=1,
        access_hash=2,
        file_reference=b"x" * 16,
        date=datetime.datetime.now(),
        mime_type=mime_type,
        size=10,
        thumbs=thumbs,
        video_thumbs=None,
        dc_id=2,
        attributes=attributes,
    )


def _photo(*, sizes=None):
    return Photo(
        id=1,
        access_hash=2,
        file_reference=b"x" * 16,
        date=datetime.datetime.now(),
        dc_id=2,
        sizes=sizes,
    )


def _message(media):
    return types.SimpleNamespace(
        media=media,
        id=99,
        text="",
        out=False,
        date=datetime.datetime.now(),
    )


async def _run_relay(media):
    """Drive the real handler; return the payload it broadcast, or None."""
    relay = TelegramEventRelay()
    relay._handlers[ACCOUNT_ID] = [lambda *a, **k: None]
    relay._tg_id_map[ACCOUNT_ID] = 111

    sender = types.SimpleNamespace(
        id=222, first_name="Ada", username="ada", bot=False, is_self=False
    )
    chat = types.SimpleNamespace(id=222, title=None, first_name="Ada")

    event = types.SimpleNamespace(
        is_private=True,
        message=_message(media),
        get_chat=AsyncMock(return_value=chat),
        get_sender=AsyncMock(return_value=sender),
    )

    manager = types.SimpleNamespace(broadcast=AsyncMock())

    with (
        patch("app.services.event_relay.manager", manager),
        patch("app.utils.redis_dispatcher.publish_ws_event", AsyncMock()),
    ):
        await relay._on_new_message(ACCOUNT_ID, event)

    if manager.broadcast.await_count == 0:
        return None
    return manager.broadcast.await_args.args[1]


@pytest.mark.asyncio
async def test_document_with_null_thumbs_does_not_crash_relay():
    """The exact production crash: a video document with thumbs=None."""
    media = MessageMediaDocument(
        document=_document(thumbs=None, attributes=[DocumentAttributeFilename("clip.mp4")])
    )
    payload = await _run_relay(media)
    assert payload is not None
    assert payload["media_filename"] == "clip.mp4"
    assert payload["media_type"] == "video"
    assert payload["stripped_thumb"] is None


@pytest.mark.asyncio
async def test_document_with_null_attributes_does_not_crash_relay():
    """A document whose attributes flag is null must not break the relay."""
    media = MessageMediaDocument(document=_document(thumbs=None, attributes=None))
    payload = await _run_relay(media)
    assert payload is not None
    assert payload["media_filename"] is None


@pytest.mark.asyncio
async def test_photo_with_null_sizes_does_not_crash_relay():
    """A photo whose sizes flag is null must not break the relay."""
    media = MessageMediaPhoto(photo=_photo(sizes=None))
    payload = await _run_relay(media)
    assert payload is not None
    assert payload["media_type"] == "photo"
    assert payload["stripped_thumb"] is None


@pytest.mark.asyncio
async def test_voice_with_null_attributes_does_not_crash_relay():
    """Voice-note metadata lookup hits the same unguarded attribute loop."""
    media = MessageMediaDocument(
        document=_document(thumbs=None, attributes=None, mime_type="audio/ogg")
    )
    payload = await _run_relay(media)
    assert payload is not None
    assert payload["media_type"] == "voice"


@pytest.mark.asyncio
async def test_unguarded_variant_would_have_raised():
    """Pin the exact semantics that made this bug possible.

    getattr's default applies only to *absent* attributes, so a present-but-null
    field still yields None. The ``or []`` guard is what actually protects us.
    """
    doc = _document(thumbs=None, attributes=None)
    assert getattr(doc, "thumbs", []) is None
    assert getattr(doc, "attributes", []) is None
    with pytest.raises(TypeError, match="'NoneType' object is not iterable"):
        for _ in getattr(doc, "thumbs", []):
            pass
    # The guard makes the same expression safe.
    assert (getattr(doc, "thumbs", []) or []) == []
