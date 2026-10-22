"""Serialized startup schema initialization.

Split out of ``app.main``'s lifespan so it can be tested directly instead of
only through a running app (PYTHON-FASTAPI-2P).

Why the advisory lock exists
----------------------------
``Base.metadata.create_all`` is metadata-driven: for every ``Index()`` declared
on a model it emits a bare ``CREATE INDEX <name> ...`` statement. That statement
is *not* idempotent. When two processes reach startup at the same time -- a
container recreate overlapping the old process draining, or a deliberately
scaled/sharded deployment -- both run ``create_all`` against the same schema and
the loser raises::

    DuplicateTableError: relation "ix_security_audit_logs_action" already exists

which escapes the lifespan and kills the process with
``Application startup failed. Exiting.`` The retry loop below cannot help,
because the second attempt hits the very same already-exists error.

Taking a transaction-scoped Postgres advisory lock before touching the schema
makes the second process *wait* for the first to finish instead of racing it.
The lock is released automatically at commit/rollback, so it cannot leak.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Awaitable, Callable

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

logger = logging.getLogger(__name__)

# Constant shared by every process so they contend on the same lock. Any stable
# value works; this one is arbitrary but unlikely to collide with other users of
# advisory locks in this database.
SCHEMA_INIT_LOCK_KEY = 0x7E1EB05

# Postgres reports a lost race this way; retrying is safe because the winning
# process has already created the object we wanted.
_RACE_MARKERS = (
    "already exists",
    "duplicate key value violates unique constraint",
    "duplicate_table",
    "unique_violation",
)


def _is_race_error(exc: BaseException) -> bool:
    """True when the failure is a lost create_all race rather than a real fault."""
    text_repr = f"{type(exc).__name__}: {exc}".lower()
    return any(marker in text_repr for marker in _RACE_MARKERS)


async def init_schema(
    engine: AsyncEngine,
    base: Any,
    run_migrations: Callable[[Any], Awaitable[None] | None],
    *,
    attempts: int = 5,
    lock_key: int = SCHEMA_INIT_LOCK_KEY,
) -> None:
    """Create missing tables and run idempotent migrations under an advisory lock.

    ``run_migrations`` is passed in (rather than imported) to keep this module
    free of circular imports with ``app.database_migrator``.
    """
    for attempt in range(1, attempts + 1):
        try:
            async with engine.begin() as conn:
                await conn.execute(
                    text("SELECT pg_advisory_xact_lock(:k)"), {"k": lock_key}
                )
                await conn.run_sync(base.metadata.create_all)
            # Run pending schema migrations (idempotent)
            async with engine.begin() as conn:
                await conn.execute(
                    text("SELECT pg_advisory_xact_lock(:k)"), {"k": lock_key}
                )
                await conn.run_sync(run_migrations)
            return
        except Exception as db_exc:  # noqa: BLE001
            if attempt == attempts:
                logger.critical(
                    "Database initialization failed after %d attempts: %s",
                    attempt,
                    db_exc,
                )
                raise
            wait = 2 * attempt
            logger.warning(
                "Database not ready (attempt %d/%d): %s. Retrying in %ds...",
                attempt,
                attempts,
                db_exc,
                wait,
            )
            await asyncio.sleep(wait)
