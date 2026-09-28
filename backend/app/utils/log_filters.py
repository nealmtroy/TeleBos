"""Logging filters that demote known-benign third-party log noise.

Telethon reports a handful of internal races at error level via
``logger.exception()``. They are handled correctly by Telethon itself (it
disconnects the client and moves on), so surfacing them as application
errors only adds noise to alerting.
"""

import logging

# Telethon's Connection._send_loop logs this at exception level whenever a
# write races with a transport teardown. The RuntimeError below is raised by
# uvloop's UVHandle._ensure_alive when the handler has already been closed --
# exactly the disconnect path the loop is about to take anyway.
_BENIGN_SEND_LOOP_MESSAGES = (
    "Unexpected exception in the send loop",
    "Unexpected exception in the recv loop",
)
_BENIGN_TRANSPORT_ERRORS = (
    "the handler is closed",
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
        if not any(msg in record.getMessage() for msg in _BENIGN_SEND_LOOP_MESSAGES):
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
