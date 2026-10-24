"""Broadcast management business logic — group lists, text lists, jobs, execution."""

import asyncio
import json
import logging
import random
import re
import time
import uuid
_uuid = uuid
from datetime import datetime, timezone
from typing import Any

import telethon
import telethon.errors
from telethon.tl.functions.channels import JoinChannelRequest

from sqlalchemy import select, func, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import InvalidRequestError

from app.models.broadcast_job import BroadcastJob
from app.models.broadcast_log import BroadcastLog
from app.models.group_list import GroupList
from app.models.text_list import TextList
from app.models.telegram_account import TelegramAccount
from app.models.user import User
from app.services.telegram_client import client_pool
from app.services.event_relay import event_relay
from app.utils.account_ownership import OWNER_WORKER, acquire_lease, release_lease
from app.utils.account_restrictions import (
    RESTRICTED_FROZEN,
    RESTRICTED_LIMITED,
    is_account_restricted,
    mark_account_restricted,
)
from app.utils.encryption import decrypt
from app.utils.flood_control import flood_controller
fc = flood_controller
from app.utils.telegram_errors import classify_telegram_error
from app.utils.telethon_helpers import (
    get_active_client,
    borrow_client,
    release_client,
    parse_invite_hash as _invite_hash,
    parse_public_target as _public_target,
    join_and_resolve_chat as _join_and_resolve_target,
)

logger = logging.getLogger(__name__)

# A looping broadcast job stops once there is no retryable work left and this
# fraction of its targets are permanent failures. Without it, a group list that
# is mostly invalid links keeps looping forever, re-sending only to the handful
# of valid groups on every cycle.
BROADCAST_MAX_DEAD_RATIO = 0.9

# Resolve/join failure classifications that will never succeed on retry, so the
# target may be blacklisted immediately.
RESOLVE_PERMANENT_ERROR_TYPES = frozenset({
    "admin_only",
    "banned",
    "invalid_username",
    "invalid_link",
    "private_channel",
    "muted_permanent",
    "channel_forbidden",
    "bad_request",
    "not_member",
    "too_many_channels",
    "topic_closed",
    "media_forbidden",
})

# Unknown/transient resolve failures (e.g. "Could not resolve or join target"
# after a join that actually succeeded) are retried over this many cycles before
# being treated as permanently dead, instead of being blacklisted after one miss.
MAX_RESOLVE_ATTEMPTS = 3

# Minimum seconds between @SpamBot status probes for one account after it raises
# USER_BANNED_IN_CHANNEL, so a per-group ban does not trigger a probe per target.
SPAM_RECHECK_INTERVAL = 600.0

# Worker-local task tracker for background broadcast jobs
_running_tasks: dict[str, asyncio.Task] = {}

from app.utils.async_helpers import (
    interruptible_sleep as _interruptible_sleep,
    wake_job,
    clear_job_event,
)


async def _refresh_job_safe(db: AsyncSession, job: BroadcastJob) -> BroadcastJob | None:
    """Refresh a BroadcastJob from the DB, re-fetching if the session lost track.

    Long-running broadcast jobs hold a single session for hours, and
    PostgreSQL connection drops (idle_in_transaction_session_timeout, pool
    recycling, transient network errors) detach the ORM instance from the
    session.  ``db.refresh()`` then raises ``InvalidRequestError``.  This
    helper catches that and re-fetches via a fresh query so the broadcast
    loop can continue.
    """
    try:
        await db.refresh(job)
        return job
    except InvalidRequestError:
        from sqlalchemy import inspect

        state = inspect(job)
        job_id = state.identity[0] if state and state.identity else None
        if not job_id:
            logger.warning(
                "BroadcastJob detached from session and has no identity, cannot re-fetch"
            )
            return None

        logger.warning("BroadcastJob %s detached from session, re-fetching", job_id)
        from app.database import async_session_factory

        async with async_session_factory() as fresh_db:
            result = await fresh_db.execute(select(BroadcastJob).where(BroadcastJob.id == job_id))
            fresh_job = result.scalar_one_or_none()
            if fresh_job is None:
                return None
        # Merge back into the original session so subsequent state changes
        # are tracked as expected.
        return await db.merge(fresh_job)


# _interruptible_sleep is imported from app.utils.async_helpers


# ── Group Lists ──────────────────────────────────────────────────────────────


async def get_group_lists(db: AsyncSession, user: User) -> list[GroupList]:
    result = await db.execute(
        select(GroupList).where(GroupList.user_id == user.id).order_by(GroupList.updated_at.desc())
    )
    return list(result.scalars().all())


async def create_group_list(db: AsyncSession, user: User, name: str, items: list) -> GroupList:
    gl = GroupList(user_id=user.id, name=name, items=items)
    db.add(gl)
    await db.flush()
    await db.refresh(gl)
    return gl


async def update_group_list(
    db: AsyncSession, gl_id: str, user_id: str, name: str | None, items: list | None
) -> GroupList:
    result = await db.execute(
        select(GroupList).where(GroupList.id == gl_id, GroupList.user_id == user_id)
    )
    gl = result.scalar_one_or_none()
    if gl is None:
        raise ValueError("Group list not found")
    if name is not None:
        gl.name = name
    if items is not None:
        gl.items = items
    await db.flush()
    await db.refresh(gl)
    return gl


async def delete_group_list(db: AsyncSession, gl_id: str, user_id: str) -> None:
    result = await db.execute(
        select(GroupList).where(GroupList.id == gl_id, GroupList.user_id == user_id)
    )
    gl = result.scalar_one_or_none()
    if gl is None:
        raise ValueError("Group list not found")
    # Nullify FK on broadcast_jobs that reference this group list to avoid
    # IntegrityError (ForeignKeyViolationError) on delete.
    await db.execute(
        update(BroadcastJob).where(BroadcastJob.group_list_id == gl.id).values(group_list_id=None)
    )
    await db.delete(gl)


# ── Text Lists ───────────────────────────────────────────────────────────────


async def get_text_lists(db: AsyncSession, user: User) -> list[TextList]:
    result = await db.execute(
        select(TextList).where(TextList.user_id == user.id).order_by(TextList.updated_at.desc())
    )
    return list(result.scalars().all())


async def create_text_list(db: AsyncSession, user: User, name: str, texts: list) -> TextList:
    tl = TextList(user_id=user.id, name=name, texts=texts)
    db.add(tl)
    await db.flush()
    await db.refresh(tl)
    return tl


async def update_text_list(
    db: AsyncSession, tl_id: str, user_id: str, name: str | None, texts: list | None
) -> TextList:
    result = await db.execute(
        select(TextList).where(TextList.id == tl_id, TextList.user_id == user_id)
    )
    tl = result.scalar_one_or_none()
    if tl is None:
        raise ValueError("Text list not found")
    if name is not None:
        tl.name = name
    if texts is not None:
        tl.texts = texts
    await db.flush()
    await db.refresh(tl)
    return tl


async def delete_text_list(db: AsyncSession, tl_id: str, user_id: str) -> None:
    result = await db.execute(
        select(TextList).where(TextList.id == tl_id, TextList.user_id == user_id)
    )
    tl = result.scalar_one_or_none()
    if tl is None:
        raise ValueError("Text list not found")
    # Nullify FK on broadcast_jobs that reference this text list to avoid
    # IntegrityError (ForeignKeyViolationError) on delete.
    await db.execute(
        update(BroadcastJob).where(BroadcastJob.text_list_id == tl.id).values(text_list_id=None)
    )
    await db.delete(tl)


# ── Broadcast Jobs ───────────────────────────────────────────────────────────


async def start_broadcast(
    db: AsyncSession,
    user: User,
    account_ids: list[str],
    group_list_id: str,
    text_list_id: str | None,
    mode: str,
    custom_text: str | None,
    delay_per_group: int,
    delay_after_all: int,
    loop_enabled: bool = True,
    delay_randomized: bool = False,
    log_destination: str | None = None,
    schedule_enabled: bool = False,
    schedule_start_time: str | None = None,
    schedule_end_time: str | None = None,
    schedule_timezone: str = "Asia/Jakarta",
) -> BroadcastJob:
    # Enforce active subscription / trial before querying resources
    from app.services.redeem_service import is_subscription_active

    user_role = getattr(user, "role", "freetrial") or "freetrial"
    if not is_subscription_active(user):
        plan_display = {
            "freetrial": "Free Trial",
            "basic": "Starter",
            "pro": "Pro",
            "premium": "Business",
        }.get(user_role, user_role.capitalize())
        raise ValueError(
            f"Masa aktif paket {plan_display} Anda telah berakhir. "
            "Silakan berlangganan atau perpanjang paket Anda untuk melanjutkan siaran."
        )

    # Validate existence of accounts
    if not account_ids:
        raise ValueError("At least one account is required")

    from app.services.account_service import get_account

    valid_account_ids = []
    for acc_id in account_ids:
        account = await get_account(db, acc_id, str(user.id))
        if account is None:
            raise ValueError(f"Account {acc_id} not found")
        if is_account_restricted(account):
            raise ValueError(
                f"Akun {account.first_name or account.phone} sedang dibatasi Telegram "
                f"({account.restriction_status or account.spam_status}). "
                "Tunggu hingga pembatasan berakhir sebelum memulai siaran."
            )
        valid_account_ids.append(str(account.id))

    plan_max_accounts = {
        "freetrial": 1,
        "basic": 1,
        "pro": 3,
        "premium": 5,
        "owner": 9999,
    }
    max_allowed = plan_max_accounts.get(user_role, 1)
    if len(valid_account_ids) > max_allowed:
        plan_display = {
            "freetrial": "Free Trial",
            "basic": "Starter",
            "pro": "Pro",
            "premium": "Business",
        }.get(user_role, user_role.capitalize())
        raise ValueError(
            f"Paket {plan_display} hanya mengizinkan maksimal {max_allowed} akun pengirim siaran. "
            f"Anda memilih {len(valid_account_ids)} akun. Silakan upgrade paket Anda."
        )

    # Refuse to start on an account another active job is already sending from:
    # two jobs sharing one MTProto session interleave sends and burn the account.
    from app.utils.account_ownership import find_busy_accounts

    busy_accounts = await find_busy_accounts(db, valid_account_ids)
    if busy_accounts:
        raise ValueError(
            "Akun berikut sedang dipakai job lain yang aktif: "
            + ", ".join(busy_accounts)
            + ". Hentikan job tersebut atau tunggu selesai sebelum memulai yang baru."
        )

    gl_result = await db.execute(
        select(GroupList).where(GroupList.id == group_list_id, GroupList.user_id == user.id)
    )
    group_list = gl_result.scalar_one_or_none()
    if group_list is None:
        raise ValueError("Group list not found")

    # An empty list with loop enabled would spin forever doing nothing.
    if not group_list.items:
        raise ValueError(
            "Group list kosong. Tambahkan minimal satu grup sebelum memulai siaran."
        )

    text_list = None
    if text_list_id:
        tl_result = await db.execute(
            select(TextList).where(TextList.id == text_list_id, TextList.user_id == user.id)
        )
        text_list = tl_result.scalar_one_or_none()
        if text_list is None:
            raise ValueError("Text list not found")

    if mode == "single_text":
        has_custom = bool(custom_text and custom_text.strip())
        has_list_texts = bool(
            text_list and text_list.texts and any(t and t.strip() for t in text_list.texts)
        )
        if not has_custom and not has_list_texts:
            raise ValueError("single_text mode requires custom_text or text_list with non-empty content")
    else:
        if not text_list or not text_list.texts or not any(t and t.strip() for t in text_list.texts):
            raise ValueError(f"{mode} mode requires a text_list containing at least one non-empty message")

    # Free-tier users have a daily send-time budget. Checking here gives an
    # immediate, explainable refusal instead of a job that starts and stalls.
    from app.services.broadcast_entitlement import enforce_broadcast_allowance

    await enforce_broadcast_allowance(db, user)

    total_groups = len(group_list.items)

    initial_status = "running"
    initial_schedule_paused = False
    if schedule_enabled and schedule_start_time and schedule_end_time:
        from app.utils.schedule_helper import is_within_schedule
        is_active, _ = is_within_schedule(schedule_start_time, schedule_end_time, schedule_timezone)
        if not is_active:
            initial_status = "paused"
            initial_schedule_paused = True

    created_jobs: list[BroadcastJob] = []
    for acc_id in valid_account_ids:
        job = BroadcastJob(
            account_ids=[acc_id],
            user_id=user.id,
            group_list_id=group_list_id,
            text_list_id=text_list_id,
            mode=mode,
            custom_text=custom_text,
            status=initial_status,
            total_groups=total_groups,
            delay_per_group=delay_per_group,
            delay_after_all=delay_after_all,
            loop_enabled=loop_enabled,
            delay_randomized=delay_randomized,
            log_destination=log_destination,
            schedule_enabled=schedule_enabled,
            schedule_start_time=schedule_start_time,
            schedule_end_time=schedule_end_time,
            schedule_timezone=schedule_timezone,
            schedule_paused=initial_schedule_paused,
        )
        db.add(job)
        created_jobs.append(job)

    await db.flush()
    await db.commit()
    for job in created_jobs:
        await db.refresh(job)

    # Enqueue each broadcast job to Redis for dedicated async worker
    for idx, job in enumerate(created_jobs):
        try:
            await _dispatch_broadcast(db, job)
        except Exception:
            for remaining_job in created_jobs[idx + 1:]:
                remaining_job.status = "failed"
                remaining_job.completed_at = datetime.now(timezone.utc)
            await db.commit()
            raise

    primary_job = created_jobs[0]
    setattr(primary_job, "related_job_ids", [j.id for j in created_jobs])
    return primary_job


async def _dispatch_broadcast(db: AsyncSession, job: BroadcastJob) -> None:
    """Enqueue a broadcast job, failing it explicitly when Redis is unavailable.

    The job row is committed as "running" before dispatch, so a silently dropped
    enqueue would leave it hung forever and keep its accounts marked busy.
    """
    from app.utils.redis_dispatcher import enqueue_job

    primary_acc = job.account_ids[0] if job.account_ids else None
    if not await enqueue_job("broadcast", job.id, account_id=primary_acc):
        job.status = "failed"
        job.completed_at = datetime.now(timezone.utc)
        await db.commit()
        logger.error("Broadcast job %s could not be enqueued; marked failed", job.id)
        raise ValueError(
            "Gagal mengirim job siaran ke worker (Redis). Job dibatalkan, silakan coba lagi."
        )


# _wake_job is replaced by wake_job imported from app.utils.async_helpers
def _wake_job(job_id: str) -> None:
    wake_job(job_id)


async def get_job(db: AsyncSession, job_id: str, user_id: str) -> BroadcastJob | None:
    result = await db.execute(
        select(BroadcastJob).where(BroadcastJob.id == job_id, BroadcastJob.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def get_jobs_for_user(db: AsyncSession, user_id: str, limit: int = 20) -> list[BroadcastJob]:
    result = await db.execute(
        select(BroadcastJob)
        .where(BroadcastJob.user_id == user_id)
        .order_by(BroadcastJob.created_at.desc())
        .limit(limit)
    )
    return list(result.scalars().all())


async def get_broadcast_summary_for_user(db: AsyncSession, user_id: str | _uuid.UUID) -> dict:
    """Compute aggregate broadcast KPI summary metrics for a given user."""
    uid = _uuid.UUID(str(user_id)) if not isinstance(user_id, _uuid.UUID) else user_id
    result = await db.execute(
        select(
            BroadcastJob.status,
            BroadcastJob.account_ids,
            BroadcastJob.sent_count,
            BroadcastJob.fail_count,
        ).where(BroadcastJob.user_id == uid)
    )
    rows = result.all()
    total_jobs = len(rows)
    running_jobs = 0
    paused_jobs = 0
    completed_jobs = 0
    failed_jobs = 0
    cancelled_jobs = 0
    total_sent = 0
    total_failed = 0
    active_accounts: set[str] = set()
    all_accounts: set[str] = set()

    for job_status, account_ids, sent, fail in rows:
        if job_status == "running":
            running_jobs += 1
            if account_ids and isinstance(account_ids, list):
                active_accounts.update(str(a) for a in account_ids)
        elif job_status == "paused":
            paused_jobs += 1
            if account_ids and isinstance(account_ids, list):
                active_accounts.update(str(a) for a in account_ids)
        elif job_status == "completed":
            completed_jobs += 1
        elif job_status == "failed":
            failed_jobs += 1
        elif job_status == "cancelled":
            cancelled_jobs += 1

        if account_ids and isinstance(account_ids, list):
            all_accounts.update(str(a) for a in account_ids)
        total_sent += (sent or 0)
        total_failed += (fail or 0)

    return {
        "total_jobs": total_jobs,
        "running_jobs": running_jobs,
        "paused_jobs": paused_jobs,
        "completed_jobs": completed_jobs,
        "failed_jobs": failed_jobs,
        "cancelled_jobs": cancelled_jobs,
        "active_accounts_count": len(active_accounts),
        "active_account_ids": sorted(active_accounts),
        "total_accounts_used": len(all_accounts),
        "total_sent": total_sent,
        "total_failed": total_failed,
    }



async def update_job_status(db: AsyncSession, job: BroadcastJob, status: str) -> None:
    job.status = status
    if status in ("completed", "cancelled", "failed"):
        job.completed_at = datetime.now(timezone.utc)
    await db.flush()
    # Wake up the job if it's currently sleeping so it picks up the new status
    _wake_job(str(job.id))


async def delete_job(db: AsyncSession, job_id: str, user_id: str) -> None:
    """Delete a broadcast job and its logs. Only terminal-status jobs can be deleted."""
    result = await db.execute(
        select(BroadcastJob).where(BroadcastJob.id == job_id, BroadcastJob.user_id == user_id)
    )
    job = result.scalar_one_or_none()
    if job is None:
        raise ValueError("Job not found")
    if job.status in ("running", "paused"):
        raise ValueError("Cannot delete an active job — stop it first")
    await db.delete(job)
    await db.flush()


async def retry_job(
    db: AsyncSession,
    job_id: str,
    user_id: str,
    user: User | None = None,
) -> BroadcastJob:
    """Reset and re-queue a terminal broadcast job with the same parameters."""
    if user is None:
        user_res = await db.execute(select(User).where(User.id == _uuid.UUID(user_id)))
        user = user_res.scalar_one_or_none()
    if user is None:
        raise ValueError("User not found")

    from app.services.redeem_service import is_subscription_active, auto_downgrade_if_expired
    from app.services.broadcast_entitlement import enforce_broadcast_allowance

    await auto_downgrade_if_expired(db, user)
    user_role = getattr(user, "role", "freetrial") or "freetrial"
    if not is_subscription_active(user):
        plan_display = {
            "freetrial": "Free Trial",
            "basic": "Starter",
            "pro": "Pro",
            "premium": "Business",
        }.get(user_role, user_role.capitalize())
        raise ValueError(
            f"Masa aktif paket {plan_display} Anda telah berakhir. "
            "Silakan berlangganan atau perpanjang paket Anda untuk melanjutkan siaran."
        )

    await enforce_broadcast_allowance(db, user)

    result = await db.execute(
        select(BroadcastJob).where(BroadcastJob.id == job_id, BroadcastJob.user_id == user_id)
    )
    job = result.scalar_one_or_none()
    if job is None:
        raise ValueError("Job not found")
    if job.status not in ("completed", "cancelled", "failed"):
        raise ValueError(f"Cannot retry a job with status '{job.status}'")

    from app.services.account_service import get_account
    from app.utils.account_ownership import find_busy_accounts

    valid_account_ids = []
    for acc_id in (job.account_ids or []):
        account = await get_account(db, str(acc_id), str(user.id))
        if account is not None and account.is_active and not account.for_sale:
            if is_account_restricted(account):
                continue
            valid_account_ids.append(str(account.id))

    if not valid_account_ids:
        raise ValueError("Tidak ada akun pengirim yang valid atau aktif untuk mengulang job ini.")

    plan_max_accounts = {
        "freetrial": 1,
        "basic": 1,
        "pro": 3,
        "premium": 5,
        "owner": 9999,
    }
    max_allowed = plan_max_accounts.get(user_role, 1)
    if len(valid_account_ids) > max_allowed:
        raise ValueError(
            f"Paket Anda saat ini hanya mengizinkan maksimal {max_allowed} akun pengirim siaran."
        )

    busy_accounts = await find_busy_accounts(db, valid_account_ids)
    if busy_accounts:
        raise ValueError(
            "Akun berikut sedang dipakai job lain yang aktif: "
            + ", ".join(busy_accounts)
            + ". Hentikan job tersebut atau tunggu selesai sebelum memulai yang baru."
        )

    job.account_ids = valid_account_ids
    # Reset job state — old logs remain
    job.status = "running"
    job.progress = 0
    job.sent_count = 0
    job.fail_count = 0
    job.completed_at = None
    # Clear target bookkeeping so a retry re-attempts every target instead of
    # re-skipping the permanently-failed ones and self-failing on a dead list.
    job.permanent_failures = []
    job.pending_items = []
    await db.flush()
    await db.commit()
    await db.refresh(job)

    # Enqueue broadcast job to Redis for dedicated async worker
    await _dispatch_broadcast(db, job)

    return job


async def get_job_logs(
    db: AsyncSession,
    job_id: str,
    filters: dict | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[BroadcastLog]:
    try:
        jid = uuid.UUID(job_id) if isinstance(job_id, str) else job_id
    except (ValueError, TypeError):
        jid = job_id

    query = select(BroadcastLog).where(BroadcastLog.job_id == jid)

    if filters and filters.get("cycle"):
        query = query.where(BroadcastLog.cycle_number == int(filters["cycle"]))

    query = query.order_by(BroadcastLog.cycle_number.desc()).offset(offset).limit(limit)
    result = await db.execute(query)
    cycle_logs = list(result.scalars().all())

    # If status, error_type, or search filters are applied, filter the items within details
    if filters and (filters.get("status") or filters.get("error_type") or filters.get("search")):
        st_filter = filters.get("status")
        err_filter = filters.get("error_type")
        s_filter = filters.get("search", "").lower()

        filtered_logs = []
        for cl in cycle_logs:
            matched_details = []
            for d in (cl.details or []):
                if st_filter and d.get("status") != st_filter:
                    continue
                if err_filter and d.get("error_type") != err_filter:
                    continue
                if s_filter and s_filter not in (d.get("group_identifier") or "").lower():
                    continue
                matched_details.append(d)

            cl_copy = BroadcastLog(
                id=cl.id,
                job_id=cl.job_id,
                cycle_number=cl.cycle_number,
                total_groups=cl.total_groups,
                sent_count=sum(1 for d in matched_details if d.get("status") == "success"),
                fail_count=sum(1 for d in matched_details if d.get("status") == "error"),
                duration_ms=cl.duration_ms,
                created_at=cl.created_at,
                details=matched_details,
            )
            filtered_logs.append(cl_copy)
        return filtered_logs

    return cycle_logs


# ── Broadcast Execution (runs as asyncio.Task in-process) ─────────────────────


async def _push_broadcast(job_id: str, event_type: str, data: dict) -> None:
    """Push a real-time event to WebSocket clients subscribed to this job."""
    channel = f"broadcast:{job_id}"
    payload = {"type": event_type, **data}
    try:
        from app.utils.redis_dispatcher import publish_ws_event

        await publish_ws_event(channel, payload)
    except Exception as push_exc:
        logger.warning("Redis WS push failed for job %s: %s", job_id, push_exc)

    try:
        from app.api.ws import manager

        if manager.has_channel(channel):
            await manager.broadcast(channel, payload)
    except Exception:
        pass


async def _account_for_log(
    account_id: str, db: AsyncSession | None = None
) -> TelegramAccount | None:
    """Fetch a TelegramAccount by id-string for log labeling."""
    import uuid as _uuid

    try:
        acc_uuid = _uuid.UUID(account_id)
    except (ValueError, TypeError):
        return None

    if db is not None:
        res = await db.execute(select(TelegramAccount).where(TelegramAccount.id == acc_uuid))
        return res.scalar_one_or_none()

    from app.database import async_session_factory

    async with async_session_factory() as fresh_db:
        res = await fresh_db.execute(select(TelegramAccount).where(TelegramAccount.id == acc_uuid))
        return res.scalar_one_or_none()


# _invite_hash is imported from app.utils.telethon_helpers


def _chatlist_slug(target: str) -> str | None:
    text = target.strip()
    if "t.me/addlist/" in text:
        return text.split("t.me/addlist/", 1)[1].split("?", 1)[0].strip("/")
    if "telegram.me/addlist/" in text:
        return text.split("telegram.me/addlist/", 1)[1].split("?", 1)[0].strip("/")
    if text.startswith("addlist/"):
        return text.split("addlist/", 1)[1].split("?", 1)[0].strip("/")
    return None


# _public_target is imported from app.utils.telethon_helpers


def _chatlist_peers(invite) -> list:
    if hasattr(invite, "peers"):
        return list(invite.peers or [])
    peers = []
    peers.extend(getattr(invite, "missing_peers", []) or [])
    peers.extend(getattr(invite, "already_peers", []) or [])
    return peers


async def _join_and_resolve_chatlist(client, target: str) -> list:
    from telethon.tl.functions.chatlists import (
        CheckChatlistInviteRequest,
        JoinChatlistInviteRequest,
    )

    slug = _chatlist_slug(target)
    if not slug:
        return []

    invite = await client(CheckChatlistInviteRequest(slug))
    peers = _chatlist_peers(invite)
    invite_chats = list(getattr(invite, "chats", None) or [])
    chats_by_id = { getattr(c, "id", None): c for c in invite_chats if getattr(c, "id", None) is not None }

    input_peers = []
    for peer in peers:
        try:
            input_peers.append(await client.get_input_entity(peer))
        except Exception:
            pass

    if input_peers:
        try:
            await client(JoinChatlistInviteRequest(slug, input_peers))
        except Exception:
            pass

    entities = []
    for peer in peers:
        peer_id = getattr(peer, "channel_id", None) or getattr(peer, "chat_id", None) or getattr(peer, "user_id", None)
        if peer_id is not None and peer_id in chats_by_id:
            entities.append(chats_by_id[peer_id])
            continue
        try:
            entities.append(await client.get_input_entity(peer))
        except Exception:
            pass
    return entities


async def check_send_permission(client, entity) -> tuple[bool, str | None]:
    """
    Checks if the client has permission to send messages in the group or channel.
    Returns (bool, reason) where bool is True if allowed, False otherwise.
    """
    from telethon.tl.types import Channel, Chat
    from telethon.errors import UserNotParticipantError

    try:
        if not isinstance(entity, (Channel, Chat)):
            return True, None

        permissions = await client.get_permissions(entity, "me")

        if permissions.has_left:
            return False, "You are not a participant in this chat"

        if getattr(entity, "broadcast", False):
            if permissions.is_creator or (permissions.is_admin and permissions.post_messages):
                return True, None
            else:
                return False, "Only admins can write in this group"

        default_banned_rights = getattr(entity, "default_banned_rights", None)
        if default_banned_rights and default_banned_rights.send_messages:
            if not (permissions.is_admin or permissions.is_creator):
                return False, "Only admins can write in this group"

        banned_rights = getattr(getattr(permissions, "participant", None), "banned_rights", None)
        if permissions.is_banned or banned_rights:
            if banned_rights and (
                getattr(banned_rights, "send_messages", False)
                or getattr(banned_rights, "send_plain", False)
            ):
                until_date = getattr(banned_rights, "until_date", None)
                now_utc = datetime.now(timezone.utc)
                if until_date:
                    if isinstance(until_date, (int, float)):
                        until_dt = datetime.fromtimestamp(until_date, tz=timezone.utc)
                    else:
                        until_dt = (
                            until_date
                            if getattr(until_date, "tzinfo", None)
                            else until_date.replace(tzinfo=timezone.utc)
                        )

                    diff_sec = (until_dt - now_utc).total_seconds()
                    if 0 < diff_sec <= 366 * 86400:
                        mins = max(1, int(diff_sec // 60))
                        hours = mins // 60
                        rem_m = mins % 60
                        time_str = f"{hours}h {rem_m}m" if hours > 0 else f"{rem_m}m"
                        return (
                            False,
                            f"You are muted temporarily until {until_dt.strftime('%d-%m-%Y %H:%M UTC')} ({time_str} remaining)",
                        )

                return False, "You are muted permanently in this group"

        return True, None
    except UserNotParticipantError:
        return False, "You are not a participant in this chat"
    except Exception as e:
        logger.debug(f"Error checking chat permissions: {e}")
        return True, None


# _join_and_resolve_target is imported from app.utils.telethon_helpers


async def _broadcast_entities_for_target(
    client, target: str, job_id_str: str | None = None
) -> list:
    if _chatlist_slug(target):
        entities = await _join_and_resolve_chatlist(client, target)
        if entities:
            # Filter out admin-only entities from chatlists
            from telethon.tl.types import Channel

            filtered = []
            for ent in entities:
                if isinstance(ent, Channel):
                    dbr = getattr(ent, "default_banned_rights", None)
                    if dbr and (
                        getattr(dbr, "send_messages", False) or getattr(dbr, "send_plain", False)
                    ):
                        logger.info(
                            "Skipping admin-only chat in chatlist: %s",
                            getattr(ent, "title", target),
                        )
                        continue
                filtered.append(ent)
            return filtered if filtered else entities  # fallback to original if all filtered
    return [await _join_and_resolve_target(client, target, job_id_str)]


async def _get_broadcast_job_status(jid: uuid.UUID | str) -> str | None:
    """Helper to check and retrieve the current status of the job using a fresh session."""
    from app.database import async_session_factory
    from sqlalchemy.exc import DBAPIError, SQLAlchemyError
    for attempt in range(4):
        try:
            async with async_session_factory() as sdb:
                res = await sdb.execute(select(BroadcastJob.status).where(BroadcastJob.id == jid))
                return res.scalar_one_or_none()
        except (SQLAlchemyError, DBAPIError, OSError, asyncio.TimeoutError) as db_err:
            if attempt < 3:
                await asyncio.sleep(1.0 * (attempt + 1))
                continue
            logger.warning("Transient error retrieving broadcast job status for %s: %s", jid, db_err)
            return None


async def _flush_cycle_logs(
    job_uuid: uuid.UUID | str,
    cycle_number: int,
    details: list[dict],
    total_groups: int = 0,
    sent: int | None = None,
    failed: int | None = None,
    progress: int | None = None,
    duration_ms: int | None = None,
) -> None:
    """Save or update the single cycle-level BroadcastLog row in PostgreSQL with JSONB details.

    Also updates sent_count, fail_count, and progress on the BroadcastJob record.

    The parent job may already be gone by the time a late flush lands -- an owner
    can delete a job from the admin panel (or a terminal job can be swept) while
    the worker task is still unwinding and holding buffered cycle details. Since
    broadcast_logs has ON DELETE CASCADE, the insert would then fail with a
    ForeignKeyViolationError (PYTHON-FASTAPI-1M). Losing buffered delivery
    details for a job the owner already deleted is the intended outcome, so the
    flush is skipped instead of raised. The job row is read FOR UPDATE so a
    concurrent DELETE cannot slip between that read and the log INSERT.
    """
    if not details and sent is None and failed is None and progress is None:
        return

    from app.database import async_session_factory

    try:
        job_uuid_obj = uuid.UUID(str(job_uuid))
    except (ValueError, TypeError):
        job_uuid_obj = job_uuid

    cycle_details_copy = list(details)

    async with async_session_factory() as db:
        # Always resolve the job, even with no counters to write: its absence is
        # what decides whether the log INSERT below is legal.
        job_res = await db.execute(
            select(BroadcastJob).where(BroadcastJob.id == job_uuid_obj).with_for_update()
        )
        db_job = job_res.scalar_one_or_none()

        if db_job is None:
            logger.info(
                "Skipping cycle %d log flush for job %s: job row no longer exists",
                cycle_number,
                job_uuid_obj,
            )
            # The job is gone for good, so its buffered details have nowhere to
            # go — safe to drop the caller's buffer here.
            details.clear()
            return

        if sent is not None:
            db_job.sent_count = sent
        if failed is not None:
            db_job.fail_count = failed
        if progress is not None:
            db_job.progress = progress

        if cycle_details_copy:
            # Check if this cycle log row already exists
            log_res = await db.execute(
                select(BroadcastLog).where(
                    BroadcastLog.job_id == job_uuid_obj,
                    BroadcastLog.cycle_number == cycle_number,
                )
            )
            db_log = log_res.scalar_one_or_none()
            if db_log:
                existing_details = list(db_log.details or [])
                existing_details.extend(cycle_details_copy)
                db_log.details = existing_details
                db_log.sent_count = sum(1 for d in existing_details if d.get("status") == "success")
                db_log.fail_count = sum(1 for d in existing_details if d.get("status") == "error")
                db_log.total_groups = max(total_groups, len(existing_details))
                if duration_ms is not None:
                    db_log.duration_ms = duration_ms
            else:
                cycle_sent = sum(1 for d in cycle_details_copy if d.get("status") == "success")
                cycle_failed = sum(1 for d in cycle_details_copy if d.get("status") == "error")
                new_log = BroadcastLog(
                    job_id=job_uuid_obj,
                    cycle_number=cycle_number,
                    total_groups=total_groups or len(cycle_details_copy),
                    sent_count=cycle_sent,
                    fail_count=cycle_failed,
                    duration_ms=duration_ms,
                    created_at=datetime.now(timezone.utc),
                    details=cycle_details_copy,
                )
                db.add(new_log)

            # Track broadcast cycle telemetry idempotently
            try:
                from app.services.analytics_tracking_service import track_broadcast_cycle

                await track_broadcast_cycle(
                    db=db,
                    user_id=db_job.user_id,
                    job_id=job_uuid_obj,
                    cycle_number=cycle_number,
                    sent_count=db_log.sent_count if db_log else cycle_sent,
                    fail_count=db_log.fail_count if db_log else cycle_failed,
                    total_groups=total_groups or len(cycle_details_copy),
                )
            except Exception as exc:
                logger.debug("Could not record analytics broadcast cycle event: %s", exc)

        await db.commit()

    # Drop the caller's buffer only after the write is durable. Clearing it
    # before the commit (as this once did) lost the cycle's send-time accounting
    # for free-tier users whenever the commit failed.
    details.clear()


async def _resolve_job_watermark(db, user_id) -> str | None:
    """Return the watermark template this job's owner must send under, or None.

    Resolved once at job start. An owner who upgrades mid-broadcast keeps the
    watermark until the next job, which is the safe direction: never watermark
    a paid message, but always watermark one that started on the free tier.
    """
    from app.models.user import User
    from app.services.broadcast_entitlement import (
        get_watermark_config,
        render_watermark,
        requires_watermark,
    )

    try:
        result = await db.execute(select(User.role).where(User.id == user_id))
        role = result.scalar_one_or_none()
    except Exception as exc:
        # Never let an entitlement lookup break a send loop. If the role cannot
        # be read, fall back to the most restrictive reading.
        logger.warning("Could not resolve broadcast role for user %s: %s", user_id, exc)
        role = "basic"

    if not requires_watermark(role or "basic"):
        return None

    try:
        enabled, template = await get_watermark_config(db)
    except Exception as exc:
        logger.warning("Could not resolve broadcast watermark settings: %s", exc)
        return None

    if not enabled:
        return None
    return render_watermark(template) or None


def _watermark_for_job(watermark_template: str | None, text: str) -> str:
    """Append the resolved watermark to one outgoing message.

    Kept as a pure function so the send loop stays free of I/O and so the
    behaviour is directly testable.
    """
    if not watermark_template or not text:
        return text
    if watermark_template in text:
        return text
    return f"{text}\n\n{watermark_template}"


def _u16_len(ch: str) -> int:
    """UTF-16 code-unit length of one Python character (Telegram entity unit)."""
    return 2 if ord(ch) > 0xFFFF else 1


def _parse_html_with_spoilers(raw: str) -> tuple[str, list]:
    """Parse Telegram HTML markup, adding ``<tg-spoiler>`` support.

    Telethon 1.45's ``html.parse`` drops ``<tg-spoiler>`` silently (no entity is
    produced), which is why spoiler text arrived unformatted. The spoiler regions
    are marked with private-use sentinels, everything else is parsed by Telethon,
    then the sentinels are removed and a ``MessageEntitySpoiler`` is emitted for
    each region. All entity offsets are kept in UTF-16 code units (what Telegram
    expects) so emoji inside/around the markup stay aligned.
    """
    from telethon.extensions import html as tl_html
    from telethon.tl.types import MessageEntitySpoiler

    import re

    open_mark = "\ue000"
    close_mark = "\ue001"

    marked = re.sub(r"<tg-spoiler\s*>", open_mark, raw, flags=re.IGNORECASE)
    marked = re.sub(r"</tg-spoiler\s*>", close_mark, marked, flags=re.IGNORECASE)

    text, entities = tl_html.parse(marked)

    out_chars: list[str] = []
    map_start: list[int] = []  # per text UTF-16 unit -> output offset (-1 = removed)
    map_end: list[int] = []  # per text UTF-16 unit -> output offset just past the char
    stack: list[int] = []
    spoilers: list[tuple[int, int]] = []
    out_u16 = 0
    for ch in text:
        u = _u16_len(ch)
        if ch == open_mark or ch == close_mark:
            if ch == open_mark:
                stack.append(out_u16)
            elif stack:
                start = stack.pop()
                if out_u16 > start:
                    spoilers.append((start, out_u16 - start))
            map_start.extend([-1] * u)
            map_end.extend([-1] * u)
            continue
        map_start.extend([out_u16] * u)
        map_end.extend([out_u16 + u] * u)
        out_chars.append(ch)
        out_u16 += u
    clean = "".join(out_chars)

    def _remap(offset: int, length: int) -> tuple[int, int] | None:
        kept = [
            i
            for i in range(offset, min(offset + length, len(map_start)))
            if map_start[i] >= 0
        ]
        if not kept:
            return None
        return map_start[kept[0]], map_end[kept[-1]] - map_start[kept[0]]

    merged = []
    for ent in entities:
        span = _remap(ent.offset, ent.length)
        if span is None:
            continue
        ent.offset, ent.length = span
        merged.append(ent)

    for start, length in spoilers:
        merged.append(MessageEntitySpoiler(offset=start, length=length))

    merged.sort(key=lambda e: (e.offset, -e.length))
    return clean, merged


async def _send_broadcast_message(client, entity, text: str) -> None:
    """Send one broadcast message, rendering the stored HTML markup.

    Text lists hold raw HTML (``<b>``, ``<i>``, ``<code>``, ``<blockquote>``,
    ``<tg-spoiler>`` …). The clients here have no default parse mode, so the
    markup is rendered explicitly, including ``<tg-spoiler>`` which Telethon's own
    parser does not support. Falls back to Telethon's HTML parser if the markup is
    malformed so a stray tag never blocks delivery.
    """
    try:
        clean, entities = _parse_html_with_spoilers(text)
    except Exception:
        await client.send_message(entity, text, parse_mode="html")
        return
    await client.send_message(entity, clean, formatting_entities=entities or None)


async def execute_broadcast(job_id: str):
    """Execute a broadcast job. Runs as an asyncio.Task in the FastAPI process."""
    from app.database import async_session_factory
    from telethon.utils import get_peer_id

    try:
        job_uuid = uuid.UUID(job_id) if isinstance(job_id, str) else job_id
    except ValueError:
        job_uuid = job_id

    job_id_str = str(job_uuid)
    _get_current_status = _get_broadcast_job_status

    pending_cycle_details: list[dict] = []
    current_cycle_number: int = 1
    cycle_start_time: float = time.time()
    total_items_count: int = 0
    sent: int = 0
    failed: int = 0
    last_progress: int = 0
    account_snapshots: list[dict] = []
    account_ids: list[str] = []

    try:
        # ── Initial setup: copy DB data before any Telegram/network I/O ──
        # Never hold a checked-out DB connection while connecting accounts.
        async with async_session_factory() as db:
            result = await db.execute(select(BroadcastJob).where(BroadcastJob.id == job_uuid))
            job_orm = result.scalar_one_or_none()
            if job_orm is None or job_orm.status in ("cancelled", "completed"):
                return

            loop_enabled = job_orm.loop_enabled
            schedule_enabled = bool(getattr(job_orm, "schedule_enabled", False))
            schedule_start_time = getattr(job_orm, "schedule_start_time", None)
            schedule_end_time = getattr(job_orm, "schedule_end_time", None)
            schedule_timezone = getattr(job_orm, "schedule_timezone", "Asia/Jakarta") or "Asia/Jakarta"
            schedule_paused = bool(getattr(job_orm, "schedule_paused", False))

            if schedule_enabled and schedule_start_time and schedule_end_time:
                from app.utils.schedule_helper import is_within_schedule
                is_active, _ = is_within_schedule(schedule_start_time, schedule_end_time, schedule_timezone)
                if not is_active:
                    job_orm.status = "paused"
                    job_orm.schedule_paused = True
                    schedule_paused = True
                else:
                    if job_orm.status != "paused" or job_orm.schedule_paused:
                        job_orm.status = "running"
                        job_orm.schedule_paused = False
                        schedule_paused = False
            else:
                if job_orm.status != "paused":
                    job_orm.status = "running"
            await db.commit()
            job_user_id = str(job_orm.user_id)
            delay_randomized = job_orm.delay_randomized
            delay_per_group = job_orm.delay_per_group
            delay_after_all = job_orm.delay_after_all
            log_destination = job_orm.log_destination
            mode = job_orm.mode
            custom_text = job_orm.custom_text
            account_ids = list(job_orm.account_ids or [])
            # sent/failed are LIFETIME cumulative totals: they seed from the job's
            # stored counts and keep growing across every loop cycle. Per-cycle
            # totals are tracked separately in cycle_sent/cycle_failed.
            sent = job_orm.sent_count or 0
            failed = job_orm.fail_count or 0
            last_progress = job_orm.progress or 0
            total_groups = job_orm.total_groups
            total_items_count = total_groups
            group_list_id = job_orm.group_list_id
            text_list_id = job_orm.text_list_id
            persisted_permanent_failures = [
                str(x) for x in (getattr(job_orm, "permanent_failures", None) or [])
            ]
            persisted_pending_items = list(getattr(job_orm, "pending_items", None) or [])

            gl_result = await db.execute(select(GroupList).where(GroupList.id == group_list_id))
            group_list = gl_result.scalar_one_or_none()
            if not group_list or not account_ids:
                job_orm.status = "failed"
                await db.commit()
                await _push_broadcast(
                    job_id_str,
                    "error",
                    {
                        "status": "failed",
                        "message": "Group list or accounts not configured properly",
                    },
                )
                return
            items = list(group_list.items or [])
            total_items_count = len(items)
            group_list_name = group_list.name

            texts = []
            if text_list_id:
                tl_result = await db.execute(select(TextList).where(TextList.id == text_list_id))
                text_list = tl_result.scalar_one_or_none()
                if text_list and text_list.texts:
                    texts = [t.strip() for t in text_list.texts if t and t.strip()]
            if mode == "single_text" and custom_text and custom_text.strip():
                texts = [custom_text.strip()]

            if not texts:
                job_orm.status = "failed"
                await db.commit()
                await _push_broadcast(
                    job_id_str,
                    "error",
                    {
                        "status": "failed",
                        "message": "Broadcast text is empty or missing. Please provide at least one valid message.",
                    },
                )
                return

            # Resolve the watermark once per job. The owner's role and the
            # watermark template cannot change mid-run, and the send loop must
            # not hit the database once per message.
            watermark_template = await _resolve_job_watermark(db, job_orm.user_id)

            account_snapshots = []
            restricted_skipped = 0
            for acc_id_str in account_ids:
                try:
                    acc_uuid = _uuid.UUID(acc_id_str)
                except (ValueError, TypeError):
                    continue
                acc_result = await db.execute(
                    select(TelegramAccount).where(
                        TelegramAccount.id == acc_uuid,
                        TelegramAccount.user_id == job_orm.user_id,
                    )
                )
                account = acc_result.scalar_one_or_none()
                if not account or account.for_sale or not account.is_active:
                    logger.warning(
                        "Account %s is not active or listed for sale, skipping", acc_id_str
                    )
                    continue
                if is_account_restricted(account):
                    restricted_skipped += 1
                    logger.warning(
                        "Account %s is restricted (%s) by Telegram, skipping for broadcast",
                        acc_id_str,
                        account.restriction_status or account.spam_status,
                    )
                    continue
                account_snapshots.append(
                    {
                        "account_id": acc_id_str,
                        "account_name": f"{account.first_name or ''} ({account.phone or ''})",
                        "session_string": account.session_string,
                        "auto_reply_enabled": bool(account.auto_reply_enabled),
                    }
                )

            cycle_res = await db.execute(
                select(func.max(BroadcastLog.cycle_number)).where(BroadcastLog.job_id == job_uuid)
            )
            max_cycle = cycle_res.scalar()
            cycle_count = max_cycle if max_cycle is not None else 0

        current_status_val = "paused" if schedule_paused else "running"
        await _push_broadcast(
            job_id_str,
            "status",
            {
                "status": current_status_val,
                "total": total_groups,
                "sent": sent,
                "failed": failed,
                "message": (
                    f"Menunggu jadwal siaran aktif ({schedule_start_time} - {schedule_end_time} WIB)..."
                    if schedule_paused
                    else None
                ),
            },
        )

        # Account setup: claim worker leases and prepare accounts for broadcast.
        # Clients are borrowed on-demand per-send and released immediately before sleeps,
        # ensuring bounded memory usage across concurrent jobs without idle connection leaks.
        active_accounts = []
        for snapshot in account_snapshots:
            acc_id_str = snapshot["account_id"]
            try:
                # Take exclusive ownership before connecting. A live job is the
                # authoritative claim, so the worker takes the account even if
                # the backend still holds a lease; the backend's health loop
                # stands down on the next pass.
                if not await acquire_lease(acc_id_str, OWNER_WORKER, force=True):
                    logger.warning(
                        "Could not claim ownership of account %s for broadcast", acc_id_str
                    )
                # Verify decryptable session string
                decrypted_session = decrypt(snapshot.get("session_string"))
                if not decrypted_session:
                    logger.warning("Account %s has invalid session string, skipping", acc_id_str)
                    continue

                # Attach event_relay so auto-reply continues functioning during broadcast if enabled
                if snapshot.get("auto_reply_enabled"):
                    try:
                        await event_relay.attach(acc_id_str, decrypted_session)
                    except Exception as attach_exc:
                        logger.warning("Could not attach event_relay for account %s during broadcast: %s", acc_id_str, attach_exc)

                active_accounts.append(
                    {
                        "account_id": acc_id_str,
                        "account_name": snapshot["account_name"],
                        "session_string": snapshot.get("session_string"),
                        "cooldown_until": 0.0,
                        "join_cooldown_until": 0.0,
                    }
                )
            except Exception as prep_exc:
                logger.warning("Could not prepare account %s for broadcast: %s", acc_id_str, prep_exc)


        if not active_accounts:
            async with async_session_factory() as db:
                result = await db.execute(select(BroadcastJob).where(BroadcastJob.id == job_uuid))
                db_job = result.scalar_one_or_none()
                if db_job:
                    if restricted_skipped and not account_snapshots:
                        # Every sender is currently restricted by Telegram. Pause
                        # (never cancel) so the job can resume once an account
                        # recovers.
                        db_job.status = "paused"
                    else:
                        db_job.status = "failed"
                    await db.commit()
            await _push_broadcast(
                job_id_str,
                "status" if (restricted_skipped and not account_snapshots) else "error",
                {
                    "status": "paused" if (restricted_skipped and not account_snapshots) else "failed",
                    "message": (
                        "Semua akun pengirim dibatasi Telegram. Job dijeda."
                        if (restricted_skipped and not account_snapshots)
                        else "No authorized Telegram accounts could be connected"
                    ),
                },
            )
            return

        current_acc_idx = 0

        async def _handle_account_failure(acc_to_remove: dict[str, Any], reason: str) -> None:
            nonlocal current_acc_idx
            a_id = acc_to_remove["account_id"]
            a_name = acc_to_remove.get("account_name", a_id)
            await _push_broadcast(
                job_id_str,
                "account_failed",
                {
                    "account": a_name,
                    "message": f"Account {a_name} session is revoked or banned ({reason}). Removing.",
                },
            )
            try:
                await event_relay.detach(a_id)
            except Exception as detach_err:
                logger.warning("Could not detach event_relay for account %s: %s", a_id, detach_err)
            try:
                await client_pool.remove(a_id)
            except Exception as pool_err:
                logger.warning("Could not remove client %s from pool: %s", a_id, pool_err)

            try:
                async with async_session_factory() as db_session:
                    acc = await _account_for_log(a_id, db_session)
                    if acc:
                        acc.is_active = False
                        await db_session.commit()
            except Exception as db_err:
                logger.warning("Could not mark account %s inactive in DB: %s", a_id, db_err)

            if acc_to_remove in active_accounts:
                active_accounts.remove(acc_to_remove)
            if active_accounts and current_acc_idx >= len(active_accounts):
                current_acc_idx = 0

        async def _stop_job_all_accounts_failed(current_progress_val: int) -> None:
            if pending_cycle_details:
                await _flush_cycle_logs(
                    job_uuid,
                    cycle_number=current_cycle_number,
                    details=pending_cycle_details,
                    total_groups=total_items_count,
                    sent=sent,
                    failed=failed,
                    progress=current_progress_val,
                )
            async with async_session_factory() as db_fail:
                result = await db_fail.execute(
                    select(BroadcastJob).where(BroadcastJob.id == job_uuid)
                )
                db_job = result.scalar_one_or_none()
                if db_job:
                    db_job.status = "failed"
                    db_job.sent_count = sent
                    db_job.fail_count = failed
                    db_job.completed_at = datetime.now(timezone.utc)
                    await db_fail.commit()
            await _push_broadcast(
                job_id_str,
                "error",
                {
                    "status": "failed",
                    "message": "All Telegram accounts have been limited or failed. Job stopped.",
                },
            )

        async def _ensure_account_spam_checked(a_id: str) -> bool:
            """Ask @SpamBot whether an account that raised USER_BANNED_IN_CHANNEL
            is under a global spam restriction.

            Telegram returns the generic ``USER_BANNED_IN_CHANNEL`` ("You're banned
            from sending messages in supergroups/channels") both for a per-group ban
            and for an account-level limit, so a ban alone is not conclusive. This
            probe returns True only when SpamBot reports the account as limited, and
            is debounced per account so a genuine per-group ban does not trigger a
            SpamBot call on every target.
            """
            now = time.time()
            if now - spam_checked_at.get(a_id, 0.0) < SPAM_RECHECK_INTERVAL:
                return a_id in limited_accounts
            spam_checked_at[a_id] = now
            try:
                from app.services.account_service import check_spam_status

                async with async_session_factory() as sdb:
                    acc = (
                        await sdb.execute(
                            select(TelegramAccount).where(TelegramAccount.id == _uuid.UUID(a_id))
                        )
                    ).scalar_one_or_none()
                    if acc is None:
                        return False
                    await check_spam_status(sdb, acc)
                    is_limited = acc.spam_status == "limited"
                    await sdb.commit()
            except Exception as spam_exc:
                logger.warning("Spam status check failed for account %s: %s", a_id, spam_exc)
                return a_id in limited_accounts
            if is_limited:
                limited_accounts.add(a_id)
                logger.warning(
                    "Account %s is spam-limited by Telegram (spam_status=limited)",
                    a_id,
                )
            return is_limited

        async def _retire_restricted_account(
            acc_to_remove: dict[str, Any],
            status: str,
            reason: str,
            current_progress_val: int,
        ) -> None:
            """Hold an account restricted by Telegram out of the job's rotation.

            The account is neither cancelled nor deactivated — a frozen method,
            spam limit, or ban is an account-level condition that can recover.
            The job keeps running with the remaining accounts; if none remain it
            is paused (not cancelled) so an automatic/manual resume can continue
            once an account is usable again.
            """
            nonlocal current_acc_idx
            a_id = acc_to_remove["account_id"]
            a_name = acc_to_remove.get("account_name", a_id)

            try:
                await event_relay.detach(a_id)
            except Exception as detach_err:
                logger.warning("Could not detach event_relay for account %s: %s", a_id, detach_err)
            try:
                await client_pool.remove(a_id)
            except Exception as pool_err:
                logger.warning("Could not remove client %s from pool: %s", a_id, pool_err)

            try:
                async with async_session_factory() as db_session:
                    acc = await _account_for_log(a_id, db_session)
                    if acc is not None:
                        mark_account_restricted(acc, status, detail=reason)
                        await db_session.commit()
            except Exception as db_err:
                logger.warning("Could not persist restriction for account %s: %s", a_id, db_err)

            if acc_to_remove in active_accounts:
                active_accounts.remove(acc_to_remove)
            if active_accounts and current_acc_idx >= len(active_accounts):
                current_acc_idx = 0

            logger.warning(
                "Account %s (%s) restricted by Telegram: %s — removed from job %s rotation",
                a_id,
                a_name,
                status,
                job_id_str,
            )
            await _push_broadcast(
                job_id_str,
                "account_restricted",
                {
                    "account": a_name,
                    "restriction": status,
                    "message": (
                        f"Akun {a_name} dibatasi oleh Telegram ({status}). "
                        "Dikeluarkan dari rotasi; job lanjut dengan akun lain."
                    ),
                },
            )

        async def _pause_job_no_accounts(message: str, current_progress_val: int) -> None:
            """Pause (never cancel) a job that has no usable accounts left.

            All remaining senders are temporarily restricted. Pausing keeps the
            job alive so it can resume once an account recovers, instead of
            hard-cancelling the user's campaign.
            """
            if pending_cycle_details:
                await _flush_cycle_logs(
                    job_uuid,
                    cycle_number=current_cycle_number,
                    details=pending_cycle_details,
                    total_groups=total_items_count,
                    sent=sent,
                    failed=failed,
                    progress=current_progress_val,
                )
            async with async_session_factory() as db_pause:
                result = await db_pause.execute(
                    select(BroadcastJob).where(BroadcastJob.id == job_uuid)
                )
                db_job = result.scalar_one_or_none()
                if db_job and db_job.status == "running":
                    db_job.status = "paused"
                    db_job.sent_count = sent
                    db_job.fail_count = failed
                    await db_pause.commit()
            await _push_broadcast(
                job_id_str,
                "status",
                {"status": "paused", "message": message},
            )

        # joined_pool is keyed by (account_id, pkey) to prevent cross-account access_hash pollution
        joined_pool: dict[tuple[str, str], Any] = {}
        pending_pool: dict = {}
        # Seed from the persisted job state so a resumed/looping job continues
        # where it left off instead of re-attempting targets that are
        # permanently dead or still awaiting a join retry.
        permanent_failures_pool: set = set(persisted_permanent_failures)
        for _pending in persisted_pending_items:
            _pkey = _pending.get("key") if isinstance(_pending, dict) else None
            if _pkey:
                pending_pool[_pkey] = {
                    "group_identifier": _pending.get("group_identifier", ""),
                    "item_type": _pending.get("item_type", "username"),
                }
        # Cache of (account_id, peer_id) -> (can_send, reason). Cleared at each
        # cycle start so the permission probe (a Telegram round-trip) runs at
        # most once per account/entity per cycle instead of before every send.
        permission_cache: dict[tuple[str, int], tuple[bool, str]] = {}
        # Persists across cycles: counts consecutive unknown/transient resolve
        # failures per target so a bad link eventually goes permanent while a
        # recovered target (e.g. a join that did go through) is not blacklisted.
        resolve_attempts: dict[str, int] = {}
        # Distinguish an account-level SpamBot restriction from per-group bans.
        # Keyed by account_id; the SpamBot probe is debounced to at most once
        # per account per SPAM_RECHECK_INTERVAL seconds.
        spam_checked_at: dict[str, float] = {}
        limited_accounts: set[str] = set()
        def _append_skipped_cycle_details() -> None:
            """Record targets that were skipped this cycle so the cycle log reconciles.

            The send loop `continue`s past targets already in the permanent-failure
            or pending pools before any detail is buffered, so without this the
            cycle log shows fewer targets than `total_groups` and it looks like the
            others vanished. Emitted once per target per completed cycle.
            """
            logged = {d.get("group_identifier") for d in pending_cycle_details}
            for item in items:
                gid = item.get("value", "") or ""
                if not gid or gid in logged:
                    continue
                pkey = f"{item.get('type', 'username')}:{gid}"
                if pkey in permanent_failures_pool:
                    err_type, reason = (
                        "skipped_permanent",
                        "Dilewati: target sudah gagal permanen di cycle sebelumnya",
                    )
                elif pkey in mute_pool:
                    rem_sec = max(0, int(mute_pool[pkey]["until"] - time.time()))
                    mins = max(1, rem_sec // 60)
                    hours = mins // 60
                    rem_m = mins % 60
                    time_str = f"{hours}h {rem_m}m" if hours > 0 else f"{rem_m}m"
                    err_type, reason = (
                        "muted_temporary",
                        f"Dilewati: target sedang di-mute sementara ({time_str} remaining)",
                    )
                elif pkey in pending_pool:
                    err_type, reason = (
                        "skipped_pending",
                        "Dilewati: masih menunggu giliran join (cooldown / limit)",
                    )
                else:
                    err_type, reason = (
                        "skipped",
                        "Dilewati: tidak diproses pada cycle ini",
                    )
                pending_cycle_details.append({
                    "group_identifier": gid,
                    "group_id": None,
                    "account_id_used": None,
                    "account_name": None,
                    "status": "skipped",
                    "error_type": err_type,
                    "error_message": reason,
                    "sent_text": "",
                    "duration_ms": None,
                    "sent_at": datetime.now(timezone.utc).isoformat(),
                })

        async def _persist_target_state() -> None:
            """Persist the permanent-failure and pending sets onto the job row."""
            try:
                pending_serialized = [
                    {
                        "key": k,
                        "group_identifier": v.get("group_identifier", ""),
                        "item_type": v.get("item_type", "username"),
                    }
                    for k, v in pending_pool.items()
                ]
                async with async_session_factory() as sdb:
                    res = await sdb.execute(
                        select(BroadcastJob).where(BroadcastJob.id == job_uuid)
                    )
                    db_job_state = res.scalar_one_or_none()
                    if db_job_state is not None:
                        db_job_state.permanent_failures = sorted(str(x) for x in permanent_failures_pool)
                        db_job_state.pending_items = pending_serialized
                        await sdb.commit()
            except Exception as state_exc:
                logger.warning(
                    "Could not persist target state for job %s: %s", job_id_str, state_exc
                )

        # Slowmode and temporary mute are per-group limits, not account limits: they
        # only stop posting to that one chat until the interval elapses.
        slowmode_pool: dict = {}
        mute_pool: dict = {}

        while True:
            is_looping = loop_enabled
            current_cycle = cycle_count + 1
            current_cycle_number = current_cycle
            cycle_start_time = time.time()
            # Counters for *this* cycle only. The job-level sent_count/fail_count
            # stay cumulative and are kept separately, so the per-cycle summary
            # stops repeating the opening cycle's numbers without truncating the
            # job's running totals.
            cycle_sent = 0
            cycle_failed = 0
            pending_cycle_details = []

            # MEM-LEAK-FIX: Clear caches at cycle start to prevent unbounded
            # growth across looping cycles. joined_pool holds full Telethon
            # entity objects (~50-200 KB each) that were never evicted between
            # cycles, causing ~1-2 GB of retained memory across 72 jobs.
            joined_pool.clear()
            permission_cache.clear()

            # Evict expired slowmode and temporary mute entries instead of keeping them forever.
            now_ts = time.time()
            slowmode_pool = {k: v for k, v in slowmode_pool.items() if v["until"] > now_ts}
            mute_pool = {k: v for k, v in mute_pool.items() if v["until"] > now_ts}

            for idx, item in enumerate(items):
                # Find the next ready account
                selected_acc = None
                while True:
                    current_status = await _get_current_status(job_uuid)
                    if current_status is None or current_status == "cancelled":
                        break

                    # Check schedule window if schedule is enabled
                    if schedule_enabled and schedule_start_time and schedule_end_time:
                        from app.utils.schedule_helper import is_within_schedule
                        is_act_sched, wait_next_sec = is_within_schedule(
                            schedule_start_time, schedule_end_time, schedule_timezone
                        )
                        if not is_act_sched:
                            if pending_cycle_details:
                                await _flush_cycle_logs(
                                    job_uuid,
                                    cycle_number=current_cycle_number,
                                    details=pending_cycle_details,
                                    total_groups=total_items_count,
                                    sent=sent,
                                    failed=failed,
                                    progress=last_progress,
                                )
                            async with async_session_factory() as db_sch:
                                res = await db_sch.execute(select(BroadcastJob).where(BroadcastJob.id == job_uuid))
                                j_orm = res.scalar_one_or_none()
                                if j_orm and j_orm.status in ("running", "paused"):
                                    j_orm.status = "paused"
                                    j_orm.schedule_paused = True
                                    await db_sch.commit()

                            await _push_broadcast(
                                job_id_str,
                                "status",
                                {
                                    "status": "paused",
                                    "message": f"Siaran dijeda otomatis (di luar jam operasional {schedule_start_time} - {schedule_end_time} WIB). Menunggu jadwal berikutnya.",
                                },
                            )

                            while True:
                                current_status = await _get_current_status(job_uuid)
                                if current_status is None or current_status in ("cancelled", "completed", "failed"):
                                    break
                                is_act_now, wait_sec_now = is_within_schedule(
                                    schedule_start_time, schedule_end_time, schedule_timezone
                                )
                                if is_act_now:
                                    async with async_session_factory() as db_sch:
                                        res = await db_sch.execute(select(BroadcastJob).where(BroadcastJob.id == job_uuid))
                                        j_orm = res.scalar_one_or_none()
                                        if j_orm and j_orm.status == "paused" and j_orm.schedule_paused:
                                            j_orm.status = "running"
                                            j_orm.schedule_paused = False
                                            await db_sch.commit()
                                            await _push_broadcast(
                                                job_id_str,
                                                "status",
                                                {
                                                    "status": "running",
                                                    "message": f"Jam operasional aktif ({schedule_start_time} WIB). Melanjutkan siaran otomatis.",
                                                },
                                            )
                                    break
                                sleep_sec = min(max(1, wait_sec_now), 30)
                                interrupted = not await _interruptible_sleep(job_id_str, sleep_sec)
                                if interrupted:
                                    current_status = await _get_current_status(job_uuid)
                                    if current_status in ("cancelled", "completed", "failed"):
                                        break
                                    async with async_session_factory() as db_sch:
                                        res = await db_sch.execute(select(BroadcastJob).where(BroadcastJob.id == job_uuid))
                                        j_orm = res.scalar_one_or_none()
                                        if j_orm and not j_orm.schedule_paused and j_orm.status == "running":
                                            break

                            current_status = await _get_current_status(job_uuid)
                            if current_status is None or current_status == "cancelled":
                                break

                    while current_status == "paused":
                        if pending_cycle_details:
                            await _flush_cycle_logs(
                                job_uuid,
                                cycle_number=current_cycle_number,
                                details=pending_cycle_details,
                                total_groups=total_items_count,
                                sent=sent,
                                failed=failed,
                                progress=last_progress,
                            )
                        await _interruptible_sleep(
                            job_id_str, 86400
                        )  # Sleep indefinitely until woken
                        current_status = await _get_current_status(job_uuid)
                        if current_status is None or current_status == "cancelled":
                            break
                    if current_status == "cancelled":
                        break

                    if not active_accounts:
                        break

                    now_ts = time.time()
                    # An account on *join* cooldown is still perfectly able to
                    # send. Join cooldown only blocks the join step, and the
                    # per-target guard below already skips targets that need a
                    # join right now. Filtering it out here instead made a
                    # single join flood stall the whole cycle for the full wait,
                    # including groups that had nothing to do with it.
                    ready_accs = [a for a in active_accounts if now_ts >= a["cooldown_until"]]
                    if ready_accs:
                        for offset in range(len(active_accounts)):
                            i_idx = (current_acc_idx + offset) % len(active_accounts)
                            candidate = active_accounts[i_idx]
                            if now_ts >= candidate["cooldown_until"]:
                                selected_acc = candidate
                                current_acc_idx = (i_idx + 1) % len(active_accounts)
                                break

                        if selected_acc:
                            break

                    # No account is free of the send throttle. Unlike a join
                    # flood, this one genuinely blocks delivery everywhere, so
                    # the job waits it out before retrying.
                    earliest_ready_time = min(a["cooldown_until"] for a in active_accounts)
                    wait_sec = max(1.0, earliest_ready_time - now_ts)

                    await _push_broadcast(
                        job_id_str,
                        "flood_wait",
                        {
                            "wait_seconds": int(wait_sec),
                            "message": f"All accounts on cooldown. Waiting {int(wait_sec)}s...",
                        },
                    )

                    await _interruptible_sleep(job_id_str, wait_sec)

                current_status = await _get_current_status(job_uuid)
                if current_status is None or current_status == "cancelled":
                    break

                if not active_accounts:
                    await _stop_job_all_accounts_failed(last_progress)
                    return

                if selected_acc is None:
                    # Every account is on send cooldown. The wait above has
                    # elapsed without one freeing up; leave this target for the
                    # next cycle rather than dereferencing None.
                    continue

                acc_id_str = selected_acc["account_id"]
                acc_name = selected_acc["account_name"]
                client_pool.touch_client(acc_id_str)

                group_identifier = item.get("value", "") or ""
                item_type = item.get("type", "username")

                pkey = f"{item_type}:{group_identifier}"
                cached_entity = joined_pool.get((acc_id_str, pkey)) or client_pool.get_cached_entity(
                    pkey, account_id=acc_id_str
                )

                # We are processing this target now, so it is no longer
                # "waiting its turn": drop it from the pending set. If it still
                # needs a join and the account is on cooldown, the join-cooldown
                # branch below re-queues it. This is what makes a deferred target
                # resume through the normal throttled path once the flood lifts,
                # instead of being parked in a separate unthrottled retry pass.
                pending_pool.pop(pkey, None)

                if pkey in permanent_failures_pool:
                    continue

                # This group is still in its own slowmode window. Skip just this
                # target and carry on with the rest of the list — the account is
                # fine, the group is what is rate-limiting us.
                slow_entry = slowmode_pool.get(pkey)
                if slow_entry and time.time() < slow_entry["until"]:
                    pending_pool[pkey] = {
                        "group_identifier": group_identifier,
                        "item_type": item_type,
                    }
                    continue

                # This group is still in a temporary mute window for this target.
                mute_entry = mute_pool.get(pkey)
                if mute_entry and time.time() < mute_entry["until"]:
                    pending_pool[pkey] = {
                        "group_identifier": group_identifier,
                        "item_type": item_type,
                    }
                    continue

                if len(group_identifier) > 2000:
                    group_identifier = group_identifier[:2000] + "…"

                start_time = time.time()

                # Pick text
                if texts:
                    chosen_text = random.choice(texts)
                else:
                    chosen_text = ""

                log_status = "error"
                log_err_type = None
                log_err_msg = None
                log_duration_ms = None
                log_send_ms = None
                log_group_id = None
                # Accumulated real send time for this item; only the send branch
                # fills it in, so it stays None for skipped or failed targets.
                total_send_ms = 0

                # If we need to resolve/join, but the selected account is on join cooldown
                if cached_entity is None and time.time() < selected_acc.get(
                    "join_cooldown_until", 0.0
                ):
                    log_status = "skipped"
                    log_err_type = "join_cooldown"
                    log_err_msg = "Waiting for join cooldown to expire; retrying next cycle"

                    pending_pool[pkey] = {
                        "group_identifier": group_identifier,
                        "item_type": item_type,
                    }
                    # Not a failure: the target is queued in pending_pool and
                    # retried at the start of the next cycle. Counting it as
                    # failed made a single join flood report the whole cycle as
                    # 148 failures while the groups were merely waiting.

                    # Buffer log in-memory (committed at cycle end or graceful exit)
                    current_progress = (
                        int(((idx + 1) / len(items)) * 100) if len(items) > 0 else 0
                    )
                    last_progress = current_progress

                    pending_cycle_details.append({
                        "group_identifier": group_identifier,
                        "group_id": None,
                        "account_id_used": acc_id_str,
                        "account_name": acc_name,
                        "status": log_status,
                        "error_type": log_err_type,
                        "error_message": log_err_msg,
                        "sent_text": chosen_text,
                        "duration_ms": None,
                        "sent_at": datetime.now(timezone.utc).isoformat(),
                    })

                    await _push_broadcast(
                        job_id_str,
                        "progress",
                        {
                            "current": idx + 1,
                            "total": len(items),
                            "progress": int(((idx + 1) / len(items)) * 100)
                            if len(items) > 0
                            else 0,
                            "sent": sent,
                            "failed": failed,
                            "cycle": current_cycle,
                            "status": current_status,
                        },
                    )
                    await _push_broadcast(
                        job_id_str,
                        "log",
                        {
                            "group": group_identifier,
                            "status": log_status,
                            "error_type": log_err_type,
                            "text": chosen_text,
                            "cycle": current_cycle,
                            "account_id_used": acc_id_str,
                            "account_name": acc_name,
                        },
                    )
                    continue

                client = None
                try:
                    client = await borrow_client(selected_acc, receive_updates=True)
                except Exception as borrow_exc:
                    logger.warning("Could not borrow client for account %s: %s", acc_id_str, borrow_exc)
                    err_type, err_msg = classify_telegram_error(borrow_exc)
                    log_status = "error"
                    log_err_type = err_type
                    log_err_msg = err_msg
                    failed += 1
                    cycle_failed += 1
                    if err_type in ("session_revoked", "user_deactivated", "phone_banned", "auth_key"):
                        await _handle_account_failure(selected_acc, err_type)

                if client is None:
                    current_progress = (
                        int(((idx + 1) / len(items)) * 100) if len(items) > 0 else 0
                    )
                    last_progress = current_progress
                    pending_cycle_details.append({
                        "group_identifier": group_identifier,
                        "group_id": None,
                        "account_id_used": acc_id_str,
                        "account_name": acc_name,
                        "status": log_status,
                        "error_type": log_err_type,
                        "error_message": log_err_msg,
                        "sent_text": chosen_text,
                        "duration_ms": None,
                        "sent_at": datetime.now(timezone.utc).isoformat(),
                    })
                    await _push_broadcast(
                        job_id_str,
                        "progress",
                        {
                            "current": idx + 1,
                            "total": len(items),
                            "progress": current_progress,
                            "sent": sent,
                            "failed": failed,
                            "cycle": current_cycle,
                            "status": current_status,
                        },
                    )
                    await _push_broadcast(
                        job_id_str,
                        "log",
                        {
                            "group": group_identifier,
                            "status": log_status,
                            "error_type": log_err_type,
                            "text": chosen_text,
                            "cycle": current_cycle,
                            "account_id_used": acc_id_str,
                            "account_name": acc_name,
                        },
                    )
                    if not active_accounts:
                        await _stop_job_all_accounts_failed(last_progress)
                        return
                    if delay_randomized:
                        min_d = max(1, int(delay_per_group * 0.7))
                        max_d = max(min_d + 1, int(delay_per_group * 1.3))
                        base_delay = random.randint(min_d, max_d)
                    else:
                        base_delay = max(1, delay_per_group)
                    flood_delay = fc.get_delay(acc_id_str)
                    actual_delay = max(1, max(base_delay, flood_delay))
                    await _interruptible_sleep(job_id_str, actual_delay)
                    continue

                entities = None
                try:
                    if isinstance(cached_entity, list) and cached_entity:
                        entities = cached_entity
                    else:
                        if cached_entity is not None:
                            # Cached value is empty or not a usable entity list.
                            # Drop it and re-resolve so the code can never fall
                            # through to a bogus "success" with nothing to send.
                            client_pool.evict_cached_entity(pkey, account_id=acc_id_str)
                        entities = await _broadcast_entities_for_target(
                            client, group_identifier, job_id_str
                        )
                        if not entities:
                            raise ValueError(
                                f"Could not resolve any entities for: {group_identifier}"
                            )

                except Exception as resolve_exc:
                    err_type, err_msg = classify_telegram_error(resolve_exc)

                    if err_type == "account_frozen":
                        # Telegram froze this account's methods. Rotate it out and
                        # keep the job running with the other accounts (the target
                        # stays pending for them); never cancel the campaign.
                        pending_pool[pkey] = {
                            "group_identifier": group_identifier,
                            "item_type": item_type,
                        }
                        await _retire_restricted_account(
                            selected_acc, RESTRICTED_FROZEN, err_msg, last_progress
                        )
                        if not active_accounts:
                            await _pause_job_no_accounts(
                                "Semua akun dibatasi Telegram (frozen). Job dijeda.",
                                last_progress,
                            )
                            return
                        continue

                    if err_type == "banned" and await _ensure_account_spam_checked(acc_id_str):
                        # Account-level spam restriction, not a per-group ban:
                        # rotate the account out and requeue the target for
                        # another account instead of cancelling the job.
                        pending_pool[pkey] = {
                            "group_identifier": group_identifier,
                            "item_type": item_type,
                        }
                        await _retire_restricted_account(
                            selected_acc, RESTRICTED_LIMITED, err_msg, last_progress
                        )
                        if not active_accounts:
                            await _pause_job_no_accounts(
                                "Semua akun dibatasi Telegram (spam limit). Job dijeda.",
                                last_progress,
                            )
                            return
                        continue

                    if err_type in (
                        "flood",
                        "peer_flood",
                        "must_join_discussion",
                        "guest_restricted",
                        "send_restricted",
                    ):
                        pending_pool[pkey] = {
                            "group_identifier": group_identifier,
                            "item_type": item_type,
                        }
                        # Account-level throttle: record it so the next cycle
                        # leaves this target alone until the wait elapses,
                        # instead of re-attempting the join and resetting the
                        # cooldown on every pass.
                        if err_type in ("flood", "peer_flood"):
                            wait = 30
                            if hasattr(resolve_exc, "seconds"):
                                wait = resolve_exc.seconds
                            selected_acc["join_cooldown_until"] = time.time() + wait
                            # Surface offline as well as in the cycle log: a join
                            # flood used to be recorded silently, so a cycle that
                            # made no progress looked like a mystery.
                            logger.warning(
                                "Join flood on account %s for %s (%s): waiting %ss",
                                acc_id_str,
                                group_identifier,
                                err_type,
                                int(wait),
                            )
                            await _push_broadcast(
                                job_id_str,
                                "flood_wait",
                                {
                                    "wait_seconds": int(wait),
                                    "account": acc_name,
                                    "group": group_identifier,
                                    "message": (
                                        f"Flood saat join {group_identifier} ({err_type}). "
                                        f"Menunggu {int(wait)}s lalu lanjut."
                                    ),
                                },
                            )
                    elif err_type == "slowmode":
                        # Group-local limit — see slowmode_pool.
                        pending_pool[pkey] = {
                            "group_identifier": group_identifier,
                            "item_type": item_type,
                        }
                        wait = 30
                        if hasattr(resolve_exc, "seconds"):
                            wait = resolve_exc.seconds
                        slowmode_pool[pkey] = {
                            "until": time.time() + wait,
                            "seconds": wait,
                        }

                    if err_type in ("invite_request_sent", "already_invited"):
                        log_status = "skipped"
                        log_err_type = err_type
                        log_err_msg = err_msg
                        log_duration_ms = int((time.time() - start_time) * 1000)
                        resolve_attempts.pop(pkey, None)
                    else:
                        log_status = "error"
                        log_err_type = err_type
                        log_err_msg = err_msg
                        failed += 1
                        cycle_failed += 1

                        if err_type in RESOLVE_PERMANENT_ERROR_TYPES:
                            permanent_failures_pool.add(pkey)
                        elif err_type == "muted_temporary":
                            mute_seconds = 600
                            match = re.search(r"\((\d+)m remaining\)", err_msg)
                            if match:
                                mute_seconds = int(match.group(1)) * 60
                            else:
                                match_hm = re.search(r"\((\d+)h\s*(\d+)m remaining\)", err_msg)
                                if match_hm:
                                    mute_seconds = (int(match_hm.group(1)) * 60 + int(match_hm.group(2))) * 60
                            mute_pool[pkey] = {
                                "until": time.time() + mute_seconds,
                                "seconds": mute_seconds,
                            }
                            pending_pool[pkey] = {
                                "group_identifier": group_identifier,
                                "item_type": item_type,
                            }
                        elif err_type not in (
                            "flood",
                            "peer_flood",
                            "must_join_discussion",
                            "guest_restricted",
                            "send_restricted",
                            "slowmode",
                        ):
                            # Transient/unknown resolve failure — e.g. a join that
                            # actually succeeded but returned no chat entity.
                            # Retry over a bounded number of cycles instead of
                            # blacklisting the target after a single miss.
                            attempts = resolve_attempts.get(pkey, 0) + 1
                            resolve_attempts[pkey] = attempts
                            if attempts >= MAX_RESOLVE_ATTEMPTS:
                                permanent_failures_pool.add(pkey)
                            else:
                                pending_pool[pkey] = {
                                    "group_identifier": group_identifier,
                                    "item_type": item_type,
                                }

                        if err_type == "flood":
                            wait = 30
                            if hasattr(resolve_exc, "seconds"):
                                wait = resolve_exc.seconds
                            selected_acc["join_cooldown_until"] = time.time() + wait
                        elif err_type == "peer_flood":
                            backoff_time = 7200
                            selected_acc["join_cooldown_until"] = time.time() + backoff_time
                        elif err_type == "slowmode":
                            wait = 30
                            if hasattr(resolve_exc, "seconds"):
                                wait = resolve_exc.seconds
                            # Per-group, not per-account — see slowmode_pool.
                            slowmode_pool[pkey] = {
                                "until": time.time() + wait,
                                "seconds": wait,
                            }
                else:
                    try:
                        if not chosen_text or not chosen_text.strip():
                            raise ValueError("Message text is empty")
                        # Watermark once per message, not once per entity, so a
                        # chatlist target that resolves to many groups does not
                        # pay the DB round-trip repeatedly.
                        send_text = _watermark_for_job(watermark_template, chosen_text)
                        delivered = 0
                        for entity in entities:
                            # Pre-check send permissions, memoized per
                            # account/entity for the duration of the cycle.
                            try:
                                perm_key = (acc_id_str, get_peer_id(entity))
                            except Exception:
                                perm_key = (acc_id_str, getattr(entity, "id", id(entity)))
                            cached_perm = permission_cache.get(perm_key)
                            if cached_perm is None:
                                cached_perm = await check_send_permission(client, entity)
                                permission_cache[perm_key] = cached_perm
                            can_send, reason = cached_perm
                            if not can_send:
                                if "participant" in reason or "member" in reason:
                                    raise telethon.errors.UserNotParticipantError(None)
                                else:
                                    raise ValueError(f"CHAT_WRITE_FORBIDDEN: {reason}")

                            for retry_attempt in range(2):
                                try:
                                        send_started = time.monotonic()
                                        await asyncio.wait_for(
                                            _send_broadcast_message(client, entity, send_text),
                                            timeout=30.0,
                                        )
                                        total_send_ms += int((time.monotonic() - send_started) * 1000)
                                        delivered += 1
                                        break
                                except telethon.errors.UserNotParticipantError as unpe:
                                    if retry_attempt == 0:
                                        try:
                                            from telethon.tl.types import Channel

                                            if isinstance(entity, Channel):
                                                await asyncio.wait_for(
                                                    client(
                                                        JoinChannelRequest(
                                                            entity
                                                        )
                                                    ),
                                                    timeout=30.0,
                                                )
                                                await asyncio.sleep(2)
                                                continue
                                            else:
                                                raise unpe
                                        except Exception as join_err:
                                            raise join_err
                                    raise
                                except telethon.errors.SlowModeWaitError as e:
                                    if e.seconds <= 30:
                                        logger.warning(
                                            "Slow mode active (job %s, account %s): waiting %s seconds to retry...",
                                            job_id_str,
                                            acc_id_str,
                                            e.seconds,
                                        )
                                        completed = await _interruptible_sleep(
                                            job_id_str, e.seconds
                                        )
                                        if not completed:
                                            raise
                                        if retry_attempt == 0:
                                            continue
                                    raise
                                except telethon.errors.FloodWaitError as e:
                                    if e.seconds <= 30:
                                        logger.warning(
                                            "Flood wait active (job %s, account %s): waiting %s seconds to retry...",
                                            job_id_str,
                                            acc_id_str,
                                            e.seconds,
                                        )
                                        completed = await _interruptible_sleep(
                                            job_id_str, e.seconds
                                        )
                                        if not completed:
                                            raise
                                        if retry_attempt == 0:
                                            continue
                                    raise
                                except (ConnectionError, TimeoutError, OSError) as net_exc:
                                    if retry_attempt == 0:
                                        logger.warning(
                                            "Transient error sending message (job %s, account %s): %s. Retrying once...",
                                            job_id_str,
                                            acc_id_str,
                                            net_exc,
                                        )
                                        await asyncio.sleep(2)
                                        if not client.is_connected():
                                            logger.info(
                                                "Client %s disconnected, attempting reconnect...",
                                                acc_id_str,
                                            )
                                            try:
                                                await client.connect()
                                                if not await client.is_user_authorized():
                                                    raise ValueError(
                                                        "Session expired after disconnect"
                                                    )
                                                logger.info(
                                                    "Client %s reconnected successfully",
                                                    acc_id_str,
                                                )
                                            except Exception as reconnect_exc:
                                                logger.error(
                                                    "Failed to reconnect client %s: %s",
                                                    acc_id_str,
                                                    reconnect_exc,
                                                )
                                                raise
                                        continue
                                    raise

                        if delivered == 0:
                            # Nothing was actually sent (e.g. an empty entity
                            # collection). Never report success for a no-op.
                            raise ValueError(
                                f"No deliverable entities for target: {group_identifier}"
                            )

                        if entities:
                            try:
                                log_group_id = get_peer_id(entities[0])
                            except Exception:
                                log_group_id = getattr(entities[0], "id", None)
                        else:
                            log_group_id = None

                        if entities:
                            joined_pool[(acc_id_str, pkey)] = entities
                            client_pool.cache_entity(pkey, entities, account_id=acc_id_str)

                        log_status = "success"
                        log_duration_ms = int((time.time() - start_time) * 1000)
                        # Actual send time only, excluding the configured delay and
                        # any flood-wait backoff. This is what the free-tier daily
                        # budget is charged against.
                        log_send_ms = total_send_ms or None
                        log_err_msg = None
                        log_err_type = None
                        sent += 1
                        cycle_sent += 1
                        # Target resolved and delivered: reset its retry budget.
                        resolve_attempts.pop(pkey, None)

                        fc.record_success(acc_id_str)

                    except Exception as exc:
                        err_type, err_msg = classify_telegram_error(exc)

                        if err_type == "account_frozen":
                            # Freeze is account-level: rotate it out and let the
                            # job continue; requeue the target for another account.
                            pending_pool[pkey] = {
                                "group_identifier": group_identifier,
                                "item_type": item_type,
                            }
                            await _retire_restricted_account(
                                selected_acc, RESTRICTED_FROZEN, err_msg, last_progress
                            )
                            if not active_accounts:
                                await _pause_job_no_accounts(
                                    "Semua akun dibatasi Telegram (frozen). Job dijeda.",
                                    last_progress,
                                )
                                return
                            continue

                        if err_type == "banned" and await _ensure_account_spam_checked(acc_id_str):
                            # Account-level spam restriction, not a per-group ban:
                            # rotate the account out and keep the job running; the
                            # target is requeued for another account.
                            pending_pool[pkey] = {
                                "group_identifier": group_identifier,
                                "item_type": item_type,
                            }
                            await _retire_restricted_account(
                                selected_acc, RESTRICTED_LIMITED, err_msg, last_progress
                            )
                            if not active_accounts:
                                await _pause_job_no_accounts(
                                    "Semua akun dibatasi Telegram (spam limit). Job dijeda.",
                                    last_progress,
                                )
                                return
                            continue

                        if err_type == "bad_request":
                            # ChannelInvalidError: evict invalid entity from cache so it doesn't pollute subsequent sends
                            joined_pool.pop((acc_id_str, pkey), None)
                            client_pool.evict_cached_entity(pkey, account_id=acc_id_str)
                        elif entities:
                            joined_pool[(acc_id_str, pkey)] = entities
                            client_pool.cache_entity(pkey, entities, account_id=acc_id_str)

                        log_status = "error"
                        log_err_type = err_type
                        log_err_msg = err_msg
                        failed += 1
                        cycle_failed += 1

                        if err_type in (
                            "admin_only",
                            "banned",
                            "invalid_username",
                            "invalid_link",
                            "private_channel",
                            "muted_permanent",
                            "not_member",
                            "too_many_channels",
                            "topic_closed",
                            "media_forbidden",
                        ):
                            permanent_failures_pool.add(pkey)
                        elif err_type == "muted_temporary":
                            mute_seconds = 600
                            match = re.search(r"\((\d+)m remaining\)", err_msg)
                            if match:
                                mute_seconds = int(match.group(1)) * 60
                            else:
                                match_hm = re.search(r"\((\d+)h\s*(\d+)m remaining\)", err_msg)
                                if match_hm:
                                    mute_seconds = (int(match_hm.group(1)) * 60 + int(match_hm.group(2))) * 60
                            mute_pool[pkey] = {
                                "until": time.time() + mute_seconds,
                                "seconds": mute_seconds,
                            }
                            pending_pool[pkey] = {
                                "group_identifier": group_identifier,
                                "item_type": item_type,
                            }

                        if err_type == "flood":
                            wait = 30
                            if hasattr(exc, "seconds"):
                                wait = exc.seconds
                            fc.record_flood(acc_id_str, wait)
                            selected_acc["cooldown_until"] = time.time() + wait
                        elif err_type == "peer_flood":
                            backoff_time = 7200
                            fc.record_flood(acc_id_str, backoff_time)
                            selected_acc["cooldown_until"] = time.time() + backoff_time
                        elif err_type == "slowmode":
                            wait = 30
                            if hasattr(exc, "seconds"):
                                wait = exc.seconds
                            # Per-group: this account stays usable for every
                            # other target in the cycle.
                            slowmode_pool[pkey] = {
                                "until": time.time() + wait,
                                "seconds": wait,
                            }

                        if err_type in (
                            "session_revoked",
                            "user_deactivated",
                            "phone_banned",
                            "auth_key",
                        ):
                            await _handle_account_failure(selected_acc, err_type)
                finally:
                    # Release borrowed client back to pool before any delay or sleep!
                    if client is not None:
                        await release_client(selected_acc)
                        client = None

                # Buffer log in-memory (committed at cycle end or graceful exit)
                current_progress = (
                    int(((idx + 1) / len(items)) * 100) if len(items) > 0 else 0
                )
                last_progress = current_progress

                pending_cycle_details.append({
                    "group_identifier": group_identifier,
                    "group_id": log_group_id,
                    "account_id_used": acc_id_str,
                    "account_name": acc_name,
                    "status": log_status,
                    "error_type": log_err_type,
                    "error_message": log_err_msg,
                    "sent_text": chosen_text,
                    "duration_ms": log_duration_ms,
                    "send_ms": log_send_ms,
                    "sent_at": datetime.now(timezone.utc).isoformat(),
                })

                await _push_broadcast(
                    job_id_str,
                    "progress",
                    {
                        "current": idx + 1,
                        "total": len(items),
                        "progress": int(((idx + 1) / len(items)) * 100) if len(items) > 0 else 0,
                        "sent": sent,
                        "failed": failed,
                        "cycle": current_cycle,
                        "status": current_status,
                    },
                )
                await _push_broadcast(
                    job_id_str,
                    "log",
                    {
                        "group": group_identifier,
                        "status": log_status,
                        "error_type": log_err_type,
                        "text": chosen_text,
                        "cycle": current_cycle,
                        "account_id_used": acc_id_str,
                        "account_name": acc_name,
                    },
                )

                if not active_accounts:
                    await _stop_job_all_accounts_failed(last_progress)
                    return

                # Delay between groups (use flood-controlled delay if larger)
                if delay_randomized:
                    min_d = max(1, int(delay_per_group * 0.7))
                    max_d = max(min_d + 1, int(delay_per_group * 1.3))
                    base_delay = random.randint(min_d, max_d)
                else:
                    base_delay = max(1, delay_per_group)
                flood_delay = fc.get_delay(acc_id_str)
                actual_delay = max(1, max(base_delay, flood_delay))
                await _interruptible_sleep(job_id_str, actual_delay)

            # Check if cancelled mid-cycle
            current_status = await _get_current_status(job_uuid)
            if current_status is None or current_status == "cancelled":
                break

            # Auto stop broadcast job if there are no valid groups. Trigger when
            # the list is empty or effectively dead (>= BROADCAST_MAX_DEAD_RATIO
            # permanent failures) with nothing left to retry, so a mostly-invalid
            # group list stops looping instead of re-sending forever.
            if (
                len(items) == 0
                or (
                    not pending_pool
                    and len(permanent_failures_pool) >= BROADCAST_MAX_DEAD_RATIO * len(items)
                )
            ):
                logger.warning(
                    "Broadcast Job %s has been stopped because there is no valid group", job_id_str
                )
                if pending_cycle_details:
                    await _flush_cycle_logs(
                        job_uuid,
                        cycle_number=current_cycle_number,
                        details=pending_cycle_details,
                        total_groups=total_items_count,
                        sent=sent,
                        failed=failed,
                        progress=last_progress,
                    )
                log_msg = (
                    f"Broadcast Job {job_id_str} has been stopped because there is no valid group"
                )
                async with async_session_factory() as db_stop:
                    result = await db_stop.execute(
                        select(BroadcastJob).where(BroadcastJob.id == job_uuid)
                    )
                    db_job = result.scalar_one_or_none()
                    if db_job:
                        db_job.status = "failed"
                        db_job.completed_at = datetime.now(timezone.utc)
                        await db_stop.commit()

                        # Send stopped notification to logging destination
                        try:
                            from app.services.broadcast_log_sender import send_job_log_message

                            if active_accounts:
                                sender = active_accounts[(current_acc_idx - 1) % len(active_accounts)]
                                sender_client = None
                                try:
                                    sender_client = await borrow_client(sender)
                                    await send_job_log_message(
                                        client=sender_client, job=db_job, message=log_msg
                                    )
                                finally:
                                    if sender_client is not None:
                                        await release_client(sender)
                        except Exception as log_exc:
                            logger.warning("Failed to send job stopped log: %s", log_exc)

                await _push_broadcast(
                    job_id_str,
                    "error",
                    {
                        "status": "failed",
                        "message": "Broadcast Job has been stopped because there is no valid group",
                    },
                )
                break

            # Record targets skipped this cycle so the log reconciles to
            # total_groups, then flush the full cycle row.
            _append_skipped_cycle_details()
            cycle_duration_ms = int((time.time() - cycle_start_time) * 1000)
            cycle_details_snapshot = list(pending_cycle_details)
            await _flush_cycle_logs(
                job_uuid,
                cycle_number=current_cycle,
                details=pending_cycle_details,
                total_groups=len(items),
                sent=sent,
                failed=failed,
                progress=100 if len(items) > 0 else 0,
                duration_ms=cycle_duration_ms,
            )
            await _persist_target_state()

            if is_looping:
                cycle_count += 1
                await _push_broadcast(
                    job_id_str,
                    "cycle_complete",
                    {
                        "cycle": cycle_count,
                        "sent": cycle_sent,
                        "failed": cycle_failed,
                        "status": "running",
                    },
                )

                # Send per-cycle log summary via the broadcasting account itself
                try:
                    from app.services.broadcast_log_sender import send_cycle_summary

                    async with async_session_factory() as db_summary:
                        # Re-fetch database job to satisfy send_cycle_summary dependencies
                        result = await db_summary.execute(
                            select(BroadcastJob).where(BroadcastJob.id == job_uuid)
                        )
                        db_job_summary = result.scalar_one_or_none()

                        accounts_by_id = {
                            a["account_id"]: await _account_for_log(a["account_id"], db_summary)
                            for a in active_accounts
                        }
                        item_type_by_id = {
                            i.get("value", ""): i.get("type", "username") for i in items
                        }
                        # Use the most recently active account's client to send
                        if active_accounts:
                            sender = active_accounts[(current_acc_idx - 1) % len(active_accounts)]
                            sender_client = None
                            try:
                                sender_client = await borrow_client(sender)
                                await send_cycle_summary(
                                    client=sender_client,
                                    job=db_job_summary,
                                    cycle_number=cycle_count,
                                    group_list_name=group_list_name or "—",
                                    total_groups=len(items),
                                    active_this_round=len(items),
                                    cycle_logs=cycle_details_snapshot,
                                    accounts_by_id=accounts_by_id,
                                    item_type_by_identifier=item_type_by_id,
                                )
                            finally:
                                if sender_client is not None:
                                    await release_client(sender)
                except Exception as log_exc:
                    logger.warning("cycle log send failed for job %s: %s", job_id_str, log_exc)
                finally:
                    # MEM-LEAK-FIX: Release the snapshot so it doesn't linger
                    # in memory until the next cycle overwrites it.
                    del cycle_details_snapshot

                # Delay after all groups before starting next cycle
                if delay_after_all > 0:
                    logger.info(
                        "Job %s cycle %d complete (sent=%d failed=%d), waiting %ds before next cycle",
                        job_id_str,
                        cycle_count,
                        sent,
                        failed,
                        delay_after_all,
                    )
                    end_time = time.time() + delay_after_all
                    while time.time() < end_time:
                        current_status = await _get_current_status(job_uuid)
                        if current_status is None or current_status in (
                            "cancelled",
                            "completed",
                            "failed",
                        ):
                            break

                        # Check schedule window during inter-cycle delay
                        if schedule_enabled and schedule_start_time and schedule_end_time:
                            from app.utils.schedule_helper import is_within_schedule
                            is_act_sched, wait_next_sec = is_within_schedule(
                                schedule_start_time, schedule_end_time, schedule_timezone
                            )
                            if not is_act_sched:
                                async with async_session_factory() as db_sch:
                                    res = await db_sch.execute(select(BroadcastJob).where(BroadcastJob.id == job_uuid))
                                    j_orm = res.scalar_one_or_none()
                                    if j_orm and j_orm.status in ("running", "paused"):
                                        j_orm.status = "paused"
                                        j_orm.schedule_paused = True
                                        await db_sch.commit()

                                await _push_broadcast(
                                    job_id_str,
                                    "status",
                                    {
                                        "status": "paused",
                                        "message": f"Siaran dijeda otomatis (di luar jam operasional {schedule_start_time} - {schedule_end_time} WIB). Menunggu jadwal berikutnya.",
                                    },
                                )
                                while True:
                                    current_status = await _get_current_status(job_uuid)
                                    if current_status is None or current_status in ("cancelled", "completed", "failed"):
                                        break
                                    is_act_now, wait_sec_now = is_within_schedule(
                                        schedule_start_time, schedule_end_time, schedule_timezone
                                    )
                                    if is_act_now:
                                        async with async_session_factory() as db_sch:
                                            res = await db_sch.execute(select(BroadcastJob).where(BroadcastJob.id == job_uuid))
                                            j_orm = res.scalar_one_or_none()
                                            if j_orm and j_orm.status == "paused" and j_orm.schedule_paused:
                                                j_orm.status = "running"
                                                j_orm.schedule_paused = False
                                                await db_sch.commit()
                                                await _push_broadcast(
                                                    job_id_str,
                                                    "status",
                                                    {
                                                        "status": "running",
                                                        "message": f"Jam operasional aktif ({schedule_start_time} WIB). Melanjutkan siaran otomatis.",
                                                    },
                                                )
                                        break
                                    sleep_sec = min(max(1, wait_sec_now), 30)
                                    interrupted = not await _interruptible_sleep(job_id_str, sleep_sec)
                                    if interrupted:
                                        current_status = await _get_current_status(job_uuid)
                                        if current_status in ("cancelled", "completed", "failed"):
                                            break
                                        async with async_session_factory() as db_sch:
                                            res = await db_sch.execute(select(BroadcastJob).where(BroadcastJob.id == job_uuid))
                                            j_orm = res.scalar_one_or_none()
                                            if j_orm and not j_orm.schedule_paused and j_orm.status == "running":
                                                break
                                current_status = await _get_current_status(job_uuid)
                                if current_status is None or current_status in ("cancelled", "completed", "failed"):
                                    break
                        while current_status == "paused":
                            if pending_cycle_details:
                                await _flush_cycle_logs(
                                    job_uuid,
                                    cycle_number=current_cycle_number,
                                    details=pending_cycle_details,
                                    total_groups=total_items_count,
                                    sent=sent,
                                    failed=failed,
                                    progress=last_progress,
                                )
                            await _interruptible_sleep(
                                job_id_str, 86400
                            )  # Sleep indefinitely until woken
                            current_status = await _get_current_status(job_uuid)
                            if current_status is None or current_status in (
                                "cancelled",
                                "completed",
                                "failed",
                            ):
                                break

                        if current_status in ("cancelled", "completed", "failed"):
                            break

                        remaining = max(0, end_time - time.time())
                        if remaining > 0:
                            await _interruptible_sleep(job_id_str, remaining)

                current_status = await _get_current_status(job_uuid)
                if current_status in ("cancelled", "completed", "failed"):
                    break

                # Security Check (SEC-03): Check subscription & quota before starting next cycle
                try:
                    async with async_session_factory() as db_cycle_check:
                        user_res = await db_cycle_check.execute(
                            select(User).where(User.id == _uuid.UUID(job_user_id))
                        )
                        loop_user = user_res.scalar_one_or_none()
                        if loop_user:
                            from app.services.redeem_service import is_subscription_active, auto_downgrade_if_expired
                            from app.services.broadcast_entitlement import has_broadcast_allowance
                            await auto_downgrade_if_expired(db_cycle_check, loop_user)
                            if not is_subscription_active(loop_user) or not await has_broadcast_allowance(
                                db_cycle_check, str(loop_user.id), loop_user.role, user=loop_user
                            ):
                                logger.info(
                                    "Stopping looping broadcast job %s: subscription or daily allowance expired for user %s",
                                    job_id_str,
                                    job_user_id,
                                )
                                res_job = await db_cycle_check.execute(
                                    select(BroadcastJob).where(BroadcastJob.id == job_uuid)
                                )
                                db_job_stop = res_job.scalar_one_or_none()
                                if db_job_stop:
                                    db_job_stop.status = "completed"
                                    db_job_stop.completed_at = datetime.now(timezone.utc)
                                    await db_cycle_check.commit()
                                await _push_broadcast(
                                    job_id_str,
                                    "status",
                                    {
                                        "status": "completed",
                                        "message": "Paket langganan atau kuota harian siaran Anda telah berakhir.",
                                    },
                                )
                                break
                except Exception as cycle_check_exc:
                    logger.warning("Error checking subscription in broadcast cycle loop: %s", cycle_check_exc)
            else:
                break

        # Mark completed (only for non-looping jobs)
        current_status = await _get_current_status(job_uuid)
        if current_status == "running" and not loop_enabled:
            # Ensure pending cycle logs are flushed as a cycle row
            if pending_cycle_details:
                cycle_details_snapshot = list(pending_cycle_details)
                cycle_duration_ms = int((time.time() - cycle_start_time) * 1000)
                await _flush_cycle_logs(
                    job_uuid,
                    cycle_number=current_cycle_number,
                    details=pending_cycle_details,
                    total_groups=total_items_count,
                    sent=sent,
                    failed=failed,
                    progress=100,
                    duration_ms=cycle_duration_ms,
                )
            elif "cycle_details_snapshot" not in locals():
                cycle_details_snapshot = []

            async with async_session_factory() as db_complete:
                result = await db_complete.execute(
                    select(BroadcastJob).where(BroadcastJob.id == job_uuid)
                )
                db_job_complete = result.scalar_one_or_none()
                if db_job_complete:
                    db_job_complete.status = "completed"
                    db_job_complete.progress = 100
                    db_job_complete.sent_count = sent
                    db_job_complete.fail_count = failed
                    db_job_complete.completed_at = datetime.now(timezone.utc)
                    await db_complete.commit()

                    await _push_broadcast(
                        job_id_str,
                        "completed",
                        {
                            "total": len(items),
                            "sent": sent,
                            "failed": failed,
                        },
                    )

                    # Send final cycle summary via the broadcasting account
                    try:
                        from app.services.broadcast_log_sender import send_cycle_summary

                        final_cycle = (cycle_count or 0) + 1
                        accounts_by_id = {
                            a["account_id"]: await _account_for_log(a["account_id"], db_complete)
                            for a in active_accounts
                        }
                        item_type_by_id = {
                            i.get("value", ""): i.get("type", "username") for i in items
                        }
                        if active_accounts:
                            sender = active_accounts[(current_acc_idx - 1) % len(active_accounts)]
                            sender_client = None
                            try:
                                sender_client = await borrow_client(sender)
                                await send_cycle_summary(
                                    client=sender_client,
                                    job=db_job_complete,
                                    cycle_number=final_cycle,
                                    group_list_name=group_list_name or "—",
                                    total_groups=len(items),
                                    active_this_round=len(items),
                                    cycle_logs=cycle_details_snapshot,
                                    accounts_by_id=accounts_by_id,
                                    item_type_by_identifier=item_type_by_id,
                                )
                            finally:
                                if sender_client is not None:
                                    await release_client(sender)
                    except Exception as log_exc:
                        logger.warning("final log send failed for job %s: %s", job_id_str, log_exc)

    except Exception as exc:
        logger.exception("Broadcast job %s failed: %s", job_id_str, exc)
        try:
            async with async_session_factory() as db_err:
                result = await db_err.execute(
                    select(BroadcastJob).where(BroadcastJob.id == job_uuid)
                )
                job_err = result.scalar_one_or_none()
                if job_err:
                    job_err.status = "failed"
                    await db_err.commit()
                await _push_broadcast(
                    job_id_str,
                    "error",
                    {
                        "status": "failed",
                        "message": str(exc),
                    },
                )
        except Exception:
            pass
    finally:
        # Clean up event relay and pooled clients on worker, then notify webserver to auto-reconnect
        try:
            for snapshot in account_snapshots:
                acc_id_str = snapshot.get("account_id")
                if acc_id_str:
                    try:
                        await event_relay.detach(acc_id_str)
                        await client_pool.remove(acc_id_str)
                    except Exception:
                        pass
                    # Hand the account back so the backend can resume auto-reply
                    # and WebSocket chat without waiting out the lease TTL.
                    try:
                        await release_lease(acc_id_str, OWNER_WORKER)
                    except Exception:
                        pass
            if account_ids:
                from app.utils.redis_dispatcher import publish_job_completed
                await publish_job_completed("broadcast", job_id_str, account_ids)
        except Exception as cleanup_exc:
            logger.warning("Error cleaning up broadcast job %s post-run: %s", job_id_str, cleanup_exc)

        if pending_cycle_details:
            try:
                logger.info(
                    "Graceful exit: Flushing %d pending cycle details for job %s (cycle %d)",
                    len(pending_cycle_details),
                    job_id_str,
                    current_cycle_number,
                )
                await asyncio.shield(
                    _flush_cycle_logs(
                        job_uuid,
                        cycle_number=current_cycle_number,
                        details=pending_cycle_details,
                        total_groups=total_items_count,
                        sent=sent,
                        failed=failed,
                        progress=last_progress,
                    )
                )
            except Exception as flush_exc:
                logger.exception(
                    "Failed to flush pending cycle logs for job %s during graceful exit: %s",
                    job_id_str,
                    flush_exc,
                )

        # Persist target bookkeeping so a resumed job continues without
        # re-attempting permanently-failed / pending targets.
        try:
            await _persist_target_state()
        except Exception:
            pass


def start_broadcast_task(job_id: str | uuid.UUID) -> bool:
    """Ensure a background broadcast task is running for the given job ID.
    Returns True if a new task was spawned, False if already running.
    """
    job_id_str = str(job_id)
    existing_task = _running_tasks.get(job_id_str)
    if existing_task and not existing_task.done():
        return False

    async def _safe_execute():
        try:
            await execute_broadcast(job_id_str)
        except asyncio.CancelledError:
            logger.info("Broadcast task %s cancelled gracefully", job_id_str)
        except Exception as exc:
            logger.exception("Background broadcast task %s crashed: %s", job_id_str, exc)
        finally:
            _running_tasks.pop(job_id_str, None)
            clear_job_event(job_id_str)

    task = asyncio.create_task(_safe_execute())
    _running_tasks[job_id_str] = task
    return True


async def cancel_all_broadcast_tasks() -> int:
    """Cancel all active broadcast background tasks gracefully on shutdown."""
    tasks = list(_running_tasks.values())
    for t in tasks:
        if not t.done():
            t.cancel()
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)
    _running_tasks.clear()
    return len(tasks)


async def pause_interrupted_broadcasts_on_startup(db: AsyncSession) -> int:
    """Find all broadcast jobs with status 'running' and set them to 'paused'
    so the worker daemon doesn't experience a startup thundering herd."""
    result = await db.execute(
        update(BroadcastJob)
        .where(BroadcastJob.status == "running")
        .values(status="paused", updated_at=datetime.now(timezone.utc))
        .returning(BroadcastJob.id)
    )
    paused_ids = list(result.scalars().all())
    await db.commit()
    count = len(paused_ids)
    if count > 0:
        logger.info("Safely paused %d interrupted broadcast jobs on worker startup", count)
    return count


async def resume_running_broadcasts_on_startup(
    db: AsyncSession,
    max_jobs: int | None = None,
    stagger_seconds: float = 1.0,
) -> int:
    """Find broadcast jobs with status 'running' and resume them on worker startup.
    Staggers startup slightly between multiple jobs to prevent connection spikes."""
    from app.core.sharding import is_account_in_current_shard

    query = select(BroadcastJob).where(BroadcastJob.status == "running").order_by(BroadcastJob.updated_at.desc())
    if max_jobs:
        query = query.limit(max_jobs)
    result = await db.execute(query)
    jobs = result.scalars().all()
    count = 0
    for idx, job in enumerate(jobs):
        if job.account_ids and not is_account_in_current_shard(job.account_ids[0]):
            continue
        if idx > 0 and stagger_seconds > 0:
            await asyncio.sleep(stagger_seconds)
        if start_broadcast_task(job.id):
            count += 1
    logger.info("Resumed %d running broadcast jobs on worker startup", count)
    return count

