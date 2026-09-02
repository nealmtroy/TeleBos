"""Unit tests for media cache cleanup and retention utility."""

import os
import time
import tempfile
from pathlib import Path
import pytest

from app.utils.media_cleanup import cleanup_old_message_media


def test_cleanup_old_message_media_prunes_stale_files():
    """Verify that cleanup_old_message_media removes files older than max_age_seconds."""
    with tempfile.TemporaryDirectory() as temp_dir:
        chat_dir = os.path.join(temp_dir, "uploads", "message_media", "12345")
        os.makedirs(chat_dir, exist_ok=True)

        # File 1: Stale file (3 days old)
        stale_file = os.path.join(chat_dir, "101.jpg")
        with open(stale_file, "wb") as f:
            f.write(b"old image bytes" * 100)
        old_mtime = time.time() - (86400 * 3)
        os.utime(stale_file, (old_mtime, old_mtime))

        # File 2: Fresh file (1 hour old)
        fresh_file = os.path.join(chat_dir, "102.jpg")
        with open(fresh_file, "wb") as f:
            f.write(b"new image bytes" * 100)

        # Run cleanup with 48h limit
        result = cleanup_old_message_media(base_dir=temp_dir, max_age_seconds=86400 * 2)

        assert result["deleted_files"] == 1
        assert not os.path.exists(stale_file)
        assert os.path.exists(fresh_file)


def test_cleanup_old_message_media_removes_empty_directories():
    """Verify that empty chat subdirectories are removed after files are pruned."""
    with tempfile.TemporaryDirectory() as temp_dir:
        chat_dir = os.path.join(temp_dir, "uploads", "message_media", "99999")
        os.makedirs(chat_dir, exist_ok=True)

        stale_file = os.path.join(chat_dir, "201.jpg")
        with open(stale_file, "wb") as f:
            f.write(b"old bytes")
        old_mtime = time.time() - (86400 * 5)
        os.utime(stale_file, (old_mtime, old_mtime))

        cleanup_old_message_media(base_dir=temp_dir, max_age_seconds=86400)

        assert not os.path.exists(stale_file)
        # Empty chat subdirectory should have been removed
        assert not os.path.exists(chat_dir)
