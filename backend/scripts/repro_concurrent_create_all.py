"""Reproduce PYTHON-FASTAPI-2P: concurrent create_all races on CREATE INDEX.

The production crash was:
    ProgrammingError: relation "ix_security_audit_logs_action" already exists
    [SQL: CREATE INDEX ix_security_audit_logs_action ON security_audit_logs (action)]

create_all is metadata-driven and emits plain CREATE INDEX for any Index()
declared in a model. Two processes reaching startup together (backend being
recreated while an old one still finishes, or a sharded runner profile) both
run it; neither statement is idempotent, so the loser dies and takes the whole
_init_db retry loop down with it -> "Application startup failed. Exiting."

This script drives the real model metadata against a real Postgres so the
failure is observed, not asserted from theory.
"""
import asyncio
import sys

from sqlalchemy.ext.asyncio import create_async_engine

from app.database import Base
import app.models  # noqa: F401  (register all mappers)

DSN = sys.argv[1]


async def create_all_once(tag: str, barrier: asyncio.Barrier) -> str:
    engine = create_async_engine(DSN, poolclass=None)
    try:
        await barrier.wait()  # maximise overlap
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        return f"{tag}:OK"
    except Exception as exc:  # noqa: BLE001
        name = type(exc).__name__
        msg = str(exc).splitlines()[0][:160]
        return f"{tag}:FAIL {name}: {msg}"
    finally:
        await engine.dispose()


async def main() -> int:
    n = 4
    barrier = asyncio.Barrier(n)
    results = await asyncio.gather(*(create_all_once(f"w{i}", barrier) for i in range(n)))
    for r in results:
        print(r)
    failures = [r for r in results if ":FAIL" in r]
    print(f"\nfailures={len(failures)}/{n}")
    return 0 if failures else 2


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
