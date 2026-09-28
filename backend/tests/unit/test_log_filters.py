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
