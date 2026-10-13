"""Unit tests verifying WebSocket socket read timeout and safe parsing (REL-03 / TASK-30).

Acceptance Criteria:
1. Idle timeout: Client going silent for timeout interval is closed cleanly with WS code 1000.
2. Safe parsing: Plain-text frames ("ping", "test", invalid JSON) do not crash or disconnect the WebSocket.
3. Plain-text "ping" returns a "pong" response just like JSON {"type": "ping"}.
4. Channel manager disconnect is guaranteed on exit.
"""

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from fastapi import WebSocketDisconnect, status

from app.api.ws import (
    WS_IDLE_TIMEOUT_SECONDS,
    handle_websocket_message_loop,
    manager,
)


@pytest.fixture(autouse=True)
def clean_channel_manager():
    """Ensure manager is cleaned up before and after each test."""
    manager._connections.clear()
    yield
    manager._connections.clear()


@pytest.mark.asyncio
async def test_ws_loop_handles_json_ping_and_keeps_connection_alive():
    """Verify JSON ping frame returns pong and does not close socket."""
    channel = "test_channel:1"
    ws = AsyncMock()

    # Sequence of frames: JSON ping, followed by normal disconnect
    ws.receive_text.side_effect = [
        json.dumps({"type": "ping"}),
        WebSocketDisconnect(code=1000),
    ]

    await manager.connect(channel, ws)
    assert manager.has_channel(channel)

    await handle_websocket_message_loop(ws, channel, timeout=5.0)

    # Verify pong was sent
    ws.send_text.assert_awaited_once_with(json.dumps({"type": "pong"}))
    # Verify manager disconnected on clean exit
    assert not manager.has_channel(channel)


@pytest.mark.asyncio
async def test_ws_loop_handles_plain_text_ping_safely():
    """Verify plain-text 'ping' (non-JSON) responds with pong without crashing."""
    channel = "test_channel:2"
    ws = AsyncMock()

    ws.receive_text.side_effect = [
        "ping",
        "  PING  ",
        WebSocketDisconnect(code=1000),
    ]

    await manager.connect(channel, ws)
    await handle_websocket_message_loop(ws, channel, timeout=5.0)

    # Verify 2 pongs sent for both plain text pings
    assert ws.send_text.await_count == 2
    for call in ws.send_text.await_args_list:
        assert call.args[0] == json.dumps({"type": "pong"})

    assert not manager.has_channel(channel)


@pytest.mark.asyncio
async def test_ws_loop_ignores_arbitrary_non_json_text_without_disconnect():
    """Verify non-JSON frames ('hello', 'test', malformed JSON) are ignored without disconnecting."""
    channel = "test_channel:3"
    ws = AsyncMock()

    # Send random non-JSON strings, followed by a valid ping to prove socket survived
    ws.receive_text.side_effect = [
        "hello",
        "test",
        "{invalid: json syntax",
        "some arbitrary plain text",
        json.dumps({"type": "ping"}),
        WebSocketDisconnect(code=1000),
    ]

    await manager.connect(channel, ws)
    await handle_websocket_message_loop(ws, channel, timeout=5.0)

    # Sockets remained connected and processed the subsequent ping!
    ws.send_text.assert_awaited_once_with(json.dumps({"type": "pong"}))
    # ws.close was NOT called prematurely
    ws.close.assert_not_called()
    assert not manager.has_channel(channel)


@pytest.mark.asyncio
async def test_ws_loop_idle_timeout_closes_with_1000():
    """Verify TASK-30: socket without activity triggers read timeout and closes cleanly with code 1000."""
    channel = "test_channel:4"
    ws = AsyncMock()

    # Simulate timeout by causing receive_text to sleep longer than timeout
    async def slow_receive():
        await asyncio.sleep(0.2)
        return "data"

    ws.receive_text.side_effect = slow_receive

    await manager.connect(channel, ws)
    assert manager.has_channel(channel)

    # Run with small timeout (0.05s) to trigger timeout branch
    await handle_websocket_message_loop(ws, channel, timeout=0.05)

    # Verify socket was closed cleanly with code 1000
    ws.close.assert_awaited_once_with(
        code=status.WS_1000_NORMAL_CLOSURE,
        reason="Connection idle timeout",
    )
    # Verify channel was disconnected
    assert not manager.has_channel(channel)


@pytest.mark.asyncio
async def test_ws_default_timeout_is_90_seconds():
    """Verify default idle timeout constant is exactly 90.0 seconds as specified in REL-03."""
    assert WS_IDLE_TIMEOUT_SECONDS == 90.0


@pytest.mark.asyncio
async def test_ws_loop_unexpected_exception_cleanup():
    """Verify unexpected network exception in loop logs warning and cleans up manager."""
    channel = "test_channel:5"
    ws = AsyncMock()

    ws.receive_text.side_effect = RuntimeError("Fatal socket error")

    await manager.connect(channel, ws)
    assert manager.has_channel(channel)

    with patch("app.api.ws.logger.warning") as mock_log:
        await handle_websocket_message_loop(ws, channel, timeout=5.0)
        mock_log.assert_called_once()

    # Verify manager disconnected cleanly even after exception
    assert not manager.has_channel(channel)
