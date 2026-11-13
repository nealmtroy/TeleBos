"""Regression tests for the 2026-10-29 Sentry Patch Audit (19 issues)."""

import logging
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.config import get_settings
from app.services.chat_service import _upsert_telegram_chats, resolve_chat_entity
from app.services.klikqris_service import create_qris_transaction
from app.services.uptimerobot_status import MonitorInfo, UptimeRobotService, UptimeStatus
from app.utils.log_filters import TelethonTransportNoiseFilter
from app.utils.redis import redis_blocking_client, redis_client


@pytest.mark.asyncio
async def test_upsert_telegram_chats_deterministic_lock_ordering():
    """PYTHON-FASTAPI-3J: _upsert_telegram_chats must deduplicate and sort by (account_id, chat_id)."""
    acc_b = uuid.UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
    acc_a = uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")

    executed_Statements = []
    db = AsyncMock()

    async def capture_execute(stmt):
        executed_Statements.append(stmt)

    db.execute = AsyncMock(side_effect=capture_execute)

    unsorted_rows = [
        {"id": uuid.uuid4(), "account_id": acc_b, "chat_id": 300, "title": "B-300", "type": "user"},
        {"id": uuid.uuid4(), "account_id": acc_a, "chat_id": 500, "title": "A-500-old", "type": "user"},
        {"id": uuid.uuid4(), "account_id": acc_a, "chat_id": 100, "title": "A-100", "type": "user"},
        {"id": uuid.uuid4(), "account_id": acc_a, "chat_id": 500, "title": "A-500-new", "type": "user"},
    ]

    await _upsert_telegram_chats(db, unsorted_rows)
    assert len(executed_Statements) == 1
    compiled = executed_Statements[0].compile()
    params = compiled.params
    # Verify 3 deduplicated rows sorted as (acc_a, 100), (acc_a, 500), (acc_b, 300)
    assert params["account_id_m0"] == acc_a
    assert params["chat_id_m0"] == 100
    assert params["account_id_m1"] == acc_a
    assert params["chat_id_m1"] == 500
    assert params["title_m1"] == "A-500-new"
    assert params["account_id_m2"] == acc_b
    assert params["chat_id_m2"] == 300


def test_redis_blocking_client_timeout_exceeds_command_bus_wait():
    """PYTHON-FASTAPI-3G: redis_blocking_client socket_timeout must exceed 30s BLPOP wait."""
    blocking_kwargs = redis_blocking_client.connection_pool.connection_kwargs
    regular_kwargs = redis_client.connection_pool.connection_kwargs
    assert blocking_kwargs.get("socket_timeout", 0) >= 60.0
    assert regular_kwargs.get("socket_timeout", 0) >= 10.0
    # PYTHON-FASTAPI-3G pinned the literal 64, but that ceiling was itself the
    # bug: the worker's publish fan-out hit it and redis-py raised
    # MaxConnectionsError ("Too many connections"). Assert the contract instead
    # of the old magic number.
    assert redis_client.connection_pool.max_connections == get_settings().REDIS_MAX_CONNECTIONS
    assert redis_client.connection_pool.max_connections > 64
    assert redis_blocking_client.connection_pool.max_connections == 32


def test_telethon_transport_noise_filter_demotes_mtprotosender_readexactly():
    """PYTHON-FASTAPI-Q: mtprotosender 'Unhandled error while receiving data' + readexactly() demoted to WARNING."""
    flt = TelethonTransportNoiseFilter()
    try:
        raise RuntimeError("readexactly() called while another coroutine is already waiting for incoming data")
    except RuntimeError as exc:
        record = logging.LogRecord(
            name="telethon.network.mtprotosender",
            level=logging.ERROR,
            pathname="mtprotosender.py",
            lineno=528,
            msg="Unhandled error while receiving data",
            args=(),
            exc_info=(type(exc), exc, exc.__traceback__),
        )
    assert flt.filter(record) is True
    assert record.levelno == logging.WARNING
    assert record.levelname == "WARNING"


def test_telethon_transport_noise_filter_demotes_invalid_buffer_error():
    """PYTHON-FASTAPI-50 / 4Z: mtprotosender 'Server sent invalid buffer' + InvalidBufferError demoted to WARNING."""
    from telethon.errors import InvalidBufferError

    flt = TelethonTransportNoiseFilter()
    try:
        raise InvalidBufferError(b"\x00\x00\x00\x00")
    except InvalidBufferError as exc:
        record = logging.LogRecord(
            name="telethon.network.mtprotosender",
            level=logging.ERROR,
            pathname="mtprotosender.py",
            lineno=525,
            msg="Server sent invalid buffer",
            args=(),
            exc_info=(type(exc), exc, exc.__traceback__),
        )
    assert flt.filter(record) is True
    assert record.levelno == logging.WARNING
    assert record.levelname == "WARNING"


@pytest.mark.asyncio
async def test_resolve_chat_entity_strips_minus_100_mark_for_channel():
    """PYTHON-FASTAPI-3N: Marked channel ID -1002218724679 must resolve to positive InputPeerChannel(2218724679)."""
    client = AsyncMock()
    client.get_input_entity = AsyncMock(side_effect=ValueError("cache miss"))

    session = AsyncMock()
    session.execute = AsyncMock(return_value=SimpleNamespace(first=lambda: (987654321, "supergroup")))
    session_ctx = AsyncMock()
    session_ctx.__aenter__ = AsyncMock(return_value=session)
    session_ctx.__aexit__ = AsyncMock(return_value=False)

    with patch("app.database.async_session_factory", return_value=session_ctx):
        peer = await resolve_chat_entity(
            client, uuid.UUID("4e6bca80-2adc-416f-97c3-e71a28493596"), -1002218724679
        )

    assert peer.channel_id == 2218724679
    assert peer.access_hash == 987654321


@pytest.mark.asyncio
async def test_device_service_terminate_all_other_sessions_uses_command_bus(monkeypatch):
    """PYTHON-FASTAPI-35: terminate_all_other_sessions must dispatch via execute_telegram_command when enabled."""
    from app.config import get_settings
    from app.services import device_service

    settings = get_settings()
    monkeypatch.setattr(settings, "ENABLE_TELEGRAM_COMMAND_BUS", True)
    monkeypatch.setattr(device_service.client_pool, "is_worker", False, raising=False)

    account = SimpleNamespace(id=uuid.uuid4(), session_string="encrypted")
    mock_cmd = AsyncMock(return_value={"success": True})

    with patch("app.services.telegram_command_bus.execute_telegram_command", mock_cmd):
        await device_service.terminate_all_other_sessions(account)

    mock_cmd.assert_awaited_once_with(
        account_id=str(account.id),
        action="terminate_all_other_sessions",
    )


@pytest.mark.asyncio
async def test_klikqris_handles_non_json_502_body_without_json_decode_error(monkeypatch):
    """PYTHON-FASTAPI-4Y / 4K: Non-JSON HTML/whitespace gateway error must not raise JSONDecodeError."""
    from app.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "KLIKQRIS_API_KEY", "mock_key")
    monkeypatch.setattr(settings, "KLIKQRIS_ID_MERCHANT", "12345")

    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_client.is_closed = False

    fake_resp = MagicMock(spec=httpx.Response)
    fake_resp.status_code = 502
    fake_resp.content = b"<html>502 Bad Gateway</html>"
    fake_resp.text = "<html>502 Bad Gateway</html>"
    fake_resp.json.side_effect = ValueError("Expecting value: line 1 column 1 (char 0)")
    mock_client.post.return_value = fake_resp

    with (
        patch("app.services.klikqris_service.is_paymenku_configured", return_value=False),
        patch("app.services.klikqris_service.get_klikqris_http_client", return_value=mock_client),
    ):
        with pytest.raises(RuntimeError, match="HTTP 502"):
            await create_qris_transaction("TB-TEST-502", 50000)


@pytest.mark.asyncio
async def test_uptimerobot_preserves_cache_on_upstream_500(monkeypatch):
    """PYTHON-FASTAPI-4X: UptimeRobot 500 HTTPStatusError logs warning and returns unknown without crashing."""
    from app.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "UPTIMEROBOT_API_KEY", "ur-mock-key")

    svc = UptimeRobotService()
    svc._cache = UptimeStatus(
        overall="up",
        monitors=[
            MonitorInfo(
                id=1,
                friendly_name="API",
                url="https://telebos.app",
                status="up",
                under_maintenance=False,
                status_code=2,
            )
        ],
    )

    request = httpx.Request("POST", "https://api.uptimerobot.com/v2/getMonitors")
    response = httpx.Response(500, request=request)
    http_err = httpx.HTTPStatusError("Server error '500 Internal Server Error'", request=request, response=response)

    with patch("httpx.AsyncClient.post", AsyncMock(side_effect=http_err)):
        res = await svc._fetch()
        assert res.overall == "unknown"


def test_asyncio_noise_filter_and_sentry_before_send_drop_benign_telethon_noise():
    """PYTHON-FASTAPI-5A / 50 / 4Z: pending _handle_auto_reconnect and InvalidBufferError dropped."""
    from telethon.errors import InvalidBufferError
    from app.utils.log_filters import AsyncioTransportNoiseFilter, sentry_before_send

    flt = AsyncioTransportNoiseFilter()
    rec = logging.LogRecord(
        name="asyncio",
        level=logging.ERROR,
        pathname="base_events.py",
        lineno=1785,
        msg="Task was destroyed but it is pending!\ntask: <Task pending coro=<UpdateMethods._handle_auto_reconnect()>>",
        args=(),
        exc_info=None,
    )
    assert flt.filter(rec) is True
    assert rec.levelno == logging.WARNING

    assert sentry_before_send({"message": "noise"}, {"log_record": rec}) is None

    try:
        raise InvalidBufferError(b"\x00\x00\x00\x00")
    except InvalidBufferError as exc:
        import sys
        assert sentry_before_send({"exception": {}}, {"exc_info": sys.exc_info()}) is None

    normal_event = {"exception": {"values": [{"type": "ValueError", "value": "real bug"}]}}
    assert sentry_before_send(normal_event, {}) == normal_event


@pytest.mark.asyncio
async def test_chat_service_get_dialogs_flood_wait_demoted_to_warning(caplog):
    """PYTHON-FASTAPI-31: FloodWaitError during get_dialogs folder 0 logs warning, not error."""
    from app.services.chat_service import _sync_all_chats_to_db_locked

    class FakeFloodWaitError(Exception):
        seconds = 12

    fake_client = MagicMock()
    fake_client.get_dialogs = AsyncMock(
        side_effect=FakeFloodWaitError("A wait of 12 seconds is required (caused by GetDialogsRequest)")
    )
    account = SimpleNamespace(id=uuid.uuid4(), phone="+62811111111")
    db = AsyncMock()

    with (
        patch("app.services.chat_service.get_active_client", AsyncMock(return_value=fake_client)),
        caplog.at_level(logging.WARNING),
    ):
        res = await _sync_all_chats_to_db_locked(account, db)

    assert res == []
    assert not any(r.levelno >= logging.ERROR for r in caplog.records)
    assert any("FloodWait" in r.getMessage() for r in caplog.records)


@pytest.mark.asyncio
async def test_reg_date_service_flood_wait_demoted_to_warning(caplog):
    """PYTHON-FASTAPI-33: FloodWaitError during sync_datapoints_from_account logs warning and returns count."""
    from app.services.telegram_reg_date_service import TelegramRegDateService

    class FakeFloodWaitError(Exception):
        seconds = 17

    async def failing_iter_dialogs(limit=100):
        raise FakeFloodWaitError("A wait of 17 seconds is required (caused by GetDialogsRequest)")
        yield  # pragma: no cover

    fake_client = MagicMock()
    fake_client.iter_dialogs = failing_iter_dialogs
    account = SimpleNamespace(id=uuid.uuid4(), phone="+62811111111")
    db = AsyncMock()
    db.get = AsyncMock(return_value=account)

    svc = TelegramRegDateService()
    with (
        patch("app.services.telegram_reg_date_service.get_active_client", AsyncMock(return_value=fake_client)),
        caplog.at_level(logging.WARNING),
    ):
        count = await svc.sync_datapoints_from_account(db, account.id, limit=100)

    assert count == 0
    assert not any(r.levelno >= logging.ERROR for r in caplog.records)


@pytest.mark.asyncio
async def test_appeal_service_groq_fallback_tries_next_model_and_logs_warning(monkeypatch, caplog):
    """PYTHON-FASTAPI-2W: Groq 400/429 on one model tries next candidate and logs warning on fallback."""
    from app.config import get_settings
    from app.services import appeal_service

    settings = get_settings()
    monkeypatch.setattr(settings, "GROQ_API_KEY_1", "gsk_test_1")
    for idx in range(2, 8):
        monkeypatch.setattr(settings, f"GROQ_API_KEY_{idx}", "")

    resp_fail = MagicMock()
    resp_fail.status_code = 400
    resp_fail.text = "model decommissioned"

    with (
        patch("httpx.AsyncClient.post", AsyncMock(return_value=resp_fail)) as mock_post,
        caplog.at_level(logging.WARNING),
    ):
        reason = await appeal_service.generate_ai_appeal_reason("ai_indonesian")

    assert mock_post.await_count >= 2
    assert "moderator" in reason.lower()
    assert not any(r.levelno >= logging.ERROR for r in caplog.records)


