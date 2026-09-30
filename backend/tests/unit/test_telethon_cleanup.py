"""Half-open Telethon clients must not leak their loop tasks (PYTHON-FASTAPI-B/C/D/E/W/X/Y)."""

import asyncio

from app.utils.telethon_cleanup import force_close_telethon_client


class _FakeTask:
    def __init__(self):
        self.cancelled = False
        self.done_called = False

    def done(self) -> bool:
        self.done_called = True
        return False

    def cancel(self) -> None:
        self.cancelled = True


class _FakeClient:
    def __init__(self, connected: bool):
        self._connected = connected
        self._recv_task = _FakeTask()
        self._send_task = _FakeTask()
        self.disconnect_called = False

    async def disconnect(self):
        # Mirrors telethon.network.connection.Connection.disconnect
        if not self._connected:
            return
        self._connected = False
        self._recv_task.cancel()
        self._send_task.cancel()


def test_force_close_cancels_tasks_of_never_connected_client():
    """The leak: disconnect() no-ops, so nothing else cancels the tasks."""
    client = _FakeClient(connected=False)

    asyncio.run(client.disconnect())
    assert not client._recv_task.cancelled, "precondition: no-op leaves tasks pending"

    force_close_telethon_client(client)

    assert client._recv_task.cancelled
    assert client._send_task.cancelled


def test_force_close_is_safe_on_connected_client():
    client = _FakeClient(connected=True)

    asyncio.run(client.disconnect())
    assert client._recv_task.cancelled  # disconnect already handled it

    force_close_telethon_client(client)  # must not raise


def test_force_close_tolerates_missing_tasks():
    class Bare:
        pass

    force_close_telethon_client(Bare())  # must not raise


def test_force_close_ignores_finished_tasks():
    class Done:
        def done(self):
            return True

        def cancel(self):
            raise AssertionError("should not cancel a finished task")

    client = _FakeClient(connected=True)
    client._recv_task = Done()
    client._send_task = Done()

    force_close_telethon_client(client)  # must not raise
