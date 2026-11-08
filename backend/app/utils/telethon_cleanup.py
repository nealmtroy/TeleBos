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


# MTProtoSender._reconnect() spawns the auto-reconnect callback with a bare
# ``loop.create_task(...)`` and never stores the handle:
#
#     helpers.get_running_loop().create_task(self._auto_reconnect_callback())
#
# so the task is unreachable from the sender, connection, and client alike.
# ``_transport_tasks`` therefore cannot see it and nothing ever cancels it: it
# outlives teardown and asyncio later reports "Task was destroyed but it is
# pending!". One leaked task per successful reconnect (PYTHON-FASTAPI-1M).
_ORPHAN_TASK_QUALNAME = "UpdateMethods._handle_auto_reconnect"


def _orphan_reconnect_tasks(client: Any) -> list[asyncio.Task]:
    """Return live auto-reconnect tasks belonging to *this* ``client``.

    ``MTProtoSender._reconnect()`` spawns the callback with a bare
    ``loop.create_task(...)`` and keeps no handle, so the only way to find the
    task is to walk the loop's tasks and match the coroutine. Two filters keep
    the sweep safe:

    1. ``co_qualname`` must be exactly Telethon's auto-reconnect callback, so
       unrelated caller tasks are never candidates.
    2. The coroutine's local ``self`` must be *this* client (Telethon stores the
       ``TelegramClient`` as ``MTProtoSender._client`` and invokes the callback
       bound to it). Scoping by identity is what stops a throwaway client's
       teardown from cancelling a live pooled client's pending reconnect.
    """
    try:
        running = asyncio.all_tasks()
    except RuntimeError:
        # No running loop (sync context): nothing to sweep.
        return []

    orphans: list[asyncio.Task] = []
    for task in running:
        if task.done():
            continue
        coro = task.get_coro()
        code = getattr(coro, "cr_code", None)
        if code is None or code.co_qualname != _ORPHAN_TASK_QUALNAME:
            continue
        frame = getattr(coro, "cr_frame", None)
        if frame is not None and frame.f_locals.get("self") is not client:
            # Another client's reconnect in flight -- not ours to cancel.
            continue
        orphans.append(task)
    return orphans


def _cancel_and_reap_now(tasks: list[asyncio.Task]) -> None:
    """Cancel tasks from sync context; done-callbacks stop the leak warning.

    ``force_close_telethon_client`` is synchronous by contract (callers invoke
    it from ``finally`` blocks after an already-awaited disconnect), so it
    cannot await. Cancelling is enough to prevent the "destroyed but pending"
    log as long as the cancellation is actually delivered: a loop callback that
    consumes the task's exception is registered here, and the loop gets a chance
    to run on the next ``await`` the caller performs.
    """
    for task in tasks:
        if not task.done():
            task.cancel()
            # Mark the exception as retrieved so an unawaited cancellation does
            # not itself surface as "Task exception was never retrieved".
            task.add_done_callback(lambda t: t.cancelled() or t.exception())


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
    _cancel_and_reap_now(_transport_tasks(client) + _orphan_reconnect_tasks(client))


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
    # The auto-reconnect callback is spawned with a bare create_task, so it is
    # not reachable from the client and must be collected from the loop.
    tasks += _orphan_reconnect_tasks(client)
    for task in tasks:
        task.cancel()
    if tasks:
        try:
            await asyncio.wait_for(
                asyncio.gather(*tasks, return_exceptions=True), timeout=timeout
            )
        except (asyncio.TimeoutError, Exception):
            pass