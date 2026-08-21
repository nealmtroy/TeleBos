"""Contract tests for errors surfaced by broadcast and invite flows."""

import pytest

from app.utils.telegram_errors import classify_telegram_error


class TelegramRpcTextError(Exception):
    """Minimal error that exercises the classifier's RPC-text fallback."""


@pytest.mark.parametrize(
    ("message", "expected"),
    [
        ("FLOOD_WAIT_42", ("flood", "Flood wait: 42 seconds")),
        (
            "USER_PRIVACY_RESTRICTED",
            ("privacy_restricted", "User's privacy settings prevent adding them"),
        ),
        ("PEER_FLOOD", ("peer_flood", "Too many requests — PeerFlood")),
        ("no user has foo as username", ("invalid_link", "Invite link is expired or invalid")),
    ],
)
def test_classifies_common_telegram_rpc_text_errors(message, expected):
    assert classify_telegram_error(TelegramRpcTextError(message)) == expected


def test_unknown_error_keeps_a_safe_truncated_message():
    message = "x" * 600

    error_type, detail = classify_telegram_error(TelegramRpcTextError(message))

    assert error_type == "unknown"
    assert detail == message[:500]


def test_classifies_phone_number_errors():
    from telethon.errors import PhoneNumberInvalidError, PhoneNumberFloodError

    err_type, msg = classify_telegram_error(PhoneNumberInvalidError(request=None))
    assert err_type == "phone_invalid"
    assert msg == "The phone number is invalid"

    err_type, msg = classify_telegram_error(PhoneNumberFloodError(request=None))
    assert err_type == "phone_flood"
    assert msg == "Too many verification requests for this phone number. Please try again later."


def test_classifies_phone_number_fallback_errors():
    err_type, msg = classify_telegram_error(TelegramRpcTextError("PHONE_NUMBER_INVALID"))
    assert err_type == "phone_invalid"
    assert msg == "The phone number is invalid"

    err_type, msg = classify_telegram_error(TelegramRpcTextError("PHONE_NUMBER_BANNED"))
    assert err_type == "phone_banned"
    assert msg == "Phone number is banned from Telegram"

    err_type, msg = classify_telegram_error(TelegramRpcTextError("PHONE_NUMBER_FLOOD"))
    assert err_type == "phone_flood"
    assert msg == "Too many verification requests for this phone number. Please try again later."
