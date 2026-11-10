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
    "Unhandled error while receiving data",
    "Unhandled error while sending data",
    "Server sent invalid buffer",
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
    # Telethon transport reset / socket blip from Telegram DC (PYTHON-FASTAPI-50, PYTHON-FASTAPI-4Z)
    "InvalidBufferError",
    "Invalid response buffer",
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
            # A 404 InvalidBufferError means Telegram has forgotten the auth
            # key ("the session may need to be recreated"). That is actionable,
            # so it must not be demoted into silence along with teardown races.
            exc_obj = record.exc_info[1] if record.exc_info else None
            if not _is_benign_invalid_buffer(exc_obj, exc_text):
                return True
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
        if (
            "Task was destroyed but it is pending!" in message
            and "UpdateMethods._handle_auto_reconnect" in message
        ):
            record.levelno = logging.WARNING
            record.levelname = "WARNING"
            return True

        return True


def _is_benign_invalid_buffer(exc: object | None = None, text: str = "") -> bool:
    """True only for the *recoverable* InvalidBufferError teardown race.

    Telethon raises ``InvalidBufferError`` for two very different situations:

    * a transport blip while a socket is torn down -- Telethon reconnects, so
      this is noise (PYTHON-FASTAPI-50 / 4Z) and should not reach Sentry;
    * ``code == 404`` -- "Server does not know about the current auth key; the
      session may need to be recreated" (mtprotosender._recv_loop). That is the
      one case an operator must act on, so it has to stay reportable. Dropping
      it silently removes the only signal that an account's session is dead.
    """
    if exc is not None and getattr(exc, "code", None) == 404:
        return False
    # No structured exception (e.g. an already-serialised Sentry event): the
    # auth-key signature is the best available discriminator. Telethon renders
    # the code into the message ("Invalid response buffer (HTTP code 404)").
    lowered = text.lower()
    if "http code 404" in lowered or "auth key" in lowered or "authkeynotfound" in lowered:
        return False
    return True


def sentry_before_send(event: dict, hint: dict) -> dict | None:
    """Drop benign Telethon / asyncio transport teardown events before Sentry ingestion."""
    log_record = hint.get("log_record")
    if log_record is not None:
        try:
            msg = log_record.getMessage()
        except Exception:
            msg = str(getattr(log_record, "msg", ""))
        if any(term in msg for term in _SESSION_ID_MESSAGES):
            return None
        if "unexpected connection_lost() call" in msg:
            return None
        if (
            "Task was destroyed but it is pending!" in msg
            and "UpdateMethods._handle_auto_reconnect" in msg
        ):
            return None
        if "Server sent invalid buffer" in msg:
            exc = None
            if log_record.exc_info and len(log_record.exc_info) >= 2:
                exc = log_record.exc_info[1]
            if _is_benign_invalid_buffer(exc, msg):
                return None

    exc_info = hint.get("exc_info")
    if exc_info and len(exc_info) >= 2 and exc_info[1] is not None:
        exc = exc_info[1]
        exc_type_name = type(exc).__name__
        exc_str = f"{exc_type_name}: {exc}"
        if exc_type_name == "InvalidBufferError" and _is_benign_invalid_buffer(exc, exc_str):
            return None
        if "Invalid response buffer" in exc_str and _is_benign_invalid_buffer(exc, exc_str):
            return None

    for exc_val in (event.get("exception") or {}).get("values") or []:
        etype = exc_val.get("type") or ""
        eval_str = exc_val.get("value") or ""
        if etype == "InvalidBufferError" and _is_benign_invalid_buffer(None, eval_str):
            return None
        if "Invalid response buffer" in eval_str and _is_benign_invalid_buffer(None, eval_str):
            return None
        if (
            "Task was destroyed but it is pending!" in eval_str
            and "UpdateMethods._handle_auto_reconnect" in eval_str
        ):
            return None

    return event
