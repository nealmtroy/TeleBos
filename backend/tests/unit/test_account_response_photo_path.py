"""AccountResponse must expose a portable photo path, never an absolute one."""

from datetime import datetime, timezone
from uuid import uuid4

import pytest

from app.schemas.account import AccountResponse
from app.utils import photo_helper


def _payload(account_id, profile_photo_path):
    now = datetime.now(timezone.utc)
    return {
        "id": account_id,
        "phone": "+628123456789",
        "first_name": "Test",
        "last_name": None,
        "username": None,
        "bio": None,
        "profile_photo_path": profile_photo_path,
        "last_sync_at": None,
        "created_at": now,
        "phone_verified": True,
        "twofa_enabled": False,
        "is_active": True,
    }


def _with_cached_file(tmp_path, monkeypatch, account_id):
    monkeypatch.setattr(photo_helper, "_PHOTO_DIR", str(tmp_path))
    photo_helper.ensure_photo_dir()
    open(photo_helper.get_photo_path(account_id), "wb").close()


def test_reports_relative_filename_when_cached(tmp_path, monkeypatch):
    account_id = uuid4()
    _with_cached_file(tmp_path, monkeypatch, str(account_id))

    resp = AccountResponse(**_payload(account_id, f"{account_id}.jpg"))

    assert resp.profile_photo_path == f"{account_id}.jpg"
    assert "/" not in resp.profile_photo_path
    assert "\\" not in resp.profile_photo_path


def test_normalizes_legacy_absolute_path(tmp_path, monkeypatch):
    """A pre-migration absolute row is reported as its portable filename."""
    account_id = uuid4()
    _with_cached_file(tmp_path, monkeypatch, str(account_id))

    legacy = f"D:\\PROJECT\\TeleBos\\backend\\uploads\\profile_photos\\{account_id}.jpg"
    resp = AccountResponse(**_payload(account_id, legacy))

    assert resp.profile_photo_path == f"{account_id}.jpg"


def test_nulls_path_when_file_is_missing(tmp_path, monkeypatch):
    """Stale path (e.g. after a host migration) becomes the no-photo state."""
    account_id = uuid4()
    monkeypatch.setattr(photo_helper, "_PHOTO_DIR", str(tmp_path))

    resp = AccountResponse(**_payload(account_id, f"{account_id}.jpg"))

    assert resp.profile_photo_path is None


@pytest.mark.parametrize("stored", [None, ""])
def test_nulls_empty_path(tmp_path, monkeypatch, stored):
    account_id = uuid4()
    monkeypatch.setattr(photo_helper, "_PHOTO_DIR", str(tmp_path))

    resp = AccountResponse(**_payload(account_id, stored))

    assert resp.profile_photo_path is None


def test_rejects_another_accounts_filename(tmp_path, monkeypatch):
    account_id = uuid4()
    other_id = uuid4()
    _with_cached_file(tmp_path, monkeypatch, str(other_id))

    resp = AccountResponse(**_payload(account_id, f"{other_id}.jpg"))

    assert resp.profile_photo_path is None