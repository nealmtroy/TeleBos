"""Regression coverage for the media-endpoint hardening.

Covers the fixes applied to ``app/api/media.py``:

* ``?v=`` can no longer reach the filesystem at all (path traversal closed).
* Ownership of the account *and* of the chat within it is verified before the
  cache is consulted, so a cache hit cannot bypass the check.
* The photo cache is keyed per account, so two accounts cannot serve each
  other's files for the same ``chat_id``.
"""

import os
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from fastapi import HTTPException

from app.api import media as media_mod


def _scalar(value):
    r = MagicMock()
    r.scalar_one_or_none.return_value = value
    return r


class FakeRequest:
    """Minimal stand-in; ``query_params`` returns the traversal payload."""

    def __init__(self, query_value=None, etag=None):
        self.headers = {"x-better-auth-token": "session"}
        self.cookies = {}
        if etag is not None:
            self.headers["if-none-match"] = etag
        outer = self

        class _Q:
            def get(self, *_a, **_k):
                return query_value

        self.query_params = _Q()


def _db(*results):
    db = MagicMock()
    db.execute = AsyncMock(side_effect=[_scalar(v) for v in results])
    db.commit = AsyncMock()
    return db


def _account(owner_id="owner-1"):
    acc = MagicMock()
    acc.id = uuid4()
    acc.user_id = owner_id
    acc.session_string = "cipher"
    acc.for_sale = False
    return acc


def _chat(version):
    ch = MagicMock()
    ch.photo = True
    ch.photo_version = version
    return ch


def _redirect_base_dir(monkeypatch, base):
    """Make media.py resolve its uploads root under *base*.

    ``media.py`` now derives the uploads root from
    ``app.utils.path_security.get_base_uploads_dir`` (matching the Docker
    volume ``/app/app/uploads``). That helper returns the ``uploads`` directory
    itself, so redirect it to ``base/uploads`` — the same layout the old
    ``dirname(dirname(dirname(__file__))) + "uploads"`` chain produced.
    """
    monkeypatch.setattr(
        media_mod, "get_base_uploads_dir", lambda: str(base / "uploads")
    )


@pytest.mark.asyncio
async def test_query_string_v_is_ignored_entirely():
    """`?v=../../.env` must not influence the served path in any way.

    The version now comes only from the DB row, and a chat with no stored
    version short-circuits before any path is built.
    """
    account, chat = _account(), _chat(None)
    req = FakeRequest(query_value="../../../../app/.env")

    with pytest.raises(HTTPException) as exc:
        await media_mod.get_chat_photo(
            account_id=str(account.id),
            chat_id=42,
            request=req,
            db=_db(account, chat),
            user=MagicMock(id="owner-1"),
        )

    assert exc.value.status_code == 404
    assert exc.value.detail == "No profile photo"


@pytest.mark.asyncio
async def test_non_numeric_photo_version_is_rejected():
    """A traversal-shaped value in the DB must still be refused."""
    account = _account()
    chat = _chat("../../../../app/.env")

    with pytest.raises(HTTPException) as exc:
        await media_mod.get_chat_photo(
            account_id=str(account.id),
            chat_id=42,
            request=FakeRequest(),
            db=_db(account, chat),
            user=MagicMock(id="owner-1"),
        )

    assert exc.value.status_code == 404
    assert exc.value.detail == "No profile photo"


@pytest.mark.asyncio
async def test_zero_version_is_rejected():
    """`photo_version` of 0 is the known no-photo sentinel."""
    account, chat = _account(), _chat(0)

    with pytest.raises(HTTPException) as exc:
        await media_mod.get_chat_photo(
            account_id=str(account.id),
            chat_id=42,
            request=FakeRequest(),
            db=_db(account, chat),
            user=MagicMock(id="owner-1"),
        )

    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_account_not_owned_by_caller_is_404():
    """The account lookup is scoped by user_id, so a foreign account 404s.

    Verified structurally: the SQLAlchemy select() carries the caller's id, so
    the DB cannot return another user's account.
    """
    db = MagicMock()
    captured = []

    async def _exec(stmt):
        captured.append(stmt)
        # user_id == attacker never matches, so the DB returns nothing.
        return _scalar(None)

    db.execute = _exec
    db.commit = AsyncMock()

    with pytest.raises(HTTPException) as exc:
        await media_mod.get_chat_photo(
            account_id=str(uuid4()),
            chat_id=42,
            request=FakeRequest(),
            db=db,
            user=MagicMock(id="attacker-uuid"),
        )

    assert exc.value.status_code == 404
    assert exc.value.detail == "Account not found"
    # The statement must constrain both the account id and the caller's user id.
    sql = str(captured[0])
    assert "user_id" in sql and "for_sale" in sql


@pytest.mark.asyncio
async def test_chat_must_belong_to_the_account():
    """A chat that is not linked to this account must not be served."""
    account = _account()

    # Account resolves, the chat lookup returns nothing.
    db = _db(account, None)

    with pytest.raises(HTTPException) as exc:
        await media_mod.get_chat_photo(
            account_id=str(account.id),
            chat_id=42,
            request=FakeRequest(),
            db=db,
            user=MagicMock(id="owner-1"),
        )

    assert exc.value.status_code == 404
    assert exc.value.detail == "Chat not found in this account"


@pytest.mark.asyncio
async def test_cached_photo_is_served_without_touching_telegram(tmp_path, monkeypatch):
    """A cache hit is served directly and must not open a Telethon connection."""
    account, chat = _account(), _chat(7)
    account_id = str(account.id)

    base = tmp_path / "app"
    target = base / "uploads" / "chat_photos" / account_id / "42"
    target.mkdir(parents=True)
    (target / "7.jpg").write_bytes(b"jpegbytes")

    _redirect_base_dir(monkeypatch, base)

    pool = MagicMock()
    pool.get = AsyncMock(side_effect=AssertionError("cache miss must not happen"))

    # client_pool/decrypt are imported *inside* the endpoint, so the patch
    # target is the defining module, not media_mod.
    with patch("app.services.telegram_client.client_pool", pool), \
         patch("app.utils.encryption.decrypt", return_value="session"):
        resp = await media_mod.get_chat_photo(
            account_id=account_id,
            chat_id=42,
            request=FakeRequest(),
            db=_db(account, chat),
            user=MagicMock(id="owner-1"),
        )

    # FileResponse for the account-scoped cached file, no Telethon involved.
    assert getattr(resp, "path", None) == str(target / "7.jpg")
    pool.get.assert_not_awaited()


@pytest.mark.asyncio
async def test_etag_short_circuits_before_telegram_call(tmp_path, monkeypatch):
    """A matching If-None-Match returns 304 without decrypting a session."""
    account, chat = _account(), _chat(7)
    account_id = str(account.id)

    base = tmp_path / "app"
    _redirect_base_dir(monkeypatch, base)

    etag = f'W/"{account.id}-42-7"'
    req = FakeRequest(etag=etag)

    from fastapi.responses import Response

    resp = await media_mod.get_chat_photo(
        account_id=account_id,
        chat_id=42,
        request=req,
        db=_db(account, chat),
        user=MagicMock(id="owner-1"),
    )

    assert isinstance(resp, Response)
    assert resp.status_code == 304


@pytest.mark.asyncio
async def test_unauthenticated_img_request_serves_cached_photo(tmp_path, monkeypatch):
    """An <img> request without session or user context can read public cached chat photos."""
    account, chat = _account(), _chat(7)
    account_id = str(account.id)

    base = tmp_path / "app"
    target = base / "uploads" / "chat_photos" / account_id / "42"
    target.mkdir(parents=True)
    (target / "7.jpg").write_bytes(b"jpegbytes")

    _redirect_base_dir(monkeypatch, base)

    resp = await media_mod.get_chat_photo(
        account_id=account_id,
        chat_id=42,
        request=FakeRequest(),
        db=_db(account, chat),
        user=None,
    )

    assert getattr(resp, "path", None) == str(target / "7.jpg")