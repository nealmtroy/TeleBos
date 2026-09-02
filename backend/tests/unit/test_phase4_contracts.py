"""Unit tests validating Fase 4 chat contract integrity (CON-01) and media security headers (SEC-03)."""

import datetime
import pytest

from app.schemas.chat import MessageItem
from app.api.media import create_safe_file_response, SAFE_INLINE_MEDIA_TYPES


def test_message_item_preserves_multimedia_fields():
    """Verify MessageItem schema preserves waveform, thumb, poll, and file metadata."""
    data = {
        "id": 12345,
        "date": datetime.datetime.now(datetime.timezone.utc),
        "text": "Check this voice note & poll",
        "is_outgoing": True,
        "media_type": "voice",
        "waveform_levels": [0, 5, 12, 30, 18, 4, 1],
        "stripped_thumb": "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
        "file_size": 40960,
        "mime_type": "audio/ogg",
        "poll": {
            "question": "Favorite feature?",
            "options": [
                {"text": "Fast", "voters": 10, "chosen": True},
                {"text": "Secure", "voters": 25, "chosen": False},
            ],
            "total_voters": 35,
            "closed": False,
            "is_quiz": False,
        },
        "is_service": False,
        "service_text": None,
    }

    item = MessageItem(**data)
    dumped = item.model_dump()

    assert dumped["waveform_levels"] == [0, 5, 12, 30, 18, 4, 1]
    assert dumped["stripped_thumb"] == "data:image/jpeg;base64,/9j/4AAQSkZJRg=="
    assert dumped["file_size"] == 40960
    assert dumped["mime_type"] == "audio/ogg"
    assert dumped["poll"]["question"] == "Favorite feature?"
    assert len(dumped["poll"]["options"]) == 2


def test_create_safe_file_response_safe_image(tmp_path):
    """Verify safe media types (e.g. JPEG) receive inline disposition without restrictive CSP."""
    dummy_jpg = tmp_path / "avatar.jpg"
    dummy_jpg.write_bytes(b"\xff\xd8\xff\xe0test")

    response = create_safe_file_response(str(dummy_jpg))

    assert response.media_type == "image/jpeg"
    assert 'inline; filename="avatar.jpg"' in response.headers["content-disposition"]
    assert response.headers["x-content-type-options"] == "nosniff"
    assert "content-security-policy" not in response.headers


def test_create_safe_file_response_dangerous_svg(tmp_path):
    """Verify SVG and HTML files are forced to attachment download with restrictive CSP."""
    dummy_svg = tmp_path / "exploit.svg"
    dummy_svg.write_text("<svg><script>alert(1)</script></svg>")

    response = create_safe_file_response(str(dummy_svg))

    # Overridden to octet-stream for safety
    assert response.media_type == "application/octet-stream"
    assert 'attachment; filename="exploit.svg"' in response.headers["content-disposition"]
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["content-security-policy"] == "default-src 'none'"


def test_create_safe_file_response_html(tmp_path):
    """Verify HTML attachments are forced to attachment download with restrictive CSP."""
    dummy_html = tmp_path / "page.html"
    dummy_html.write_text("<html><body>steal cookie</body></html>")

    response = create_safe_file_response(str(dummy_html))

    assert response.media_type == "application/octet-stream"
    assert 'attachment; filename="page.html"' in response.headers["content-disposition"]
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["content-security-policy"] == "default-src 'none'"
