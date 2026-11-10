"""Tests for benign third-party log noise filters (PYTHON-FASTAPI-G)."""

import logging

import pytest

from app.utils.log_filters import _BENIGN_LOOP_MESSAGES, TelethonTransportNoiseFilter


def _send_loop_record(msg: str, exc: Exception | None) -> logging.LogRecord:
    record = logging.LogRecord(
        name="telethon.network.connection.connection",
        level=logging.ERROR,
        pathname=__file__,
        lineno=1,
        msg=msg,
        args=(),
        exc_info=(type(exc), exc, None) if exc is not None else None,
    )
    return record


def test_demotes_closed_handler_transport_race():
    exc = RuntimeError(
        "unable to perform operation on <TCPTransport closed=True reading=False>; "
        "the handler is closed"
    )
    record = _send_loop_record("Unexpected exception in the send loop", exc)

    assert TelethonTransportNoiseFilter().filter(record) is True
    assert record.levelno == logging.WARNING


def test_demotes_event_loop_closed_race():
    exc = RuntimeError("Event loop is closed")
    record = _send_loop_record("Unexpected exception in the send loop", exc)

    assert TelethonTransportNoiseFilter().filter(record) is True
    assert record.levelno == logging.WARNING


def test_keeps_genuine_error_at_error_level():
    """A real protocol failure under the same log line must still surface."""
    exc = ValueError("packet sequence number is invalid")
    record = _send_loop_record("Unexpected exception in the send loop", exc)

    assert TelethonTransportNoiseFilter().filter(record) is True
    assert record.levelno == logging.ERROR


def test_leaves_other_log_records_untouched():
    record = _send_loop_record("The server closed the connection while sending", None)

    assert TelethonTransportNoiseFilter().filter(record) is True
    assert record.levelno == logging.ERROR


def test_leaves_non_telethon_records_untouched():
    record = logging.LogRecord(
        name="app.services.broadcast_service",
        level=logging.ERROR,
        pathname=__file__,
        lineno=1,
        msg="Unexpected exception in the send loop",
        args=(),
        exc_info=(RuntimeError, RuntimeError("the handler is closed"), None),
    )

    assert TelethonTransportNoiseFilter().filter(record) is True
    assert record.levelno == logging.WARNING


def test_demotes_readexactly_concurrency_race():
    """Q: a second read on a stream another coroutine is already draining."""
    exc = RuntimeError(
        "readexactly() called while another coroutine is already waiting for incoming data"
    )
    record = _send_loop_record("Unexpected exception in the receive loop", exc)

    assert TelethonTransportNoiseFilter().filter(record) is True
    assert record.levelno == logging.WARNING


def test_filter_covers_every_exception_log_telethon_emits():
    """Guard against drift: Telethon logs at exception level in exactly these
    two places, and both must be covered or they reach Sentry as errors."""
    import inspect
    import re

    import telethon.network.connection.connection as conn

    logged = set(re.findall(r"_log\.exception\('([^']+)'", inspect.getsource(conn.Connection)))

    assert logged, "could not read Telethon's source; test would pass vacuously"
    assert logged <= set(_BENIGN_LOOP_MESSAGES), (
        f"Telethon logs {logged - set(_BENIGN_LOOP_MESSAGES)} at exception level "
        "but the filter does not cover it"
    )


def test_sentry_before_send_keeps_auth_key_invalid_buffer():
    """An InvalidBufferError with code 404 means the auth key is gone.

    Telethon logs "Server does not know about the current auth key; the session
    may need to be recreated" and then disconnects. Dropping that event removes
    the only signal that an account's session is dead, so it must survive
    before_send even though every other InvalidBufferError is teardown noise.
    """
    import struct

    from telethon.errors import InvalidBufferError

    from app.utils.log_filters import sentry_before_send

    # 404 = auth key unknown -> operator must re-login the account.
    # InvalidBufferError derives .code from the 4-byte payload, so the code has
    # to be packed in; assigning .code afterwards leaves the message saying 0.
    auth_gone = InvalidBufferError(struct.pack("<i", -404))
    event = {"exception": {"values": [{"type": "InvalidBufferError", "value": str(auth_gone)}]}}
    assert sentry_before_send(event, {"exc_info": (InvalidBufferError, auth_gone, None)}) is not None

    serialised = {"exception": {"values": [{"type": "InvalidBufferError", "value": "auth key not found"}]}}
    assert sentry_before_send(serialised, {}) is not None

    # The serialised form carries no exception object, only the rendered text.
    serialised_404 = {
        "exception": {
            "values": [{"type": "InvalidBufferError", "value": "Invalid response buffer (HTTP code 404)"}]
        }
    }
    assert sentry_before_send(serialised_404, {}) is not None

    # A plain transport race stays suppressed (PYTHON-FASTAPI-50 / 4Z).
    blip = InvalidBufferError(struct.pack("<i", 0))
    noise = {"exception": {"values": [{"type": "InvalidBufferError", "value": str(blip)}]}}
    assert sentry_before_send(noise, {"exc_info": (InvalidBufferError, blip, None)}) is None


def test_log_filter_does_not_silence_auth_key_404():
    """The log-level filter must leave a 404 InvalidBufferError at ERROR.

    The demotion list exists for teardown races Telethon recovers from. A 404
    is not recoverable: Telegram has forgotten the auth key and the account
    needs re-login, so demoting it to WARNING would hide a dead session from
    both logs and Sentry.
    """
    import struct

    from telethon.errors import InvalidBufferError

    from app.utils.log_filters import TelethonTransportNoiseFilter

    flt = TelethonTransportNoiseFilter()

    auth_gone = InvalidBufferError(struct.pack("<i", -404))
    rec_404 = logging.LogRecord(
        name="telethon.network.mtprotosender",
        level=logging.ERROR,
        pathname="mtprotosender.py",
        lineno=541,
        msg="Unhandled error while receiving data",
        args=(),
        exc_info=(InvalidBufferError, auth_gone, None),
    )
    assert flt.filter(rec_404) is True
    assert rec_404.levelno == logging.ERROR, "404 auth-key loss must stay reportable"

    # Control: an ordinary transport race is still demoted.
    blip = InvalidBufferError(struct.pack("<i", 0))
    rec_blip = logging.LogRecord(
        name="telethon.network.mtprotosender",
        level=logging.ERROR,
        pathname="mtprotosender.py",
        lineno=541,
        msg="Unhandled error while receiving data",
        args=(),
        exc_info=(InvalidBufferError, blip, None),
    )
    assert flt.filter(rec_blip) is True
    assert rec_blip.levelno == logging.WARNING
