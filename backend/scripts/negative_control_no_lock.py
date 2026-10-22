"""Negative control: old behaviour (no advisory lock) must fail the new test.

Runs the same concurrency scenario as test_concurrent_schema_init but calls
create_all directly, exactly like the pre-fix lifespan did. If this does NOT
fail, the regression test is vacuous and proves nothing.
"""

import asyncio
import sys

from sqlalchemy.ext.asyncio import create_async_engine

sys.path.insert(0, ".")
from app.database import Base  # noqa: E402
import app.models  # noqa: F401,E402

DSN = sys.argv[1]


async def main() -> int:
    n = 4
    barrier = asyncio.Barrier(n)
    errors: list[str] = []

    async def worker(i: int) -> None:
        engine = create_async_engine(DSN)
        try:
            await barrier.wait()
            async with engine.begin() as conn:  # NO advisory lock
                await conn.run_sync(Base.metadata.create_all)
        except Exception as exc:  # noqa: BLE001
            errors.append(f"w{i}: {type(exc).__name__}: {str(exc).splitlines()[0][:120]}")
        finally:
            await engine.dispose()

    await asyncio.gather(*(worker(i) for i in range(n)))
    for e in errors:
        print(e)
    print(f"\nfailures={len(errors)}/{n}  (negative control: expect >0)")
    return 0 if errors else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
