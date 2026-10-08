"""Logging filters that demote known-benign third-party log noise.

Telethon reports a handful of internal races at error level via
``logger.exception()``. They are handled correctly by Telethon itself (it
disconnects the client and moves on), so surfacing them as application
errors only adds noise to alerting.
"""

import logging

# Telethon's Connection._send_loop / _recv_loop log these at exception level
# whenever a read or write races a transport teardown, then handle it by
# disconnecting. Note the exact wording is "receive loop", not "recv loop"
# (PYTHON-FASTAPI-Q was the send/recv counterpart slipping through).
_BENIGN_LOOP_MESSAGES = (
    "Unexpected exception in the send loop",
    "Unexpected exception in the receive loop",
)

# Telegram answers a stale socket with "wrong session ID" when two connections
# briefly shared one auth key. Account ownership (app.utils.account_ownership)
# now prevents that, but a client evicted mid-flight can still trip it, and
# Telethon recovers by reconnecting. It stays at WARNING so a spike remains
# visible; it must not page as an application error.
_SESSION_ID_MESSAGES = (
    "Server replied with a wrong session ID",
)
_BENIGN_TRANSPORT_ERRORS = (
    # uvloop UVHandle._ensure_alive, when the handler closed under a write.
    "the handler is closed",
    # asyncio StreamReader._wait_for_data, when a second read starts on a
    # stream another coroutine is already draining.
    "readexactly() called while another coroutine is already waiting",
    "read() called while another coroutine is already waiting",
    "Event loop is closed",
)


class TelethonTransportNoiseFilter(logging.Filter):
    """Demote Telethon transport-teardown races from error to warning.

    A disconnect closing the socket while a send/recv is in flight is normal
    during eviction, session expiry, and shutdown. Without this, every such
    event reaches Sentry as an unhandled error (PYTHON-FASTAPI-G).
    """

    def filter(self, record: logging.LogRecord) -> bool:
        if record.levelno < logging.ERROR:
            return True

        message = record.getMessage()
        if any(msg in message for msg in _SESSION_ID_MESSAGES):
            record.levelno = logging.WARNING
            record.levelname = "WARNING"
            return True

        if not any(msg in message for msg in _BENIGN_LOOP_MESSAGES):
            return True

        # Only demote when the underlying error is a known teardown race; a
        # genuine protocol error under the same log line must still surface.
        exc_text = ""
        if record.exc_info and record.exc_info[1] is not None:
            exc_text = f"{type(record.exc_info[1]).__name__}: {record.exc_info[1]}"
        elif record.exc_text:
            exc_text = record.exc_text

        if any(noise in exc_text for noise in _BENIGN_TRANSPORT_ERRORS):
            record.levelno = logging.WARNING
            record.levelname = "WARNING"
        return True


class AsyncioTransportNoiseFilter(logging.Filter):
    """Demote known asyncio/asyncpg socket teardown noise from error to warning.

    When an asyncpg connection or socket drops unexpectedly during teardown,
    asyncio logs 'unexpected connection_lost() call' at ERROR level. This is
    benign noise during worker restart/eviction and should not trigger Sentry.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        if record.levelno < logging.ERROR:
            return True

        message = record.getMessage()
        if "unexpected connection_lost() call" in message:
            record.levelno = logging.WARNING
            record.levelname = "WARNING"
            return True

        return True
