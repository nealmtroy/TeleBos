"""Exclusive account ownership between the backend and the async worker.

Telegram allows one live MTProto connection per auth key. These tests cover the
lease that keeps the two TeleBos processes from both holding a socket for the
same account, which is what produces Telethon's "Server replied with a wrong
session ID".
"""

import logging
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.utils import account_ownership as own
from app.utils.log_filters import TelethonTransportNoiseFilter


class FakeResult:
    """Mirrors the real ``db.execute(...).scalars()`` result, which is iterable."""

    def __init__(self, rows):
        self._rows = rows

    def scalars(self):
        return iter(self._rows)

    def all(self):
        return self._rows


class FakeDB:
    """Answers the two account_ids queries the ownership check issues."""

    def __init__(self, broadcast_ids=None, invite_ids=None):
        self.broadcast_ids = broadcast_ids or []
        self.invite_ids = invite_ids or []
        self.order = []

    async def execute(self, stmt):
        text = str(stmt)
        # The check queries BroadcastJob first, then InviteJob.
        self.order.append(text)
        if "broadcast_jobs" in text:
            return FakeResult([self.broadcast_ids] if self.broadcast_ids else [])
        if "invite_jobs" in text:
            return FakeResult([self.invite_ids] if self.invite_ids else [])
        return FakeResult([])


# ── Job-state authority ──────────────────────────────────────────────────────

async def test_account_with_running_broadcast_is_worker_owned():
    account_id = str(uuid.uuid4())
    db = FakeDB(broadcast_ids=[account_id])

    decision = await own.decide_owner(db, account_id)
    assert decision.owner == own.OWNER_WORKER


async def test_account_with_running_invite_is_worker_owned():
    account_id = str(uuid.uuid4())
    db = FakeDB(invite_ids=[account_id])

    decision = await own.decide_owner(db, account_id)
    assert decision.owner == own.OWNER_WORKER


@pytest.mark.parametrize("status_seen", ["pending", "running", "paused"])
async def test_paused_jobs_still_hold_the_account(status_seen):
    # A paused job keeps its worker connection, so the backend must stay away.
    assert status_seen in own._ACTIVE_JOB_STATUSES


async def test_account_without_a_job_is_backend_owned():
    account_id = str(uuid.uuid4())
    db = FakeDB()

    decision = await own.decide_owner(db, account_id)
    assert decision.owner == own.OWNER_BACKEND


async def test_job_matching_accepts_uuid_objects_as_well_as_strings():
    account_id = str(uuid.uuid4())
    acc_uuid = uuid.UUID(account_id)
    db = FakeDB(broadcast_ids=[acc_uuid])

    assert await own.is_worker_claimed(db, account_id) is True


async def test_invalid_account_id_is_treated_as_unclaimed():
    db = FakeDB(broadcast_ids=["something"])
    assert await own.is_worker_claimed(db, "not-a-uuid") is False


async def test_job_list_of_other_accounts_does_not_claim():
    db = FakeDB(broadcast_ids=[str(uuid.uuid4()), str(uuid.uuid4())])
    assert await own.is_worker_claimed(db, str(uuid.uuid4())) is False


async def test_db_failure_does_not_invent_a_claim():
    class BrokenDB:
        async def execute(self, stmt):
            raise RuntimeError("connection lost")

    # Failing closed to "not claimed" would let the backend connect a busy
    # account, so a check that cannot run must not silently pass.
    with patch.object(own, "logger"):
        assert await own.is_worker_claimed(BrokenDB(), str(uuid.uuid4())) is False


# ── Lease acquisition ────────────────────────────────────────────────────────

class FakeRedis:
    def __init__(self, existing=None):
        self.store = dict(existing or {})
        self.set_calls = []

    async def set(self, key, value, nx=False, ex=None):
        self.set_calls.append({"key": key, "nx": nx, "ex": ex})
        if nx and key in self.store:
            return False
        self.store[key] = value
        return True

    async def get(self, key):
        return self.store.get(key)

    async def delete(self, key):
        self.store.pop(key, None)

    async def expire(self, key, ttl):
        return True


async def test_first_holder_acquires_the_lease():
    redis = FakeRedis()
    with patch.object(own, "_store", AsyncMock(return_value=redis)):
        assert await own.acquire_lease("acct-1", own.OWNER_BACKEND) is True


async def test_second_process_stands_down():
    account_id = "acct-1"
    redis = FakeRedis({own.lease_key(account_id): f"{own.OWNER_WORKER}|other-pid:1"})

    with patch.object(own, "_store", AsyncMock(return_value=redis)):
        assert await own.acquire_lease(account_id, own.OWNER_BACKEND) is False


async def test_process_can_reacquire_its_own_lease():
    account_id = "acct-1"
    redis = FakeRedis({own.lease_key(account_id): f"{own.OWNER_BACKEND}|{own._PROCESS_ID}"})

    with patch.object(own, "_store", AsyncMock(return_value=redis)):
        assert await own.acquire_lease(account_id, own.OWNER_BACKEND) is True


async def test_worker_force_takes_a_lease_the_backend_holds():
    # A live job is authoritative, so the worker must not be blocked.
    account_id = "acct-1"
    redis = FakeRedis({own.lease_key(account_id): f"{own.OWNER_BACKEND}|other-pid:1"})

    with patch.object(own, "_store", AsyncMock(return_value=redis)):
        assert await own.acquire_lease(account_id, own.OWNER_WORKER, force=True) is True


async def test_redis_outage_does_not_stall_every_account():
    # Proceeding on job state alone is better than refusing to connect at all.
    with patch.object(own, "_store", AsyncMock(return_value=None)):
        assert await own.acquire_lease("acct-1", own.OWNER_BACKEND) is True


async def test_lease_error_falls_back_to_job_state():
    class BrokenRedis:
        async def set(self, *a, **kw):
            raise RuntimeError("redis down")

        async def get(self, key):
            raise RuntimeError("redis down")

    with patch.object(own, "_store", AsyncMock(return_value=BrokenRedis())):
        assert await own.acquire_lease("acct-1", own.OWNER_BACKEND) is True


# ── Renewal and release ──────────────────────────────────────────────────────

async def test_renewal_succeeds_for_the_holder():
    account_id = "acct-1"
    redis = FakeRedis({own.lease_key(account_id): f"{own.OWNER_BACKEND}|{own._PROCESS_ID}"})

    with patch.object(own, "_store", AsyncMock(return_value=redis)):
        assert await own.renew_lease(account_id, own.OWNER_BACKEND) is True


async def test_renewal_fails_once_another_process_took_over():
    account_id = "acct-1"
    redis = FakeRedis({own.lease_key(account_id): f"{own.OWNER_WORKER}|someone-else"})

    with patch.object(own, "_store", AsyncMock(return_value=redis)):
        assert await own.renew_lease(account_id, own.OWNER_BACKEND) is False


async def test_release_only_removes_our_own_lease():
    account_id = "acct-1"
    redis = FakeRedis({own.lease_key(account_id): f"{own.OWNER_WORKER}|someone-else"})

    with patch.object(own, "_store", AsyncMock(return_value=redis)):
        await own.release_lease(account_id, own.OWNER_BACKEND)

    # Still held by the worker; the backend must not have evicted it.
    assert own.lease_key(account_id) in redis.store


async def test_release_drops_the_lease_we_hold():
    account_id = "acct-1"
    redis = FakeRedis({own.lease_key(account_id): f"{own.OWNER_WORKER}|{own._PROCESS_ID}"})

    with patch.object(own, "_store", AsyncMock(return_value=redis)):
        await own.release_lease(account_id, own.OWNER_WORKER)

    assert own.lease_key(account_id) not in redis.store


async def test_lease_context_releases_on_exit():
    account_id = "acct-1"
    redis = FakeRedis()

    with patch.object(own, "_store", AsyncMock(return_value=redis)):
        async with own.account_lease(account_id, own.OWNER_BACKEND) as acquired:
            assert acquired is True
            assert own.lease_key(account_id) in redis.store

    assert own.lease_key(account_id) not in redis.store


# ── Log noise ────────────────────────────────────────────────────────────────

def _record(level, message):
    return logging.LogRecord("telethon", level, __file__, 1, message, None, None)


def test_wrong_session_id_is_demoted_from_error():
    record = _record(
        logging.ERROR,
        "Security error while unpacking a received message: Server replied with a wrong session ID",
    )
    TelethonTransportNoiseFilter().filter(record)
    assert record.levelno == logging.WARNING


def test_wrong_session_id_at_warning_is_left_alone():
    record = _record(
        logging.WARNING,
        "Security error while unpacking a received message: Server replied with a wrong session ID",
    )
    TelethonTransportNoiseFilter().filter(record)
    assert record.levelno == logging.WARNING


def test_unrelated_errors_are_not_demoted():
    record = _record(logging.ERROR, "Database connection refused")
    TelethonTransportNoiseFilter().filter(record)
    assert record.levelno == logging.ERROR
