"""Teardown helpers for short-lived Telethon clients."""

from typing import Any


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
    for task in (
        getattr(client, "_recv_task", None),
        getattr(client, "_send_task", None),
    ):
        if task is None or task.done():
            continue
        task.cancel()
