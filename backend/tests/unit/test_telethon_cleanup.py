"""Regression tests for the Telethon pending-task leak.

Regression guard for PYTHON-FASTAPI-B/C/D/E/W/X/Y ("Task was destroyed but it is
pending!").

The previous helper looked for ``client._send_task`` / ``client._recv_task``.
Those attributes live on ``Connection``, not ``TelegramClient``, so the helper
was a silent no-op and every half-open client kept its transport tasks alive.
These tests pin the real attribute location and the cancel-and-await behaviour.
"""

import asyncio
from typing import Any

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


# ---------------------------------------------------------------------------
# PYTHON-FASTAPI-1M follow-up: Telethon's auto-reconnect callback is spawned as
# a *bare* task that nothing owns.
#
# ``MTProtoSender._reconnect()`` does:
#     helpers.get_running_loop().create_task(self._auto_reconnect_callback())
# (telethon/network/mtprotosender.py, in the success branch after reconnecting)
# The returned task is never stored on the sender, the connection, or the
# client, so ``_transport_tasks()`` cannot see it and nothing ever cancels it.
#
# In production this leaked one ``UpdateMethods._handle_auto_reconnect`` task per
# reconnect attempt. A session-conversion retry storm produced 5,080
# "Task was destroyed but it is pending!" errors in a single 10-minute burst
# (2026-11-08 13:19 and 13:24 UTC).
# ---------------------------------------------------------------------------


async def _make_orphan_reconnect_task(client: Any) -> asyncio.Task:
    """A live task running Telethon's *real* auto-reconnect callback for ``client``.

    Reproduces the exact shape of the leaked task: the coroutine is the genuine
    ``UpdateMethods._handle_auto_reconnect`` (so ``cr_code.co_qualname`` matches
    production byte-for-byte), it is bound to ``client`` exactly as Telethon
    binds it, and nothing holds a reference to the task itself.

    ``_handle_auto_reconnect`` begins with ``await self.get_me()``, so a client
    whose ``get_me`` never returns parks the task exactly where production parks
    it: pending forever, awaiting a future.
    """
    from telethon.client.updates import UpdateMethods

    started = asyncio.Event()

    async def _blocking_get_me() -> None:
        started.set()
        await asyncio.sleep(3600)

    # ``self`` inside the coroutine is the client itself, as in production.
    client.get_me = _blocking_get_me
    task = asyncio.create_task(
        UpdateMethods._handle_auto_reconnect(client)  # type: ignore[arg-type]
    )
    await started.wait()
    await asyncio.sleep(0)
    return task


@pytest.mark.asyncio
async def test_reap_cancels_orphan_auto_reconnect_tasks():
    """The auto-reconnect task is not reachable from the client — it must still die.

    Without an explicit sweep this task survives the client teardown and asyncio
    later logs "Task was destroyed but it is pending!" (PYTHON-FASTAPI-1M).
    """
    client = await _make_busy_client()
    orphan = await _make_orphan_reconnect_task(client)

    await close_and_reap_telethon_client(client, "acct-test")

    assert orphan.done(), (
        "orphaned auto-reconnect task survived teardown; it is spawned with a bare "
        "create_task in MTProtoSender._reconnect and must be swept explicitly"
    )
    await _drain()


@pytest.mark.asyncio
async def test_reap_leaves_another_clients_reconnect_task_alone():
    """Teardown of a throwaway client must not kill a live pooled client's reconnect.

    The sweep walks every task on the loop, so it has to be scoped by the owning
    client. Cancelling another client's in-flight reconnect would silently break
    a healthy account's update stream.
    """
    doomed = await _make_busy_client()
    survivor = await _make_busy_client()
    survivor_orphan = await _make_orphan_reconnect_task(survivor)

    await close_and_reap_telethon_client(doomed, "acct-doomed")

    assert not survivor_orphan.done(), (
        "reaping one client's tasks cancelled a different client's reconnect"
    )

    survivor_orphan.cancel()
    await _drain()
    await close_and_reap_telethon_client(survivor, "acct-survivor")


@pytest.mark.asyncio
async def test_reap_does_not_touch_unrelated_foreground_tasks():
    """The sweep must only cancel Telethon's own callback, not caller work."""
    client = await _make_busy_client()

    async def _caller_work() -> None:
        await asyncio.sleep(3600)

    unrelated = asyncio.create_task(_caller_work())
    await asyncio.sleep(0)

    await close_and_reap_telethon_client(client, "acct-test")

    assert not unrelated.done(), "must not cancel tasks outside the telethon namespace"

    unrelated.cancel()
    await _drain()