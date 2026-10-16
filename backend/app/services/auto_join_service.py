"""Auto-join service — runs bulk group joins in the async worker.

The browser used to drive this: a for-loop issuing one POST per join, with
progress held in React state. Closing the tab killed the run and lost the log.
This runs in the worker instead, so a run survives the browser and can be
paused, resumed and inspected afterwards.

CON-01: an AsyncSession holds a pooled connection for its whole lifetime, and
the worker's pool is a slice of the 300 Postgres allows. Every await here is a
Telegram RPC or a multi-minute sleep, so no session is ever held across one.
Config is read once into locals, counters accumulate as plain ints, and the
database is touched only at deliberate sync points.
"""

import asyncio
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.auto_join_job import AutoJoinJob
from app.models.auto_join_log import AutoJoinLog
from app.utils.account_restrictions import (
    RESTRICTED_FROZEN,
    RESTRICTED_LIMITED,
    is_account_restricted,
    mark_account_restricted,
)
from app.utils.async_helpers import clear_job_event, interruptible_sleep, wake_job
from app.utils.flood_control import flood_controller

logger = logging.getLogger(__name__)

_running_auto_join_tasks: dict[str, asyncio.Task] = {}

# Hard bounds so a rate-limited run backs off instead of hammering Telegram.
# Mirrors the anti-ban behaviour broadcast/invite already have.
MAX_RATE_LIMIT_RETRIES = 3
FLOOD_DEFAULT_WAIT_SECONDS = 30
MAX_FLOOD_WAIT_SECONDS = 300
PEER_FLOOD_BACKOFF_SECONDS = 300


def _session_factory():
    from app.database import async_session_factory

    return async_session_factory()


def _jitter(low: float, high: float) -> float:
    import random

    return random.uniform(low, high)


# ── Job lookup / status helpers (each owns a short-lived session) ────────────


async def _get_job_status(job_uuid) -> str | None:
    from app.database import async_session_factory

    async with async_session_factory() as db:
        res = await db.execute(
            select(AutoJoinJob.status).where(AutoJoinJob.id == job_uuid)
        )
        return res.scalar_one_or_none()


async def _set_status(job_uuid, status: str) -> None:
    from app.database import async_session_factory

    async with async_session_factory() as db:
        res = await db.execute(
            select(AutoJoinJob).where(AutoJoinJob.id == job_uuid)
        )
        job = res.scalar_one_or_none()
        if job is None:
            return
        job.status = status
        if status in ("completed", "cancelled", "failed"):
            job.completed_at = datetime.now(timezone.utc)
            job.progress = 100
        await db.commit()


async def _save_log_and_counters(
    job_uuid,
    log: AutoJoinLog,
    *,
    success: int,
    already: int,
    failed: int,
    progress: int,
    current: int,
    total: int,
) -> None:
    """Write one log row and the job counters in a single transaction."""
    from app.database import async_session_factory

    async with async_session_factory() as db:
        db.add(log)
        res = await db.execute(
            select(AutoJoinJob).where(AutoJoinJob.id == job_uuid)
        )
        job = res.scalar_one_or_none()
        if job is not None:
            job.success_count = success
            job.already_count = already
            job.fail_count = failed
            job.progress = progress
            job.updated_at = datetime.now(timezone.utc)
        await db.commit()

    await _push(
        job_uuid,
        "progress",
        {
            "current": current,
            "total": total,
            "progress": progress,
            "success": success,
            "already": already,
            "failed": failed,
        },
    )


# ── Real-time push ───────────────────────────────────────────────────────────


async def _push(job_id: str, event_type: str, data: dict) -> None:
    """Publish an event to WebSocket clients watching this job."""
    channel = f"autojoin:{job_id}"
    payload = {"type": event_type, **data}

    try:
        from app.utils.redis_dispatcher import publish_ws_event

        await publish_ws_event(channel, payload)
    except Exception as exc:
        logger.warning("Redis WS push failed for auto-join job %s: %s", job_id, exc)

    try:
        from app.api.ws import manager

        # has_channel is the real ConnectionManager predicate; the invite and
        # broadcast services call get_channel_count, which does not exist and
        # silently disables their direct-broadcast path.
        if manager.has_channel(channel):
            await manager.broadcast(channel, payload)
    except Exception:
        pass


# ── Task planning (mirrors frontend autoJoinTaskPlan.ts) ────────────────────


def build_tasks(targets: list[dict], account_ids: list[str], mode: str):
    """Order the joins so all accounts finish one group before the next.

    Returns a list of (account_id, target_value, target_type).
    """
    tasks: list[tuple[str, str, str]] = []

    if mode == "all":
        for target in targets:
            for account_id in account_ids:
                tasks.append((account_id, target["value"], target.get("type", "username")))
    else:
        for idx, target in enumerate(targets):
            account_id = account_ids[idx % len(account_ids)]
            tasks.append((account_id, target["value"], target.get("type", "username")))

    return tasks


def should_delay_before_next(tasks, index: int) -> bool:
    """Whether to pause before the next task.

    The pause belongs between groups. Delaying after every task made three
    accounts against one group cost three delays before moving on.
    """
    if index + 1 >= len(tasks):
        return False
    return tasks[index + 1][1] != tasks[index][1]


# ── Public API surface ───────────────────────────────────────────────────────


async def start_auto_join(
    db: AsyncSession,
    *,
    user_id,
    account_ids: list[str],
    targets: list[dict],
    distribution_mode: str,
    delay_per_group: int,
    delay_randomized: bool,
) -> AutoJoinJob:
    from app.services import account_service

    if not account_ids:
        raise ValueError("Pilih minimal satu akun.")

    # Validate ownership of every account up front so the run cannot start with
    # an account the caller does not own.
    accounts = []
    for acc_id in account_ids:
        account = await account_service.get_account(db, acc_id, str(user_id))
        if account is None:
            raise ValueError(f"Account {acc_id} not found")
        if is_account_restricted(account):
            raise ValueError(
                f"Akun {account.first_name or account.phone} sedang dibatasi Telegram "
                f"({account.restriction_status or account.spam_status}). "
                "Tunggu hingga pembatasan berakhir."
            )
        accounts.append(account)

    from app.models.user import User
    from app.services.account_service import ROLE_ACCOUNT_LIMITS
    user_row = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user_row is not None:
        user_role = getattr(user_row, "role", "freetrial") or "freetrial"
        max_allowed = ROLE_ACCOUNT_LIMITS.get(user_role, 1)
        if len(accounts) > max_allowed:
            raise ValueError(
                f"Paket Anda hanya mengizinkan maksimal {max_allowed} akun untuk auto-join. "
                f"Anda memilih {len(accounts)} akun."
            )

    # Refuse to start on an account another active job already holds.
    from app.utils.account_ownership import find_busy_accounts

    busy_accounts = await find_busy_accounts(db, [str(a) for a in account_ids])
    if busy_accounts:
        raise ValueError(
            "Akun berikut sedang dipakai job lain yang aktif: "
            + ", ".join(busy_accounts)
            + ". Hentikan job tersebut atau tunggu selesai sebelum memulai yang baru."
        )

    job = AutoJoinJob(
        account_ids=[str(a) for a in account_ids],
        user_id=user_id,
        targets=targets,
        distribution_mode=distribution_mode,
        status="running",
        delay_per_group=delay_per_group,
        delay_randomized=delay_randomized,
        total_tasks=len(account_ids) * len(targets)
        if distribution_mode == "all"
        else len(targets),
    )
    db.add(job)
    await db.flush()
    await db.commit()
    await db.refresh(job)

    from app.utils.redis_dispatcher import enqueue_job

    primary_acc = job.account_ids[0] if job.account_ids else None
    if not await enqueue_job("autojoin", job.id, account_id=primary_acc):
        job.status = "failed"
        job.completed_at = datetime.now(timezone.utc)
        await db.commit()
        logger.error("Auto-join job %s could not be enqueued; marked failed", job.id)
        raise ValueError(
            "Gagal mengirim job auto-join ke worker (Redis). Job dibatalkan, silakan coba lagi."
        )
    return job


async def get_auto_join_job(db: AsyncSession, job_id: str, user_id: str) -> AutoJoinJob | None:
    try:
        job_uuid = uuid.UUID(job_id)
    except (ValueError, TypeError):
        return None
    res = await db.execute(
        select(AutoJoinJob).where(AutoJoinJob.id == job_uuid, AutoJoinJob.user_id == user_id)
    )
    return res.scalar_one_or_none()


async def get_auto_join_jobs(db: AsyncSession, user_id: str, limit: int = 20) -> list[AutoJoinJob]:
    res = await db.execute(
        select(AutoJoinJob)
        .where(AutoJoinJob.user_id == user_id)
        .order_by(AutoJoinJob.created_at.desc())
        .limit(limit)
    )
    return list(res.scalars().all())


async def update_auto_join_job_status(db: AsyncSession, job: AutoJoinJob, status: str) -> None:
    job.status = status
    if status in ("completed", "cancelled", "failed"):
        job.completed_at = datetime.now(timezone.utc)
    await db.flush()
    wake_job(str(job.id))


async def get_auto_join_logs(
    db: AsyncSession, job_id: str, limit: int = 200, offset: int = 0
) -> list[AutoJoinLog]:
    try:
        job_uuid = uuid.UUID(job_id)
    except (ValueError, TypeError):
        return []
    res = await db.execute(
        select(AutoJoinLog)
        .where(AutoJoinLog.job_id == job_uuid)
        .order_by(AutoJoinLog.joined_at.desc())
        .offset(offset)
        .limit(limit)
    )
    return list(res.scalars().all())


async def delete_auto_join_job(db: AsyncSession, job_id: str, user_id: str) -> None:
    job = await get_auto_join_job(db, job_id, user_id)
    if job is None:
        raise ValueError("Auto-join job not found")
    if job.status in ("running", "paused"):
        raise ValueError("Cannot delete an active job — stop it first")
    await db.delete(job)
    await db.flush()


# ── The worker-side executor ─────────────────────────────────────────────────


async def execute_auto_join(job_id: str) -> None:
    from app.services import account_service, group_admin_service
    from app.utils.account_ownership import OWNER_WORKER, acquire_lease, release_lease
    from app.utils.encryption import decrypt
    from app.utils.telegram_errors import classify_telegram_error

    job_uuid = uuid.UUID(job_id)
    active_accounts: list[dict] = []

    try:
        # CON-01: read the whole configuration into locals, then close the
        # session before any Telegram call or sleep.
        async with _session_factory() as db:
            res = await db.execute(select(AutoJoinJob).where(AutoJoinJob.id == job_uuid))
            job = res.scalar_one_or_none()
            if job is None or job.status in ("cancelled", "completed"):
                return

            job.status = "running"
            await db.commit()

            account_ids = [str(a) for a in (job.account_ids or [])]
            targets = list(job.targets or [])
            mode = job.distribution_mode
            delay_per_group = job.delay_per_group
            delay_randomized = job.delay_randomized
            owner_id = job.user_id
            await _push(job_id, "status", {"status": "running"})

        tasks = build_tasks(targets, account_ids, mode)
        total_tasks = len(tasks)
        if total_tasks == 0:
            await _set_status(job_uuid, "completed")
            return

        async with _session_factory() as db:
            res = await db.execute(
                select(AutoJoinJob).where(AutoJoinJob.id == job_uuid)
            )
            j = res.scalar_one_or_none()
            if j is not None:
                j.total_tasks = total_tasks
                await db.commit()

        await _push(job_id, "phase", {
            "message": f"Memproses {total_tasks} join dari {len(account_ids)} akun.",
            "total": total_tasks,
        })

        # Connect every account up front. The worker must hold the ownership
        # lease or the webserver can race it for the same MTProto connection,
        # which Telegram answers with a wrong-session-id error.
        from app.services.telegram_client import client_pool

        for acc_id_str in account_ids:
            await acquire_lease(acc_id_str, OWNER_WORKER, force=True)
            try:
                async with _session_factory() as db:
                    account = await account_service.get_account(
                        db, acc_id_str, str(owner_id)
                    )
                if account is None:
                    await release_lease(acc_id_str, OWNER_WORKER)
                    continue
                session_str = decrypt(account.session_string)
                client = await client_pool.borrow(acc_id_str, session_str)
                if client is None:
                    raise RuntimeError(f"Account {acc_id_str} is disconnected")
                active_accounts.append({
                    "account_id": acc_id_str,
                    "account_name": account.first_name or account.phone,
                    "account": account,
                    "client": client,
                })
            except Exception as exc:
                await release_lease(acc_id_str, OWNER_WORKER)
                logger.warning("Auto-join: cannot use account %s: %s", acc_id_str, exc)

        if not active_accounts:
            await _set_status(job_uuid, "failed")
            await _push(job_id, "error", {
                "status": "failed",
                "message": "Tidak ada akun aktif yang bisa digunakan.",
            })
            return

        success = already = failed = 0

        for idx, (acc_id_str, target, target_type) in enumerate(tasks):
            status = await _get_job_status(job_uuid)
            if status == "cancelled":
                break
            while status == "paused":
                # CON-01: no session held while sleeping.
                await interruptible_sleep(job_id, 86400)
                status = await _get_job_status(job_uuid)
                if status == "cancelled":
                    break
            if status == "cancelled":
                break

            entry = next((a for a in active_accounts if a["account_id"] == acc_id_str), None)
            if entry is None:
                entry = active_accounts[idx % len(active_accounts)]

            log = AutoJoinLog(
                job_id=job_uuid,
                target=target,
                target_type=target_type,
                account_id_used=entry["account_id"],
                account_name=entry["account_name"],
            )

            # Back off and retry the same target on a rate-limit instead of
            # writing it off, and honour Telegram's requested wait. Previously a
            # FloodWait was downgraded to a generic error with no delay, so a
            # throttled account kept hammering joins.
            rate_limit_retries = 0
            cancelled = False
            while True:
                try:
                    result = await group_admin_service.join_chat(entry["account"], target)

                    is_already = bool(result.get("already_joined"))
                    log.status = "already_member" if is_already else "success"
                    log.chat_id = result.get("chat_id")
                    log.chat_title = result.get("title")
                    log.chat_username = result.get("username")
                    log.chat_type = result.get("chat_type")
                    if is_already:
                        already += 1
                    else:
                        success += 1
                    flood_controller.record_success(entry["account_id"])
                    break

                except Exception as exc:
                    err_type, err_msg = classify_telegram_error(exc)

                    if (
                        err_type in ("flood", "peer_flood")
                        and rate_limit_retries < MAX_RATE_LIMIT_RETRIES
                    ):
                        rate_limit_retries += 1
                        if err_type == "flood":
                            wait = int(getattr(exc, "seconds", 0) or 0) or FLOOD_DEFAULT_WAIT_SECONDS
                            wait = min(wait, MAX_FLOOD_WAIT_SECONDS)
                        else:
                            wait = PEER_FLOOD_BACKOFF_SECONDS
                        # Escalate this account's cooldown so later tasks wait too.
                        flood_controller.record_flood(entry["account_id"], wait)
                        await _push(job_id, "flood_wait", {
                            "wait_seconds": int(wait),
                            "account": entry["account_name"],
                            "message": (
                                f"{entry['account_name']}: {err_msg} — retry "
                                f"{rate_limit_retries}/{MAX_RATE_LIMIT_RETRIES} in {int(wait)}s"
                            ),
                        })
                        if not await interruptible_sleep(job_id, wait):
                            # Woken early by pause/stop. Re-check before retrying.
                            status = await _get_job_status(job_uuid)
                            if status == "cancelled":
                                cancelled = True
                                break
                            while status == "paused":
                                await interruptible_sleep(job_id, 86400)
                                status = await _get_job_status(job_uuid)
                                if status == "cancelled":
                                    cancelled = True
                                    break
                            if cancelled:
                                break
                        continue

                    if err_type == "account_frozen":
                        # Telegram froze this account's join methods. Hold it out
                        # of the rotation and keep the job running with the other
                        # accounts; do not fail the whole job.
                        log.status = "skipped"
                        log.error_type = err_type
                        log.error_message = err_msg
                        try:
                            async with _session_factory() as sdb:
                                acc = await account_service.get_account(
                                    sdb, entry["account_id"], str(owner_id)
                                )
                                if acc is not None:
                                    mark_account_restricted(acc, RESTRICTED_FROZEN, err_msg)
                                    await sdb.commit()
                        except Exception as restrict_exc:
                            logger.warning(
                                "Auto-join: could not persist frozen state for %s: %s",
                                entry["account_id"],
                                restrict_exc,
                            )
                        if entry in active_accounts:
                            active_accounts.remove(entry)
                        await _push(job_id, "account_restricted", {
                            "account": entry["account_name"],
                            "restriction": "frozen",
                            "message": (
                                f"Akun {entry['account_name']} dibekukan Telegram. "
                                "Dikeluarkan dari rotasi; job lanjut dengan akun lain."
                            ),
                        })
                        break

                    # Non-retryable, or retries exhausted.
                    log.status = "error"
                    log.error_type = err_type
                    log.error_message = err_msg
                    failed += 1
                    break

            if cancelled:
                break

            progress = int(((idx + 1) / total_tasks) * 100) if total_tasks else 0
            await _save_log_and_counters(
                job_uuid,
                log,
                success=success,
                already=already,
                failed=failed,
                progress=progress,
                current=idx + 1,
                total=total_tasks,
            )

            await _push(job_id, "log", {
                "target": target,
                "status": log.status,
                "error_type": log.error_type,
                "error_message": log.error_message,
                "chat_title": log.chat_title,
                "chat_type": log.chat_type,
                "account_id_used": acc_id_str,
                "account_name": entry["account_name"],
            })

            # Pace per group, not per join. Also respect any per-account cooldown
            # the flood controller accumulated.
            if should_delay_before_next(tasks, idx):
                actual_delay = delay_per_group
                if delay_randomized:
                    jitter = _jitter(-2, 2)
                    actual_delay = max(1, delay_per_group + jitter)
                actual_delay = max(actual_delay, flood_controller.get_delay(entry["account_id"]))
                await _push(job_id, "group_delay", {
                    "delay": round(actual_delay),
                    "message": f"Jeda {round(actual_delay)} detik sebelum grup berikutnya...",
                })
                # CON-01: no DB connection held during the delay.
                await interruptible_sleep(job_id, actual_delay)

        final_status = await _get_job_status(job_uuid)
        if final_status == "running":
            await _set_status(job_uuid, "completed")
            await _push(job_id, "completed", {
                "total": total_tasks,
                "success": success,
                "already": already,
                "failed": failed,
            })

    except asyncio.CancelledError:
        await _set_status(job_uuid, "cancelled")
        raise
    except Exception as exc:
        logger.exception("Auto-join job %s crashed: %s", job_id, exc)
        try:
            await _set_status(job_uuid, "failed")
            await _push(job_id, "error", {"status": "failed", "message": str(exc)})
        except Exception:
            pass
    finally:
        from app.services.telegram_client import client_pool

        completed_acc_ids = [a["account_id"] for a in active_accounts]
        for acc_id_str in completed_acc_ids:
            # client_pool.remove, not a bare disconnect: a disconnected-but-
            # pooled client gets handed back to the next caller as a dead one.
            try:
                await client_pool.release(acc_id_str)
                await client_pool.remove(acc_id_str, save_state=False)
            except Exception:
                pass
            try:
                await release_lease(acc_id_str, OWNER_WORKER)
            except Exception:
                pass
        if completed_acc_ids:
            try:
                from app.utils.redis_dispatcher import publish_job_completed
                await publish_job_completed("autojoin", job_id, completed_acc_ids)
            except Exception:
                pass


# ── Task lifecycle ───────────────────────────────────────────────────────────


def start_auto_join_task(job_id: str | uuid.UUID) -> bool:
    """Ensure a background auto-join task is running for this job ID."""
    job_id_str = str(job_id)
    existing = _running_auto_join_tasks.get(job_id_str)
    if existing and not existing.done():
        return False

    async def _safe_execute():
        try:
            await execute_auto_join(job_id_str)
        except asyncio.CancelledError:
            logger.info("Auto-join task %s cancelled gracefully", job_id_str)
        except Exception as exc:
            logger.exception("Background auto-join task %s crashed: %s", job_id_str, exc)
        finally:
            _running_auto_join_tasks.pop(job_id_str, None)
            clear_job_event(job_id_str)

    task = asyncio.create_task(_safe_execute())
    _running_auto_join_tasks[job_id_str] = task
    return True


async def cancel_all_auto_join_tasks() -> int:
    tasks = list(_running_auto_join_tasks.values())
    for task in tasks:
        task.cancel()
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)
    _running_auto_join_tasks.clear()
    return len(tasks)


async def resume_running_auto_joins_on_startup(db: AsyncSession, stagger_seconds: float = 0.3) -> int:
    """Re-attach tasks to jobs left running by a previous worker process."""
    from app.core.sharding import is_account_in_current_shard

    res = await db.execute(
        select(AutoJoinJob)
        .where(AutoJoinJob.status == "running")
        .order_by(AutoJoinJob.updated_at.desc())
    )
    jobs = list(res.scalars().all())

    count = 0
    for idx, job in enumerate(jobs):
        if job.account_ids and not is_account_in_current_shard(job.account_ids[0]):
            continue
        if idx > 0 and stagger_seconds > 0:
            await asyncio.sleep(stagger_seconds)
        if start_auto_join_task(job.id):
            count += 1
    return count