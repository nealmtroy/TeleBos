"""Exclusive Telegram account ownership between the backend and the worker.

Telegram permits one live MTProto connection per auth key. TeleBos runs two
processes that both need to talk to Telegram for the same account: the
webserver (real-time chat, auto-reply, WebSocket channels) and the dedicated
async worker (broadcast and invite jobs). When both open a connection, Telegram
answers the stale socket and Telethon logs::

    Security error while unpacking a received message: Server replied with a
    wrong session ID

Ownership is coordinated through a Redis lease rather than a mutex. A mutex
would be wrong here: the two processes legitimately need concurrent access to
*different* accounts, and the webserver holds its connection for the life of the
process rather than for the duration of a single request, so any mutual
exclusion over the whole connect path would deadlock every broadcast.

The rule is instead per account, and follows the job lifecycle:

- An account with a live broadcast or invite job is **worker-owned**. The
  webserver stands down and drops its connection for that account, which is what
  ``SessionManager.ensure_connected_on_demand`` already does.
- Every other active account is **backend-owned** and never opened by the
  worker.

A Redis lease backs the decision so a crashed owner does not strand an account:
the lease carries an expiry and is renewed while the owner is alive, so a
process that dies without releasing simply lets the lease lapse.

The lease is a liveness optimisation, not the source of truth. Job rows in
PostgreSQL remain authoritative for *whether* an account is worker-owned, because
a job survives a Redis restart. The lease only decides who connects first when
both processes start at once, which is when the conflict actually occurs.
"""

from __future__ import annotations

import logging
import os
import socket
import time
import uuid
from contextlib import asynccontextmanager
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.broadcast_job import BroadcastJob
from app.models.invite_job import InviteJob

logger = logging.getLogger(__name__)

# Identifies this process to the lease store, so a holder can recognise its own
# lease and renew it instead of deadlocking against itself.
_PROCESS_ID = f"{socket.gethostname()}:{os.getpid()}:{uuid.uuid4().hex[:8]}"

OWNER_BACKEND = "backend"
OWNER_WORKER = "worker"

# Job statuses that mean the worker is using the account right now. A paused
# job still holds its connection in the worker, so it must count as claimed.
_ACTIVE_JOB_STATUSES = ("pending", "running", "paused")

# A lease outlives a crashed owner this long before another process may take it.
LEASE_TTL_SECONDS = 120
# How often a live owner refreshes its lease.
LEASE_RENEW_SECONDS = 40


def lease_key(account_id: str) -> str:
    return f"telebos:account-owner:{account_id}"


@dataclass(frozen=True)
class OwnershipDecision:
    """Who may hold the Telegram connection for an account right now."""

    owner: str
    reason: str


async def is_worker_claimed(db: AsyncSession, account_id: str) -> bool:
    """Whether PostgreSQL says a live job is using this account.

    This is the authoritative check: job rows outlive a Redis restart, so a
    vanished lease can never make a busy account look free.
    """
    import uuid as _uuid

    try:
        acc_uuid = _uuid.UUID(account_id)
    except (ValueError, TypeError):
        return False

    for model in (BroadcastJob, InviteJob):
        try:
            result = await db.execute(
                select(model.account_ids).where(
                    model.status.in_(list(_ACTIVE_JOB_STATUSES))
                )
            )
        except Exception as exc:  # pragma: no cover - defensive
            logger.debug("Ownership check failed for %s: %s", model.__name__, exc)
            continue
        for account_ids in result.scalars():
            if not isinstance(account_ids, list):
                continue
            if (
                account_id in account_ids
                or str(acc_uuid) in account_ids
                or acc_uuid in account_ids
            ):
                return True
    return False


async def decide_owner(db: AsyncSession, account_id: str) -> OwnershipDecision:
    """Return which process should hold this account's connection.

    A live job always wins, regardless of lease state: the worker is already
    mid-send and must not be disconnected by a stale lease.
    """
    if await is_worker_claimed(db, account_id):
        return OwnershipDecision(OWNER_WORKER, "active broadcast/invite job")

    return OwnershipDecision(OWNER_BACKEND, "no active job")


async def _store():
    """Return the Redis client, or None when Redis is unavailable."""
    try:
        from app.utils.redis import redis_client

        return redis_client
    except Exception as exc:  # pragma: no cover - import-time failure
        logger.debug("Redis unavailable for account ownership: %s", exc)
        return None


async def acquire_lease(
    account_id: str, owner: str, ttl: int = LEASE_TTL_SECONDS, force: bool = False
) -> bool:
    """Try to take the account lease for ``owner``.

    Returns True when this process holds the lease afterwards. A Redis outage
    returns True so the caller proceeds on the PostgreSQL decision alone rather
    than stalling every account.

    ``force`` is for the worker. A live job row is the authoritative claim, so
    the worker takes the account even if the backend currently holds the lease;
    the backend stands down on its next health pass. The backend never uses
    ``force`` — it must yield rather than evict a worker that is mid-send.
    """
    redis = await _store()
    if redis is None:
        return True

    try:
        if force:
            await redis.set(
                lease_key(account_id), f"{owner}|{_PROCESS_ID}", ex=ttl
            )
            return True

        acquired = await redis.set(
            lease_key(account_id), f"{owner}|{_PROCESS_ID}", nx=True, ex=ttl
        )
        if acquired:
            return True

        current = await redis.get(lease_key(account_id))
        if not current or not str(current).endswith(_PROCESS_ID):
            logger.info(
                "Account %s is leased to another process (%s); %s standing down",
                account_id,
                current,
                owner,
            )
            return False
        # Our own lease from a previous request in this process.
        return True
    except Exception as exc:
        logger.warning(
            "Account lease for %s could not be evaluated (%s); continuing on job state",
            account_id,
            exc,
        )
        return True


async def release_lease(account_id: str, owner: str) -> None:
    """Release the lease when this process is the holder."""
    redis = await _store()
    if redis is None:
        return
    try:
        current = await redis.get(lease_key(account_id))
        if current and str(current).endswith(_PROCESS_ID):
            await redis.delete(lease_key(account_id))
    except Exception as exc:
        logger.debug("Failed to release lease for account %s: %s", account_id, exc)


async def renew_lease(account_id: str, owner: str) -> bool:
    """Extend our lease. Returns False if another process has taken it."""
    redis = await _store()
    if redis is None:
        return True
    try:
        current = await redis.get(lease_key(account_id))
        if not current or not str(current).endswith(_PROCESS_ID):
            return False
        await redis.expire(lease_key(account_id), LEASE_TTL_SECONDS)
        return True
    except Exception as exc:
        logger.debug("Failed to renew lease for account %s: %s", account_id, exc)
        return True


@asynccontextmanager
async def account_lease(account_id: str, owner: str):
    """Hold the account lease for the duration of a connection's life.

    The lease is acquired once and released on exit. Callers that keep a
    connection open for a long time should call :func:`renew_lease`
    periodically instead of holding this context.
    """
    acquired = await acquire_lease(account_id, owner)
    try:
        yield acquired
    finally:
        if acquired:
            await release_lease(account_id, owner)
