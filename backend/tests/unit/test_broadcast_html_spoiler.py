"""Telegram HTML rendering for broadcast text, including <tg-spoiler>.

Telethon 1.45's html.parse drops <tg-spoiler> (no entity), so broadcast_service
extracts the spoiler regions itself. Offsets must be UTF-16 code units (Telegram's
unit of measure), which matters whenever an emoji is involved.
"""

from telethon.tl.types import MessageEntityBold, MessageEntityBlockquote, MessageEntitySpoiler

from app.services.broadcast_service import _parse_html_with_spoilers, _u16_len


def _by_type(entities, cls):
    return [e for e in entities if isinstance(e, cls)]


def test_u16_len_counts_supplementary_plane_as_two():
    assert _u16_len("a") == 1
    assert _u16_len("é") == 1
    assert _u16_len("😀") == 2


def test_spoiler_becomes_entity_and_tags_stripped():
    clean, entities = _parse_html_with_spoilers("<b>B</b><tg-spoiler>SECRET</tg-spoiler>")
    assert clean == "BSECRET"
    bold = _by_type(entities, MessageEntityBold)
    spoiler = _by_type(entities, MessageEntitySpoiler)
    assert (bold[0].offset, bold[0].length) == (0, 1)
    assert (spoiler[0].offset, spoiler[0].length) == (1, 6)


def test_spoiler_offset_after_emoji_is_utf16():
    clean, entities = _parse_html_with_spoilers("😀<tg-spoiler>S</tg-spoiler>")
    assert clean == "😀S"
    spoiler = _by_type(entities, MessageEntitySpoiler)
    assert (spoiler[0].offset, spoiler[0].length) == (2, 1)


def test_spoiler_length_includes_emoji():
    clean, entities = _parse_html_with_spoilers("<tg-spoiler>😀S</tg-spoiler>")
    assert clean == "😀S"
    spoiler = _by_type(entities, MessageEntitySpoiler)
    assert (spoiler[0].offset, spoiler[0].length) == (0, 3)


def test_spoiler_nested_in_bold_keeps_both():
    clean, entities = _parse_html_with_spoilers("<b><tg-spoiler>X</tg-spoiler></b>")
    assert clean == "X"
    assert (entities[0].offset, entities[0].length) in ((0, 1),)
    types = {type(e) for e in entities}
    assert MessageEntityBold in types
    assert MessageEntitySpoiler in types


def test_blockquote_still_parsed_with_spoiler_present():
    clean, entities = _parse_html_with_spoilers(
        "<blockquote>Q</blockquote><tg-spoiler>S</tg-spoiler>"
    )
    assert clean == "QS"
    assert _by_type(entities, MessageEntityBlockquote)[0].offset == 0
    assert _by_type(entities, MessageEntitySpoiler)[0].offset == 1


def test_plain_text_has_no_entities():
    clean, entities = _parse_html_with_spoilers("hello world")
    assert clean == "hello world"
    assert entities == []
