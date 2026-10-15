"""Auto-join anti-ban: FloodWait/PeerFlood must survive the service wrapper.

``group_admin_service.join_chat`` rewrites telethon rate-limits into a
``RuntimeError`` so HTTP callers return 400. That used to erase the
classification, so the auto-join worker could not tell a flood from a generic
failure and kept joining. These tests pin the wrapper + classifier contract.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from telethon.errors import FloodWaitError, PeerFloodError

from app.services import group_admin_service as gas
from app.utils.telegram_errors import TelegramRateLimitError, classify_telegram_error


def _account():
    acc = MagicMock()
    acc.id = "00000000-0000-0000-0000-000000000001"
    acc.session_string = "encrypted-session"
    return acc


async def _invoke(identifier, client):
    with patch.object(gas, "decrypt", return_value="session-string"), patch.object(
        gas, "client_pool"
    ) as pool:
        pool.get = AsyncMock(return_value=client)
        return await gas.join_chat(_account(), identifier)


@pytest.mark.asyncio
async def test_join_chat_wraps_flood_wait_as_rate_limit_error():
    flood = FloodWaitError(request=None)
    flood.seconds = 77
    client = MagicMock()
    client.get_entity = AsyncMock(side_effect=flood)

    with pytest.raises(TelegramRateLimitError) as exc_info:
        await _invoke("@someuser", client)

    assert exc_info.value.error_type == "flood"
    assert exc_info.value.seconds == 77
    # And the classifier recovers it as a flood.
    assert classify_telegram_error(exc_info.value)[0] == "flood"


@pytest.mark.asyncio
async def test_join_chat_wraps_peer_flood_as_rate_limit_error():
    client = AsyncMock()
    client.get_entity = AsyncMock(side_effect=Exception("not resolvable"))
    client.side_effect = PeerFloodError(request=None)

    with pytest.raises(TelegramRateLimitError) as exc_info:
        await _invoke("@someuser", client)

    assert exc_info.value.error_type == "peer_flood"
    assert classify_telegram_error(exc_info.value)[0] == "peer_flood"


def test_rate_limit_wrapper_is_classified_with_wait_seconds():
    err_type, msg = classify_telegram_error(TelegramRateLimitError("flood", 120))
    assert err_type == "flood"
    assert "120" in msg


def test_rate_limit_wrapper_is_a_runtime_error():
    # HTTP callers catch RuntimeError to return 400 rather than a 500.
    assert issubclass(TelegramRateLimitError, RuntimeError)
