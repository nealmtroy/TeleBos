"""Unit tests for exception sanitization utility."""

import pytest
from app.utils.sanitize import sanitize_exception
from telethon.errors import PhoneNumberInvalidError, PhoneNumberBannedError, PhoneNumberFloodError


class DummyUnexpectedError(Exception):
    pass


def test_sanitize_value_error():
    exc = ValueError("Some custom user-facing value error")
    assert sanitize_exception(exc) == "Some custom user-facing value error"


def test_sanitize_runtime_error():
    exc = RuntimeError("Some custom user-facing runtime error")
    assert sanitize_exception(exc) == "Some custom user-facing runtime error"


def test_sanitize_flagged_user_facing():
    class FlaggedError(Exception):
        user_facing = True

    exc = FlaggedError("Custom business rule exception")
    assert sanitize_exception(exc) == "Custom business rule exception"


def test_sanitize_unexpected_error(caplog):
    import logging

    exc = DummyUnexpectedError("leaky info like credentials or path /opt/app")
    with caplog.at_level(logging.ERROR):
        msg = sanitize_exception(exc, context="test_context")

    assert msg == "An unexpected error occurred. Please try again."
    assert "Unhandled exception in API (test_context): DummyUnexpectedError" in caplog.text


def test_sanitize_telegram_errors():
    err1 = PhoneNumberInvalidError(request=None)
    assert sanitize_exception(err1) == "The phone number is invalid"

    err2 = PhoneNumberBannedError(request=None)
    assert sanitize_exception(err2) == "Phone number is banned from Telegram"

    err3 = PhoneNumberFloodError(request=None)
    assert sanitize_exception(err3) == "Too many verification requests for this phone number. Please try again later."
