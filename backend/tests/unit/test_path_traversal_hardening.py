"""Comprehensive unit tests for Path Traversal vulnerability hardening.

Covers:
- `app.utils.path_security` (validate_safe_id, sanitize_filename, safe_join, is_path_contained)
- `app.utils.photo_helper` (safe_join integration, strict ID validation)
- `app.api.media` (create_safe_file_response containment, sanitized Telegram filenames)
- `app.api.accounts` (rejection of malicious traversal account IDs)
"""

import os
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from fastapi import HTTPException
from app.utils.path_security import (
    validate_safe_id,
    sanitize_filename,
    safe_join,
    is_path_contained,
)
from app.utils import photo_helper


# ==============================================================================
# 1. Tests for validate_safe_id
# ==============================================================================

def test_validate_safe_id_accepts_valid():
    assert validate_safe_id("acc-1") == "acc-1"
    assert validate_safe_id("acc_123") == "acc_123"
    valid_uuid = str(uuid4())
    assert validate_safe_id(valid_uuid) == valid_uuid


@pytest.mark.parametrize(
    "payload",
    [
        "../../etc/passwd",
        "..\\..\\windows\\system32",
        "/etc/passwd",
        "\\etc\\passwd",
        "acc;rm -rf /",
        "acc 1",
        "acc\0null",
        "acc\nnewline",
        "acc.jpg",
        "",
        "a" * 65,  # exceeds max length
    ],
)
def test_validate_safe_id_rejects_malicious(payload):
    with pytest.raises(ValueError):
        validate_safe_id(payload)


# ==============================================================================
# 2. Tests for sanitize_filename
# ==============================================================================

def test_sanitize_filename_normal():
    assert sanitize_filename("photo.jpg") == "photo.jpg"
    assert sanitize_filename("document-123.pdf") == "document-123.pdf"


@pytest.mark.parametrize(
    "untrusted, expected",
    [
        ("../../etc/passwd", "passwd"),
        ("..\\..\\windows\\system32\\config.sys", "config.sys"),
        ("/var/log/syslog", "syslog"),
        ("C:\\Users\\admin\\secret.txt", "secret.txt"),
        ("evil\0file.jpg", "evilfile.jpg"),
        ('bad"name".png', "badname.png"),
        ("line\r\nbreak.txt", "linebreak.txt"),
        (".", "file"),
        ("..", "file"),
        (None, "file"),
        ("", "file"),
    ],
)
def test_sanitize_filename_strips_traversal(untrusted, expected):
    result = sanitize_filename(untrusted)
    assert result == expected
    assert "/" not in result
    assert "\\" not in result
    assert ".." not in result


# ==============================================================================
# 3. Tests for safe_join & is_path_contained
# ==============================================================================

def test_safe_join_valid(tmp_path):
    base = str(tmp_path)
    res = safe_join(base, "subfolder", "file.txt")
    assert res == os.path.realpath(os.path.join(base, "subfolder", "file.txt"))
    assert is_path_contained(base, res) is True


@pytest.mark.parametrize(
    "payload",
    [
        "../../etc/passwd",
        "..\\..\\windows\\system32",
        "sub/../../outside.txt",
        "/absolute/path",
        "C:\\Windows\\System32",
    ],
)
def test_safe_join_detects_traversal(tmp_path, payload):
    base = str(tmp_path)
    with pytest.raises(ValueError) as exc:
        safe_join(base, payload)
    assert "Path traversal" in str(exc.value) or "Absolute" in str(exc.value)
    assert is_path_contained(base, os.path.join(base, payload)) is False


def test_safe_join_rejects_null_byte(tmp_path):
    base = str(tmp_path)
    with pytest.raises(ValueError) as exc:
        safe_join(base, "foo\x00bar")
    assert "Null byte" in str(exc.value)


# ==============================================================================
# 4. Tests for photo_helper
# ==============================================================================

def test_photo_helper_rejects_traversal_ids(tmp_path, monkeypatch):
    monkeypatch.setattr(photo_helper, "_PHOTO_DIR", str(tmp_path))
    with pytest.raises(ValueError):
        photo_helper.get_photo_path("../../etc/passwd")

    with pytest.raises(ValueError):
        photo_helper.get_photo_filename("../evil")

    assert photo_helper.is_valid_photo_path("../../etc/passwd", "evil.jpg") is False


# ==============================================================================
# 5. Tests for media.py create_safe_file_response containment check
# ==============================================================================

def test_create_safe_file_response_enforces_allowed_root(tmp_path):
    from app.api.media import create_safe_file_response

    allowed_dir = tmp_path / "allowed"
    allowed_dir.mkdir()
    safe_file = allowed_dir / "safe.jpg"
    safe_file.write_bytes(b"content")

    forbidden_dir = tmp_path / "secret"
    forbidden_dir.mkdir()
    secret_file = forbidden_dir / "secret.env"
    secret_file.write_bytes(b"SECRET=123")

    # Allowed file must succeed
    resp = create_safe_file_response(str(safe_file), allowed_root=str(allowed_dir))
    assert getattr(resp, "path", None) == str(safe_file)

    # File outside allowed_root must be rejected with 403 Forbidden
    with pytest.raises(HTTPException) as exc:
        create_safe_file_response(str(secret_file), allowed_root=str(allowed_dir))
    assert exc.value.status_code == 403
    assert exc.value.detail == "Access denied"


# ==============================================================================
# 6. Tests for media.py endpoint parameter validation
# ==============================================================================

@pytest.mark.asyncio
async def test_get_chat_photo_rejects_traversal_account_id():
    from app.api.media import get_chat_photo

    req = MagicMock()
    db = MagicMock()
    user = MagicMock(id="user-1")

    with pytest.raises(HTTPException) as exc:
        await get_chat_photo(
            account_id="../../etc/passwd",
            chat_id=123,
            request=req,
            db=db,
            user=user,
        )
    assert exc.value.status_code == 400
    assert "Invalid account ID" in exc.value.detail


@pytest.mark.asyncio
async def test_get_message_media_rejects_traversal_account_id():
    from app.api.media import get_message_media_endpoint

    db = MagicMock()
    user = MagicMock(id="user-1")

    with pytest.raises(HTTPException) as exc:
        await get_message_media_endpoint(
            account_id="../..\\evil",
            chat_id=123,
            message_id=456,
            db=db,
            user=user,
        )
    assert exc.value.status_code == 400
    assert "Invalid account ID" in exc.value.detail


@pytest.mark.asyncio
async def test_stream_message_video_rejects_traversal_account_id():
    from app.api.media import stream_message_video_endpoint

    req = MagicMock()
    db = MagicMock()
    user = MagicMock(id="user-1")

    with pytest.raises(HTTPException) as exc:
        await stream_message_video_endpoint(
            request=req,
            account_id="..%2f..%2fevil",
            chat_id=123,
            message_id=456,
            db=db,
            user=user,
        )
    assert exc.value.status_code == 400
    assert "Invalid account ID" in exc.value.detail


@pytest.mark.asyncio
async def test_get_profile_photo_rejects_traversal_account_id():
    from app.api.accounts import get_profile_photo

    req = MagicMock()
    db = MagicMock()

    with pytest.raises(HTTPException) as exc:
        await get_profile_photo(
            request=req,
            account_id="../../etc/passwd",
            db=db,
        )
    assert exc.value.status_code == 400
    assert "Invalid account ID" in exc.value.detail
