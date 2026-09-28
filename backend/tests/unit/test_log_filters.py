"""Tests for benign third-party log noise filters (PYTHON-FASTAPI-G)."""

import logging

import pytest

from app.utils.log_filters import TelethonTransportNoiseFilter


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
