"""Uploading a profile photo must not re-download it back from Telegram.

The bytes handed to ``upload_photo`` are the ones just pushed to Telegram, so
the local cache is written from them directly.
"""

import io
import os
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from PIL import Image

from app.services import account_service
from app.utils import photo_helper


def _jpeg_bytes(size=(64, 64), color=(200, 30, 30)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, format="JPEG")
    return buf.getvalue()


def _account():
    account = MagicMock()
    account.id = uuid4()
    account.session_string = "encrypted"
    account.profile_photo_path = None
    account.profile_photo_id = None
    account.photo_version = 0
    return account


def _client():
    client = MagicMock()
    client.upload_file = AsyncMock(return_value=MagicMock())
    me = MagicMock()
    me.photo.photo_id = 555
    client.get_me = AsyncMock(return_value=me)
    # Any call to this would mean the redundant MTProto download came back.
    client.download_profile_photo = AsyncMock(
        side_effect=AssertionError("profile photo must not be re-downloaded")
    )
    # client(...) is the UploadProfilePhotoRequest round trip — must be awaitable.
    client.side_effect = lambda *a, **kw: AsyncMock(return_value=MagicMock())()
    return client


@pytest.fixture
def cached_dir(tmp_path, monkeypatch):
    # The real directory lives in photo_helper; account_service resolves paths
    # through it, so pointing it at tmp_path redirects every write.
    monkeypatch.setattr(photo_helper, "_PHOTO_DIR", str(tmp_path))
    return tmp_path


@pytest.mark.asyncio
async def test_upload_caches_local_bytes_without_downloading(cached_dir):
    account = _account()
    client = _client()
    db = MagicMock()
    db.flush = AsyncMock()
    photo_bytes = _jpeg_bytes()

    pool = MagicMock()
    pool.get = AsyncMock(return_value=client)

    with patch.object(account_service, "client_pool", pool), \
         patch.object(account_service, "_ensure_photo_dir", lambda: None), \
         patch.object(account_service, "_photo_path", lambda aid: str(cached_dir / f"{aid}.jpg")):
        await account_service.upload_photo(db, account, photo_bytes)

    client.download_profile_photo.assert_not_called()
    assert account.photo_version == 1
    assert account.profile_photo_id == 555
    # Relative filename stored, never the absolute path.
    assert account.profile_photo_path == f"{account.id}.jpg"
    assert os.path.exists(cached_dir / f"{account.id}.jpg")


@pytest.mark.asyncio
async def test_upload_normalizes_dimensions(cached_dir):
    """Cached bytes go through the same resize as every other write path."""
    account = _account()
    client = _client()
    db = MagicMock()
    db.flush = AsyncMock()

    pool = MagicMock()
    pool.get = AsyncMock(return_value=client)

    with patch.object(account_service, "client_pool", pool), \
         patch.object(account_service, "_ensure_photo_dir", lambda: None), \
         patch.object(account_service, "_photo_path", lambda aid: str(cached_dir / f"{aid}.jpg")):
        # Non-square input, so a resize/crop must have happened.
        await account_service.upload_photo(db, account, _jpeg_bytes(size=(800, 400)))

    written = (cached_dir / f"{account.id}.jpg").read_bytes()
    with Image.open(io.BytesIO(written)) as img:
        assert img.size == (320, 320)


@pytest.mark.asyncio
async def test_store_cached_photo_falls_back_when_resize_fails(cached_dir):
    """A corrupt/undecodable image still gets cached rather than 500-ing."""
    account = _account()

    with patch.object(account_service, "_ensure_photo_dir", lambda: None), \
         patch.object(account_service, "_photo_path", lambda aid: str(cached_dir / f"{aid}.jpg")):
        await account_service.store_cached_photo(account, b"not-an-image")

    assert account.profile_photo_path == f"{account.id}.jpg"
    assert os.path.exists(cached_dir / f"{account.id}.jpg")


@pytest.mark.asyncio
async def test_upload_removes_temp_file(cached_dir):
    account = _account()
    client = _client()
    db = MagicMock()
    db.flush = AsyncMock()
    seen = {}

    pool = MagicMock()

    async def _get(_id, _sess):
        return client

    async def _upload(path):
        seen["path"] = path
        return MagicMock()

    client.upload_file = _upload
    pool.get = _get

    with patch.object(account_service, "client_pool", pool), \
         patch.object(account_service, "_ensure_photo_dir", lambda: None), \
         patch.object(account_service, "_photo_path", lambda aid: str(cached_dir / f"{aid}.jpg")):
        await account_service.upload_photo(db, account, _jpeg_bytes())

    assert seen["path"] and not os.path.exists(seen["path"])