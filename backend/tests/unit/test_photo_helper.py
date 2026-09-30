"""Profile photo path helpers — portable filenames, not absolute OS paths."""

import os

import pytest

from app.utils import photo_helper


def test_get_photo_filename_is_relative(tmp_path, monkeypatch):
    monkeypatch.setattr(photo_helper, "_PHOTO_DIR", str(tmp_path))
    name = photo_helper.get_photo_filename("acc-1")
    assert name == "acc-1.jpg"
    assert not os.path.isabs(name)


def test_get_photo_path_uses_current_dir(tmp_path, monkeypatch):
    """The real path is recomputed from _PHOTO_DIR, never read from the DB."""
    monkeypatch.setattr(photo_helper, "_PHOTO_DIR", str(tmp_path))
    assert photo_helper.get_photo_path("acc-1") == os.path.join(str(tmp_path), "acc-1.jpg")


def test_is_valid_accepts_relative_filename(tmp_path, monkeypatch):
    monkeypatch.setattr(photo_helper, "_PHOTO_DIR", str(tmp_path))
    photo_helper.ensure_photo_dir()
    open(photo_helper.get_photo_path("acc-1"), "wb").close()

    assert photo_helper.is_valid_photo_path("acc-1", "acc-1.jpg") is True


@pytest.mark.parametrize(
    "stored",
    [
        "D:\\PROJECT\\TeleBos\\backend\\uploads\\profile_photos\\acc-1.jpg",  # legacy Windows
        "/app/uploads/profile_photos/acc-1.jpg",                             # legacy container
    ],
)
def test_is_valid_accepts_legacy_absolute_paths(tmp_path, monkeypatch, stored):
    """Rows written before the change keep validating instead of being dropped."""
    monkeypatch.setattr(photo_helper, "_PHOTO_DIR", str(tmp_path))
    photo_helper.ensure_photo_dir()
    open(photo_helper.get_photo_path("acc-1"), "wb").close()

    assert photo_helper.is_valid_photo_path("acc-1", stored) is True


def test_is_valid_rejects_missing_file(tmp_path, monkeypatch):
    monkeypatch.setattr(photo_helper, "_PHOTO_DIR", str(tmp_path))
    assert photo_helper.is_valid_photo_path("acc-1", "acc-1.jpg") is False


def test_is_valid_rejects_other_accounts_file(tmp_path, monkeypatch):
    """A cached name for a different account must not mark this one as having a photo."""
    monkeypatch.setattr(photo_helper, "_PHOTO_DIR", str(tmp_path))
    photo_helper.ensure_photo_dir()
    open(photo_helper.get_photo_path("acc-2"), "wb").close()

    assert photo_helper.is_valid_photo_path("acc-1", "acc-2.jpg") is False


def test_is_valid_rejects_empty(tmp_path, monkeypatch):
    monkeypatch.setattr(photo_helper, "_PHOTO_DIR", str(tmp_path))
    assert photo_helper.is_valid_photo_path("acc-1", None) is False
    assert photo_helper.is_valid_photo_path("acc-1", "") is False