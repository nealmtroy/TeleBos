"""Frozen-account and flood-wait classification (PYTHON-FASTAPI-11/12)."""

import pytest
from telethon.errors import FloodWaitError, FrozenMethodInvalidError

from app.utils.telegram_errors import classify_telegram_error


def test_frozen_account_is_not_treated_as_flood_wait():
    """FrozenMethodInvalidError subclasses FloodError, not FloodWaitError.

    Without an explicit branch it fell through to the generic fallback, which
    logs the full traceback at error level and tells the user nothing.
    """
    err_type, msg = classify_telegram_error(FrozenMethodInvalidError(request=None))

    assert err_type == "account_frozen"
    assert "frozen" in msg.lower()


def test_flood_wait_still_classified_as_flood():
    flood = FloodWaitError(request=None)
    flood.seconds = 42

    err_type, msg = classify_telegram_error(flood)

    assert err_type == "flood"
    assert "42" in msg


def test_frozen_account_recognised_from_message_text():
    """These often arrive wrapped, where the type is lost."""
    err_type, _ = classify_telegram_error(
        Exception(
            "You tried to use a method that is not available for frozen "
            "accounts (caused by GetScheduledHistoryRequest)"
        )
    )

    assert err_type == "account_frozen"


def test_frozen_error_not_misclassified_before_the_flood_branch():
    """Guards the ordering: the frozen check must precede the FloodWait one."""
    assert not issubclass(FrozenMethodInvalidError, FloodWaitError)


@pytest.mark.parametrize(
    "message",
    [
        "FROZEN_METHOD_INVALID",
        "You tried to use a method that is not available for frozen accounts",
    ],
)
def test_frozen_variants(message: str):
    assert classify_telegram_error(Exception(message))[0] == "account_frozen"
