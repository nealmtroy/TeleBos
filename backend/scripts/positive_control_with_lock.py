"""Positive control for PYTHON-FASTAPI-2P: real multi-process startup.

Mirrors ``negative_control_no_lock.py`` but goes through ``init_schema`` (the
fixed path, which takes a Postgres advisory lock) instead of calling
``create_all`` directly.

Run::

    python scripts/positive_control_with_lock.py "postgresql+asyncpg://..."

Expected: failures=0/N on a fresh database, every time. The negative control
(no lock) produces 3/4 failures on the same schema, which is the production
crash.
"""

import asyncio
import multiprocessing as mp
import sys

from sqlalchemy.ext.asyncio import create_async_engine

from app.database import Base
import app.models  # noqa: F401  (register mappers)
from app.db_bootstrap import init_schema


def _worker(dsn: str, idx: int, barrier, q) -> None:
    async def run() -> None:
        engine = create_async_engine(dsn)
        try:
            await asyncio.to_thread(barrier.wait)
            await init_schema(engine, Base, lambda conn: None)
            q.put((idx, "OK"))
        except Exception as exc:  # noqa: BLE001
            q.put((idx, f"{type(exc).__name__}: {exc}"))
        finally:
            await engine.dispose()

    asyncio.run(run())


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: positive_control_with_lock.py <dsn>")
        return 2
    dsn = sys.argv[1]
    n = 4
    barrier = mp.Barrier(n)
    q: "mp.Queue" = mp.Queue()
    procs = [mp.Process(target=_worker, args=(dsn, i, barrier, q)) for i in range(n)]
    for p in procs:
        p.start()
    for p in procs:
        p.join(120)

    results = [q.get() for _ in range(n)]
    failures = [r for r in results if r[1] != "OK"]
    for idx, res in sorted(results):
        print(f"w{idx}:{res}")
    print(f"\nfailures={len(failures)}/{n}")
    return 1 if failures else 0


if __name__ == "__main__":
    mp.freeze_support()
    sys.exit(main())
