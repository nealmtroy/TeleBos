"""Regression coverage for the session-token-in-URL fix (H-4).

A full Better Auth session token used to be accepted as ``?token=...`` so that
``<img>``/``<video>`` tags could authenticate. That leaks the long-lived
session into access logs, browser history and ``Referer`` headers. The query
parameter is now rejected outright; media URLs use a short-lived HMAC token
(``?t=``) instead.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock

from fastapi import HTTPException

from app import dependencies as deps_mod


@pytest.mark.asyncio
async def test_session_token_in_query_is_rejected():
    """A bare session token in the URL must not authenticate."""
    db = MagicMock()
    db.execute = AsyncMock()

    class FakeRequest:
        headers: dict = {}
        cookies: dict = {}

    with pytest.raises(HTTPException) as exc:
        await deps_mod.get_current_user_from_token_or_header(
            request=FakeRequest(),
            token="super-secret-session-token",
            db=db,
        )

    assert exc.value.status_code == 401
    assert "must not be passed in the URL" in exc.value.detail
    # It must be rejected before touching the database.
    db.execute.assert_not_awaited()


@pytest.mark.asyncio
async def test_no_credentials_at_all_is_401():
    db = MagicMock()

    class FakeRequest:
        headers: dict = {}
        cookies: dict = {}

    with pytest.raises(HTTPException) as exc:
        await deps_mod.get_current_user_from_token_or_header(
            request=FakeRequest(),
            token=None,
            db=db,
        )

    assert exc.value.status_code == 401
    assert exc.value.detail == "Not authenticated"


@pytest.mark.asyncio
async def test_header_session_is_still_accepted():
    """The header path is untouched: a session token in the header authenticates."""
    from datetime import datetime, timedelta, timezone
    from uuid import uuid4

    user = MagicMock()
    user.id = uuid4()
    user.is_active = True

    row = MagicMock()
    row.user_id = str(user.id)
    row.expires_at = datetime.now(timezone.utc) + timedelta(days=1)

    session_result = MagicMock()
    session_result.one_or_none.return_value = row

    user_result = MagicMock()
    user_result.scalar_one_or_none.return_value = user

    calls = {"n": 0}

    async def _execute(_stmt, *args, **kwargs):
        calls["n"] += 1
        return session_result if calls["n"] == 1 else user_result

    db = MagicMock()
    db.execute = _execute

    class FakeRequest:
        headers = {"x-better-auth-token": "good-session"}
        cookies: dict = {}

    got = await deps_mod.get_current_user_from_token_or_header(
        request=FakeRequest(),
        token=None,
        db=db,
    )

    assert got is not None


def test_media_token_requires_scoped_account():
    """A media token issued for account A must not validate account B."""
    from app.utils.signed_url import generate_photo_token, parse_photo_token

    token = generate_photo_token("account-aaa", "user-1", expires_in=300)

    assert parse_photo_token(token, "account-aaa") == "user-1"
    assert parse_photo_token(token, "account-bbb") is None


def test_expired_media_token_is_refused():
    from app.utils.signed_url import generate_photo_token, parse_photo_token

    token = generate_photo_token("account-aaa", "user-1", expires_in=-10)

    assert parse_photo_token(token, "account-aaa") is None


def test_tampered_media_token_is_refused():
    from app.utils.signed_url import generate_photo_token, parse_photo_token

    token = generate_photo_token("account-aaa", "user-1", expires_in=300)
    user_id, expiry, sig = token.split(":")
    forged = f"{user_id}:{expiry}:{'0' * len(sig)}"

    assert parse_photo_token(forged, "account-aaa") is None
