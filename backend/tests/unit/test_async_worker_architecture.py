"""Unit tests for the Dedicated Async Worker architecture and Redis IPC.

Verifies:
1. Redis dispatcher enqueues jobs and publishes control/WS events.
2. Redis WebSocket bridge forwards messages to WebSocket manager.
3. Broadcast and Invite services dispatch jobs via Redis queue.
4. Worker control subscriber responds to pause, resume, and stop signals.
"""

import json
import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.utils import redis_dispatcher
from app.services import redis_ws_bridge
from app.workers import async_worker


@pytest.mark.asyncio
async def test_redis_dispatcher_functions():
    """Verify enqueue_job, publish_job_control, and publish_ws_event."""
    test_id = uuid.uuid4()

    with patch("app.utils.redis_dispatcher.redis_client") as mock_redis:
        mock_redis.rpush = AsyncMock(return_value=1)
        mock_redis.publish = AsyncMock(return_value=1)

        # 1. Enqueue job
        res_enqueue = await redis_dispatcher.enqueue_job("broadcast", test_id)
        assert res_enqueue is True
        mock_redis.rpush.assert_awaited_once()
        call_args = mock_redis.rpush.call_args[0]
        assert call_args[0] == redis_dispatcher.JOBS_QUEUE_KEY
        payload = json.loads(call_args[1])
        assert payload["action"] == "start"
        assert payload["job_type"] == "broadcast"
        assert payload["job_id"] == str(test_id)

        # 2. Publish control
        res_ctrl = await redis_dispatcher.publish_job_control("broadcast", test_id, "pause")
        assert res_ctrl is True
        mock_redis.publish.assert_awaited_once()
        ctrl_args = mock_redis.publish.call_args[0]
        assert ctrl_args[0] == redis_dispatcher.JOBS_CONTROL_CHANNEL
        ctrl_payload = json.loads(ctrl_args[1])
        assert ctrl_payload["action"] == "pause"
        assert ctrl_payload["job_id"] == str(test_id)

        # 3. Publish WS event
        mock_redis.publish.reset_mock()
        res_ws = await redis_dispatcher.publish_ws_event("broadcast:123", {"type": "progress", "progress": 50})
        assert res_ws is True
        mock_redis.publish.assert_awaited_once()
        ws_args = mock_redis.publish.call_args[0]
        assert ws_args[0] == redis_dispatcher.WS_EVENTS_CHANNEL
        ws_payload = json.loads(ws_args[1])
        assert ws_payload["channel"] == "broadcast:123"
        assert ws_payload["event_data"]["type"] == "progress"


@pytest.mark.asyncio
async def test_redis_ws_bridge_relays_to_manager():
    """Verify that redis_ws_bridge_loop listens and calls manager.broadcast."""
    mock_pubsub = AsyncMock()

    test_message = {
        "type": "message",
        "data": json.dumps({
            "channel": "broadcast:test-id",
            "event_data": {"type": "progress", "progress": 75}
        })
    }

    async def fake_listen():
        yield test_message
        await asyncio.Event().wait()

    mock_pubsub.listen = fake_listen
    mock_pubsub.subscribe = AsyncMock()
    mock_pubsub.unsubscribe = AsyncMock()
    mock_pubsub.close = AsyncMock()

    with patch("app.services.redis_ws_bridge.redis_client.pubsub", return_value=mock_pubsub):
        with patch("app.api.ws.manager.broadcast", new_callable=AsyncMock) as mock_broadcast:
            import asyncio
            task = asyncio.create_task(redis_ws_bridge.redis_ws_bridge_loop())
            # Let the loop process one message
            await asyncio.sleep(0.05)
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

            mock_broadcast.assert_awaited_with("broadcast:test-id", {"type": "progress", "progress": 75})


@pytest.mark.asyncio
async def test_worker_queue_consumer_processes_jobs():
    """Verify that worker queue_consumer_loop calls start_broadcast_task on message."""
    test_id = str(uuid.uuid4())
    item_payload = json.dumps({
        "action": "start",
        "job_type": "broadcast",
        "job_id": test_id
    })

    # Return one item then keep timeout
    call_count = 0
    async def fake_blpop(key, timeout=2):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return ("telebos:jobs:queue", item_payload)
        async_worker.shutdown_event.set()
        return None

    async_worker.shutdown_event.clear()
    with patch("app.workers.async_worker.redis_client.blpop", side_effect=fake_blpop):
        with patch("app.services.broadcast_service.start_broadcast_task") as mock_start:
            await async_worker.queue_consumer_loop()
            mock_start.assert_called_once_with(test_id)


@pytest.mark.asyncio
async def test_worker_control_subscriber_processes_signals():
    """Verify that worker control_subscriber_loop handles pause, resume, stop."""
    test_id = str(uuid.uuid4())

    async_worker.shutdown_event.clear()
    mock_pubsub = AsyncMock()

    messages = [
        {"type": "message", "data": json.dumps({"action": "pause", "job_type": "broadcast", "job_id": test_id})},
        {"type": "message", "data": json.dumps({"action": "resume", "job_type": "broadcast", "job_id": test_id})},
        {"type": "message", "data": json.dumps({"action": "stop", "job_type": "broadcast", "job_id": test_id})},
    ]

    msg_idx = 0
    async def fake_get_message(ignore_subscribe_messages=True, timeout=2.0):
        nonlocal msg_idx
        if msg_idx < len(messages):
            m = messages[msg_idx]
            msg_idx += 1
            return m
        async_worker.shutdown_event.set()
        return None

    mock_pubsub.get_message = fake_get_message
    mock_pubsub.subscribe = AsyncMock()
    mock_pubsub.unsubscribe = AsyncMock()
    mock_pubsub.close = AsyncMock()

    with patch("app.workers.async_worker.redis_client.pubsub", return_value=mock_pubsub):
        with patch("app.workers.async_worker.wake_job") as mock_wake:
            with patch("app.services.broadcast_service.start_broadcast_task") as mock_start:
                await async_worker.control_subscriber_loop()

                # wake_job should be called for pause, resume, stop
                assert mock_wake.call_count == 3
                # start_broadcast_task should be called on resume
                mock_start.assert_called_once_with(test_id)
