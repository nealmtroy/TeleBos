"""Regression: login must store profile_photo_id as the integer Telegram id.

`telegram_accounts.profile_photo_id` is a BIGINT column. Coercing the id to a
string made asyncpg reject the INSERT on `verify-code` with
"invalid input for query argument ... 'str' object cannot be interpreted as an
integer" — a 500 for any account that has a profile photo.
"""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


@pytest.mark.asyncio
async def test_finalize_login_keeps_profile_photo_id_int():
    from app.services import account_service

    me = SimpleNamespace(
        id=8180113705,
        phone="6282396757497",
        first_name="Bby",
        last_name=None,
        username=None,
        premium=False,
        photo=SimpleNamespace(photo_id=6237576438890566729),
    )

    session = MagicMock()
    session.save.return_value = "session"
    client = MagicMock()
    client.session = session
    client.get_me = AsyncMock(return_value=me)

    with patch(
        "app.services.account_service.get_live_2fa_status", AsyncMock(return_value=None)
    ), patch("app.services.account_service.encrypt", lambda s: s):
        account, _, _ = await account_service.finalize_authenticated_login(
            client, "6282396757497", db=None, user=None
        )

    assert account.profile_photo_id == 6237576438890566729
    assert isinstance(account.profile_photo_id, int)
