"""Teardown helpers for short-lived Telethon clients."""

import asyncio
from typing import Any


def _transport_tasks(client: Any) -> list[asyncio.Task]:
    """Return Telethon's live transport tasks for ``client``.

    ``Connection.__init__`` creates ``_send_task`` / ``_recv_task`` via
    ``loop.create_task`` (telethon/network/connection/connection.py) and stores
    them on the *Connection* instance, not on ``TelegramClient``.
    ``TelegramClient`` holds it as ``_connection`` and does not proxy the
    attributes, so anything reading ``client._send_task`` is silently reading a
    name that does not exist -- which is why the pending-task leak survived
    every previous attempt.
    """
    tasks: list[asyncio.Task] = []
    for holder in (getattr(client, "_connection", None), client):
        if holder is None:
            continue
        for name in ("_send_task", "_recv_task"):
            task = getattr(holder, name, None)
            if isinstance(task, asyncio.Task) and task not in tasks:
                tasks.append(task)
    return tasks


def force_close_telethon_client(client: Any) -> None:
    """Cancel any Telethon loop tasks left behind by a half-open client.

    ``TelegramClient.disconnect()`` is a no-op when the client never reached
    ``_connected`` -- which is exactly the state a client is left in when
    ``connect()`` times out or raises. Its ``_recv_loop``/``_send_loop`` tasks
    then survive with nobody awaiting them, so asyncio logs "Task was
    destroyed but it is pending!" and the socket is never released
    (PYTHON-FASTAPI-B/C/D/E/W/X/Y). This must run after every disconnect
    attempt, including the ones that no-op.
    """
    for task in _transport_tasks(client):
        if not task.done():
            task.cancel()


async def close_and_reap_telethon_client(client: Any, account_id: str, timeout: float = 5.0) -> None:
    """Disconnect a client, then cancel *and await* its transport tasks.

    Cancelling alone is not enough: a task that is cancelled but never awaited
    is still "pending" when the event loop garbage-collects it, so asyncio logs
    the same "Task was destroyed but it is pending!" warning. This awaits the
    cancelled tasks with a bounded timeout so the interpreter actually reaps
    them before the last reference to the client is dropped.

    Best-effort by design: teardown must never raise into the caller.
    """
    try:
        await asyncio.wait_for(client.disconnect(), timeout=timeout)
    except asyncio.TimeoutError:
        pass
    except (RuntimeError, ConnectionResetError, OSError):
        pass
    except Exception:
        pass

    tasks = [t for t in _transport_tasks(client) if not t.done()]
    for task in tasks:
        task.cancel()
    if tasks:
        try:
            await asyncio.wait_for(
                asyncio.gather(*tasks, return_exceptions=True), timeout=timeout
            )
        except (asyncio.TimeoutError, Exception):
            pass