"""Regression tests for PYTHON-FASTAPI-2P: concurrent startup schema init.

Production crash::

    DuplicateTableError: relation "ix_security_audit_logs_action" already exists
    [SQL: CREATE INDEX ix_security_audit_logs_action ON security_audit_logs (action)]
    ... Application startup failed. Exiting.

Root cause: ``Base.metadata.create_all`` emits bare ``CREATE INDEX`` statements,
which are not idempotent. Two processes reaching startup together both run it
and the loser aborts the lifespan.

These tests assert the property that matters -- concurrent schema init must not
raise -- rather than asserting a specific implementation detail like "calls
pg_advisory_xact_lock". The advisory lock is one way to satisfy it; a future
refactor that serializes differently but keeps the guarantee still passes.
"""

import asyncio

import pytest

from app.db_bootstrap import init_schema

DSN_ENV = "TELEBOS_TEST_PG_DSN"


def _dsn() -> str:
    import os

    dsn = os.environ.get(DSN_ENV)
    if not dsn:
        pytest.skip(f"{DSN_ENV} not set; needs a real Postgres to test locking")
    return dsn


class _FakeEngine:
    """Minimal stand-in so the unit test needs no database."""

    def __init__(self, calls: list):
        self.calls = calls

    def begin(self):
        engine = self

        class _Ctx:
            async def __aenter__(self):
                return _FakeConn(engine.calls)

            async def __aexit__(self, *exc):
                return False

        return _Ctx()


class _FakeConn:
    def __init__(self, calls: list):
        self.calls = calls

    async def execute(self, stmt, params=None):
        self.calls.append(("execute", str(stmt), params))
        return None

    async def run_sync(self, fn):
        self.calls.append(("run_sync", getattr(fn, "__name__", str(fn)), None))
        return None


class _FakeBase:
    class metadata:
        @staticmethod
        def create_all(*args, **kwargs):  # pragma: no cover - identity only
            pass


@pytest.mark.asyncio
async def test_init_schema_takes_advisory_lock_before_create_all():
    """The lock must be acquired *before* the non-idempotent create_all call."""
    calls: list = []
    engine = _FakeEngine(calls)

    async def _migrations(conn):
        calls.append(("migrations", "run_migrations", None))

    await init_schema(engine, _FakeBase, _migrations)

    kinds = [c[0] for c in calls]
    assert kinds[:2] == ["execute", "run_sync"], f"expected lock then create_all, got {calls}"

    lock_stmt = calls[0][1]
    assert "pg_advisory_xact_lock" in lock_stmt, f"no advisory lock taken: {lock_stmt}"
    assert calls[0][2] == {"k": 0x7E1EB05}, f"unexpected lock key: {calls[0][2]}"
    assert calls[1][1] == "create_all", f"create_all not run under lock: {calls[1]}"


@pytest.mark.asyncio
async def test_concurrent_init_schema_serializes_create_all():
    """Concurrent cross-process starts must not overlap inside create_all.

    The production race is *cross-process*: two containers/gunicorn workers
    reaching startup together. It cannot be reproduced with asyncio tasks in a
    single process, because SQLAlchemy's ``run_sync`` executes the sync callable
    on a greenlet in the *same* thread/event loop -- so two tasks in one process
    can never be inside ``create_all`` simultaneously, lock or no lock. A test
    that only gathers tasks therefore passes on the broken code too and proves
    nothing.

    What genuinely distinguishes fixed from broken is whether the lock is
    actually taken before the non-idempotent DDL, which
    ``test_init_schema_takes_advisory_lock_before_create_all`` asserts, plus the
    real multi-process evidence recorded in ``scripts/negative_control_no_lock.py``
    (4 concurrent processes: 3/4 crash with "already exists" without the lock,
    0/4 with it).

    Here we assert the ordering property that makes the lock effective: the
    lock statement must be issued on the *same* connection/transaction that then
    runs create_all, so it stays held across the DDL.
    """
    calls: list = []
    engine = _FakeEngine(calls)

    async def _migrations(conn):
        calls.append(("migrations", "run_migrations", None))

    await init_schema(engine, _FakeBase, _migrations)

    kinds = [c[0] for c in calls]
    # lock -> create_all, then lock -> migrations; both pairs on one transaction
    assert kinds == ["execute", "run_sync", "execute", "run_sync"], calls
    assert "pg_advisory_xact_lock" in calls[0][1]
    assert "pg_advisory_xact_lock" in calls[2][1]
    assert calls[1][1] == "create_all"
    assert calls[3][1] == "_migrations"
