"""Unit tests verifying multilingual button matching and keywords in SpamBot appeal flow."""

from types import SimpleNamespace
from unittest.mock import MagicMock
import pytest

from app.services.appeal_service import (
    find_dispute_mistake_button,
    find_affirmative_yes_button,
    find_denial_never_button,
    find_done_button,
)
from app.utils.spambot_helper import (
    is_appeal_submitted,
    is_appeal_flow_active,
)


def make_msg_with_buttons(button_texts: list[str]) -> SimpleNamespace:
    """Helper to mock a message with buttons in individual rows."""
    buttons = [[SimpleNamespace(text=txt)] for txt in button_texts]
    return SimpleNamespace(buttons=buttons)


def test_find_dispute_mistake_button_malay():
    """Verify Malay SpamBot initial response correctly picks 'Ini adalah satu kesilapan' without confession."""
    msg = make_msg_with_buttons([
        "OK",
        "Apa itu spam?",
        "Saya tersilap, tolong bebaskan saya",
        "Ini adalah satu kesilapan",
    ])
    btn = find_dispute_mistake_button(msg)
    assert btn is not None
    assert btn.text == "Ini adalah satu kesilapan"


def test_find_dispute_mistake_button_indonesian():
    """Verify Indonesian SpamBot response correctly picks 'Ini adalah kesalahan'."""
    msg = make_msg_with_buttons([
        "OK",
        "Apa itu spam?",
        "Saya salah, mohon bebaskan saya",
        "Ini adalah kesalahan",
    ])
    btn = find_dispute_mistake_button(msg)
    assert btn is not None
    assert btn.text == "Ini adalah kesalahan"


def test_find_dispute_mistake_button_english():
    """Verify English SpamBot response correctly picks 'This is a mistake'."""
    msg = make_msg_with_buttons([
        "OK",
        "What is spam?",
        "I was wrong, please release me",
        "This is a mistake",
    ])
    btn = find_dispute_mistake_button(msg)
    assert btn is not None
    assert btn.text == "This is a mistake"


def test_find_dispute_mistake_button_russian():
    """Verify Russian SpamBot response correctly picks 'Это ошибка'."""
    msg = make_msg_with_buttons([
        "ОК",
        "Что такое спам?",
        "Я был не прав",
        "Это ошибка",
    ])
    btn = find_dispute_mistake_button(msg)
    assert btn is not None
    assert btn.text == "Это ошибка"


def test_find_dispute_mistake_button_positional_fallback():
    """Verify fallback selects the last button if unrecognized language follows standard 4-button layout."""
    msg = make_msg_with_buttons([
        "OK",
        "FAQ",
        "I admitted guilt",
        "Dispute Restriction (Unknown Lang)",
    ])
    btn = find_dispute_mistake_button(msg)
    assert btn is not None
    assert btn.text == "Dispute Restriction (Unknown Lang)"


def test_find_affirmative_yes_button():
    """Verify affirmative button selection and avoid substring collisions."""
    # Malay / Indonesian
    msg_my = make_msg_with_buttons(["Ya", "Tidak"])
    assert find_affirmative_yes_button(msg_my).text == "Ya"

    # English
    msg_en = make_msg_with_buttons(["Yes", "No"])
    assert find_affirmative_yes_button(msg_en).text == "Yes"

    # Negative words should not match
    msg_neg = make_msg_with_buttons(["Tidak", "Batal"])
    assert find_affirmative_yes_button(msg_neg) is None


def test_find_denial_never_button_multilingual():
    """Verify denial of spam behavior picks correct denial and never confession."""
    # Malay
    msg_my = make_msg_with_buttons([
        "Tidak! Tak pernah lakukan!",
        "Sebenarnya… saya melakukannya.",
    ])
    btn_my = find_denial_never_button(msg_my)
    assert btn_my is not None
    assert btn_my.text == "Tidak! Tak pernah lakukan!"

    # Indonesian
    msg_id = make_msg_with_buttons([
        "Tidak! Tidak pernah!",
        "Sebenarnya… saya melakukannya.",
    ])
    btn_id = find_denial_never_button(msg_id)
    assert btn_id is not None
    assert btn_id.text == "Tidak! Tidak pernah!"

    # English
    msg_en = make_msg_with_buttons([
        "No! Never did that!",
        "Actually, I did it",
    ])
    btn_en = find_denial_never_button(msg_en)
    assert btn_en is not None
    assert btn_en.text == "No! Never did that!"


def test_find_done_button_multilingual():
    """Verify Done button matches across languages."""
    assert find_done_button(make_msg_with_buttons(["Selesai"])).text == "Selesai"
    assert find_done_button(make_msg_with_buttons(["Done"])).text == "Done"
    assert find_done_button(make_msg_with_buttons(["Готово"])).text == "Готово"


def test_spambot_helper_malay_keywords():
    """Verify Malay appeal phrases match submitted and active status."""
    submitted_sample = "Terima kasih, aduan anda telah dihantar kepada penyelia."
    assert is_appeal_submitted(submitted_sample) is True

    flow_active_sample = "Adakah anda ingin membuat aduan kepada moderator?"
    assert is_appeal_flow_active(flow_active_sample) is True
