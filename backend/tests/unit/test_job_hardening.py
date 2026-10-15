"""Hardening tests: log_destination validation, retry reset, invite plan cap."""

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from pydantic import ValidationError

from app.schemas.broadcast import BroadcastStartRequest


def _req(**kw):
    return BroadcastStartRequest(
        account_ids=[uuid.uuid4()], group_list_id=uuid.uuid4(), **kw
    )


# ── B7: log_destination validation ───────────────────────────────────────────


def test_log_destination_rejects_overlong_value():
    with pytest.raises(ValidationError):
        _req(log_destination="x" * 256)


def test_log_destination_rejects_whitespace():
    with pytest.raises(ValidationError):
        _req(log_destination="foo bar")


def test_log_destination_trims_and_keeps_web_only():
    assert _req(log_destination="  web_only  ").log_destination == "web_only"


def test_log_destination_blank_becomes_none():
    assert _req(log_destination="   ").log_destination is None


def test_log_destination_accepts_username():
    assert _req(log_destination="@channel").log_destination == "@channel"


# ── B4: broadcast retry clears target bookkeeping ────────────────────────────


@pytest.mark.asyncio
async def test_retry_broadcast_clears_target_bookkeeping():
    from app.services import broadcast_service as bs

    user = MagicMock()
    user.id = uuid.uuid4()
    user.role = "pro"
    job = MagicMock()
    job.status = "completed"
    job.permanent_failures = ["t1"]
    job.pending_items = [{"k": "t2"}]

    db = AsyncMock()
    res = MagicMock()
    res.scalar_one_or_none.return_value = job
    db.execute = AsyncMock(return_value=res)

    with patch.object(bs, "_dispatch_broadcast", AsyncMock()), patch(
        "app.services.redeem_service.is_subscription_active", return_value=True
    ), patch(
        "app.services.redeem_service.auto_downgrade_if_expired", AsyncMock()
    ), patch(
        "app.services.broadcast_entitlement.enforce_broadcast_allowance", AsyncMock()
    ):
        await bs.retry_job(db, str(uuid.uuid4()), str(user.id), user=user)

    assert job.permanent_failures == []
    assert job.pending_items == []
    assert job.status == "running"


# ── D2: invite sender-account cap ────────────────────────────────────────────


@pytest.mark.asyncio
async def test_start_invite_rejects_too_many_accounts_for_plan():
    from app.services import invite_service as inv

    user = MagicMock()
    user.id = uuid.uuid4()
    user.role = "pro"  # limit 3
    accounts = [MagicMock(id=uuid.uuid4()) for _ in range(4)]

    db = AsyncMock()
    with patch(
        "app.services.account_service.get_account",
        AsyncMock(side_effect=list(accounts)),
    ), patch(
        "app.utils.account_ownership.find_busy_accounts", AsyncMock(return_value=[])
    ):
        with pytest.raises(ValueError):
            await inv.start_invite(
                db,
                user,
                [str(a.id) for a in accounts],
                "dest",
                "username",
                [{"type": "username", "value": "src"}],
                30,
                0,
                10,
            )


@pytest.mark.asyncio
async def test_start_invite_allows_within_plan_limit():
    from app.services import invite_service as inv

    user = MagicMock()
    user.id = uuid.uuid4()
    user.role = "pro"  # limit 3
    accounts = [MagicMock(id=uuid.uuid4()) for _ in range(3)]

    db = AsyncMock()
    with patch(
        "app.services.account_service.get_account",
        AsyncMock(side_effect=list(accounts)),
    ), patch(
        "app.utils.account_ownership.find_busy_accounts", AsyncMock(return_value=[])
    ), patch.object(inv, "_dispatch_invite", AsyncMock()):
        job = await inv.start_invite(
            db,
            user,
            [str(a.id) for a in accounts],
            "dest",
            "username",
            [{"type": "username", "value": "src"}],
            30,
            0,
            10,
        )

    assert job.account_ids == [str(a.id) for a in accounts]


# ── B8: cycle buffer cleared only after the write is durable ─────────────────


class _ScalarOne:
    def __init__(self, val):
        self._val = val

    def scalar_one_or_none(self):
        return self._val


class _FakeDB:
    def __init__(self, job):
        self.job = job
        self.committed = False

    async def execute(self, stmt):
        if "broadcast_jobs" in str(stmt):
            return _ScalarOne(self.job)
        return _ScalarOne(None)  # no existing cycle log

    def add(self, obj):
        pass

    async def commit(self):
        self.committed = True


class _Ctx:
    def __init__(self, db):
        self.db = db

    async def __aenter__(self):
        return self.db

    async def __aexit__(self, *exc):
        return False


@pytest.mark.asyncio
async def test_flush_cycle_logs_clears_buffer_only_after_commit():
    from app.services import broadcast_service as bs

    job = MagicMock()
    job.id = uuid.uuid4()
    job.user_id = uuid.uuid4()
    db = _FakeDB(job)
    details = [{"status": "success", "send_ms": 1000}]

    with patch("app.database.async_session_factory", lambda: _Ctx(db)):
        await bs._flush_cycle_logs(job.id, 1, details, sent=1, total_groups=1)

    assert db.committed is True
    assert details == []


@pytest.mark.asyncio
async def test_flush_cycle_logs_drops_buffer_when_job_is_gone():
    from app.services import broadcast_service as bs

    db = _FakeDB(None)
    details = [{"status": "success", "send_ms": 1000}]

    with patch("app.database.async_session_factory", lambda: _Ctx(db)):
        await bs._flush_cycle_logs(uuid.uuid4(), 1, details, sent=1)

    assert db.committed is False
    assert details == []


# ── B6: malformed UUID path params are rejected at the edge ──────────────────


def test_uuid_path_rejects_malformed_id():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from app.dependencies import UuidPath

    app = FastAPI()

    @app.get("/x/{job_id}")
    async def _get(job_id: UuidPath):
        return {"job_id": job_id}

    client = TestClient(app)
    assert client.get("/x/not-a-uuid").status_code == 422
    assert client.get("/x/123").status_code == 422

    valid = str(uuid.uuid4())
    resp = client.get(f"/x/{valid}")
    assert resp.status_code == 200
    assert resp.json()["job_id"] == valid


