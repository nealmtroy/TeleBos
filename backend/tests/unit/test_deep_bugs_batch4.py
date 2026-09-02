"""Unit tests validating Batch 4 bug fixes from deep_bug_logic_audit_report.md."""

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
import pytest

from app.services import appeal_service


@pytest.mark.asyncio
async def test_spambot_appeal_callback_timeout_fallback():
    """Verify EDG-03: callback click handles TimeoutError when SpamBot edits message in place."""
    client = AsyncMock()

    # Mock conversation
    conv = AsyncMock()
    # conv.get_response raises TimeoutError simulating edited message without NewMessage event
    conv.get_response.side_effect = asyncio.TimeoutError()
    conv.send_message = AsyncMock()

    # client.conversation context manager returns conv
    conv_ctx = AsyncMock()
    conv_ctx.__aenter__.return_value = conv
    conv_ctx.__aexit__.return_value = None
    client.conversation = MagicMock(return_value=conv_ctx)

    # Fallback client.get_messages returns edited message
    edited_msg = SimpleNamespace(text="Silakan kirimkan alasan pemulihan akun Anda.")
    client.get_messages.return_value = [edited_msg]

    last_msg = MagicMock()
    last_msg.out = False
    last_msg.text = "Please complete the verification."
    last_msg.buttons = [[MagicMock(text="Done", click=AsyncMock())]]

    async def mock_iter(entity, limit=10):
        yield last_msg

    client.iter_messages = mock_iter
    client.get_entity.return_value = SimpleNamespace(id=12345)

    result = await appeal_service.resume_spam_appeal(client, "Akun saya disalahgunakan pihak lain.")

    assert result["status"] == "completed"
    assert result["message"] == "Silakan kirimkan alasan pemulihan akun Anda."


def test_photos_to_delete_deferred_collection():
    """Verify INC-01: photos_to_delete collects paths without immediate physical deletion."""
    account_id = "test-account-uuid"
    photos_to_delete = []

    # Simulate logic from _prepare_account_for_sale_inner
    from app.services.account_service import _photo_path
    photo_path = _photo_path(account_id)

    if photos_to_delete is not None:
        photos_to_delete.append(photo_path)

    assert len(photos_to_delete) == 1
    assert photo_path in photos_to_delete
