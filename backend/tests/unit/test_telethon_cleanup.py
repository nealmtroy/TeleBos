"""Regression tests for the Telethon pending-task leak.

Regression guard for PYTHON-FASTAPI-B/C/D/E/W/X/Y ("Task was destroyed but it is
pending!").

The previous helper looked for ``client._send_task`` / ``client._recv_task``.
Those attributes live on ``Connection``, not ``TelegramClient``, so the helper
was a silent no-op and every half-open client kept its transport tasks alive.
These tests pin the real attribute location and the cancel-and-await behaviour.
"""

import asyncio

import pytest

from app.utils.telethon_cleanup import (
    _transport_tasks,
    close_and_reap_telethon_client,
    force_close_telethon_client,
)


class FakeConnection:
    """Mimics telethon.network.connection.Connection task storage."""

    def __init__(self) -> None:
        self._send_task: asyncio.Task | None = None
        self._recv_task: asyncio.Task | None = None


class FakeClient:
    """Mimics TelegramClient: holds the connection, does NOT proxy its tasks."""

    def __init__(self, disconnect_raises: Exception | None = None) -> None:
        self._connection = FakeConnection()
        self.disconnect_raises = disconnect_raises
        self.disconnect_calls = 0

    async def disconnect(self) -> None:
        self.disconnect_calls += 1
        if self.disconnect_raises is not None:
            raise self.disconnect_raises


async def _make_busy_client(disconnect_raises=None) -> FakeClient:
    """A client with live transport tasks, like a half-open connection."""

    client = FakeClient(disconnect_raises=disconnect_raises)
    started = asyncio.Event()

    async def _loop() -> None:
        started.set()
        await asyncio.sleep(3600)

    client._connection._send_task = asyncio.create_task(_loop())
    client._connection._recv_task = asyncio.create_task(_loop())
    await started.wait()
    # let both tasks actually reach the sleep
    await asyncio.sleep(0)
    return client


async def _drain() -> None:
    """Give cancelled tasks a chance to process their cancellation."""
    for _ in range(5):
        await asyncio.sleep(0)


@pytest.mark.asyncio
async def test_transport_tasks_are_found_on_the_connection():
    """The leak was invisible because the tasks live on _connection."""
    client = await _make_busy_client()
    tasks = _transport_tasks(client)

    assert len(tasks) == 2, "must find the tasks Telethon actually created"
    assert all(not t.done() for t in tasks)

    for t in tasks:
        t.cancel()
    await _drain()


@pytest.mark.asyncio
async def test_force_close_cancels_transport_tasks():
    """The old helper silently did nothing here."""
    client = await _make_busy_client()

    force_close_telethon_client(client)

    assert client._connection._send_task.cancelled() or client._connection._send_task.cancelling()
    assert client._connection._recv_task.cancelled() or client._connection._recv_task.cancelling()
    await _drain()


@pytest.mark.asyncio
async def test_close_and_reap_awaits_cancelled_tasks():
    """Cancelling without awaiting still logs 'destroyed but it is pending'."""

    async def _tracker() -> None:
        try:
            await asyncio.sleep(3600)
        except asyncio.CancelledError:
            raise

    client = await _make_busy_client()
    tasks = [client._connection._send_task, client._connection._recv_task]

    await close_and_reap_telethon_client(client, "acct-test")

    assert client.disconnect_calls == 1
    for t in tasks:
        # fully finished, not merely cancelling: this is what stops the
        # "Task was destroyed but it is pending!" log
        assert t.done(), "task must be awaited to completion, not just cancelled"


@pytest.mark.asyncio
async def test_close_and_reap_survives_disconnect_failure():
    """A disconnect that raises must not skip reaping the tasks."""
    client = await _make_busy_client(disconnect_raises=RuntimeError("socket reset"))
    tasks = [client._connection._send_task, client._connection._recv_task]

    await close_and_reap_telethon_client(client, "acct-test")

    assert client.disconnect_calls == 1
    for t in tasks:
        assert t.done()


@pytest.mark.asyncio
async def test_close_and_reap_is_safe_without_connection():
    """A client that never created a connection must not raise."""
    client = FakeClient()
    await close_and_reap_telethon_client(client, "acct-test")
    assert client.disconnect_calls == 1


@pytest.mark.asyncio
async def test_close_and_reap_tolerates_timeout():
    """A hung disconnect still reaps the tasks instead of leaking them."""

    class HangingClient(FakeClient):
        async def disconnect(self) -> None:
            self.disconnect_calls += 1
            await asyncio.sleep(3600)

    client = HangingClient()
    started = asyncio.Event()

    async def _loop() -> None:
        started.set()
        await asyncio.sleep(3600)

    client._connection._send_task = asyncio.create_task(_loop())
    await started.wait()
    task = client._connection._send_task

    await close_and_reap_telethon_client(client, "acct-test", timeout=0.05)

    assert task.done()