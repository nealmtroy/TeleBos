"""Auto-leave service — runs bulk group & channel leave operations in the async worker.

Follows the non-blocking worker architecture:
- Short-lived DB sessions around deliberate sync points (CON-01).
- Redis task dispatch and shard affinity.
- Smart FloodWait handling: stays running, sleeps out the wait (+2s buffer), retries current target.
- Automatic skipping of creator/owned chats to prevent UserCreatorError.
- Defensive dialog parsing and comprehensive exception classification.
"""

import asyncio
import logging
import re
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import telethon
from telethon.errors import (
    FloodWaitError,
    UserCreatorError,
    ChannelPrivateError,
    ChatIdInvalidError,
    ChannelInvalidError,
    PeerIdInvalidError,
    UserNotMutualContactError,
    UserNotParticipantError,
    ChatForbiddenError,
    ChatAdminRequiredError,
    UserAdminInvalidError,
    UserRestrictedError,
    AuthKeyUnregisteredError,
    AuthKeyDuplicatedError,
    SessionRevokedError,
    SessionExpiredError,
    UserDeactivatedError,
    UserDeactivatedBanError,
    SessionPasswordNeededError,
)

try:
    from telethon.errors import PeerFloodError
except ImportError:
    PeerFloodError = None

try:
    from telethon.errors import FrozenMethodInvalidError
except ImportError:
    FrozenMethodInvalidError = None

from app.models.auto_leave_job import AutoLeaveJob
from app.models.auto_leave_log import AutoLeaveLog
from app.models.telegram_account import TelegramAccount
from app.schemas.auto_leave import (
    AccountDialogCountItem,
    AutoLeaveScanResponse,
)
from app.services.telegram_client import client_pool
from app.utils.account_ownership import (
    OWNER_WORKER,
    acquire_lease,
    find_busy_accounts,
    release_lease,
)
from app.utils.account_restrictions import (
    RESTRICTED_FROZEN,
    RESTRICTED_LIMITED,
    is_account_restricted,
    mark_account_restricted,
)
from app.utils.async_helpers import clear_job_event, interruptible_sleep, wake_job
from app.utils.encryption import decrypt
from app.utils.flood_control import flood_controller

logger = logging.getLogger(__name__)

_running_auto_leave_tasks: dict[str, asyncio.Task] = {}

MAX_RATE_LIMIT_RETRIES = 5
FLOOD_DEFAULT_WAIT_SECONDS = 30
MAX_FLOOD_WAIT_SECONDS = 600


# ── Exception Classifiers ────────────────────────────────────────────────────


def _extract_flood_seconds(exc: Exception, err_msg: str) -> int:
    """Accurately extract flood wait seconds from exception or error message."""
    if hasattr(exc, "seconds") and isinstance(getattr(exc, "seconds"), (int, float)):
        sec = int(exc.seconds)
        if sec > 0:
            return sec
    cause = getattr(exc, "__cause__", None)
    if cause and hasattr(cause, "seconds") and isinstance(getattr(cause, "seconds"), (int, float)):
        sec = int(cause.seconds)
        if sec > 0:
            return sec
    combined = f"{err_msg} {str(exc)}"
    match = re.search(r"(?:wait of|wait|flood)[\s:_]+(\d+)", combined, re.IGNORECASE) or re.search(
        r"(\d+)\s*s(?:ec|econds)?", combined, re.IGNORECASE
    )
    if match:
        sec = int(match.group(1))
        if sec > 0:
            return sec
    return FLOOD_DEFAULT_WAIT_SECONDS


def _is_fatal_session_error(exc: Exception) -> bool:
    """Check if exception represents a revoked, banned, or unregistered session."""
    fatal_types = (
        AuthKeyUnregisteredError,
        AuthKeyDuplicatedError,
        SessionRevokedError,
        SessionExpiredError,
        UserDeactivatedError,
        UserDeactivatedBanError,
        SessionPasswordNeededError,
    )
    if isinstance(exc, fatal_types):
        return True
    msg = str(exc).upper()
    return any(
        err in msg
        for err in (
            "AUTH_KEY_UNREGISTERED",
            "AUTH_KEY_DUPLICATED",
            "SESSION_REVOKED",
            "SESSION_EXPIRED",
            "USER_DEACTIVATED",
            "USER_DEACTIVATED_BAN",
            "SESSION_PASSWORD_NEEDED",
        )
    )


def _is_restriction_error(exc: Exception) -> bool:
    """Check if exception represents an account restriction (SpamBot or Frozen)."""
    if isinstance(exc, UserRestrictedError):
        return True
    if FrozenMethodInvalidError and isinstance(exc, FrozenMethodInvalidError):
        return True
    msg = str(exc).upper()
    return "FROZEN_METHOD_INVALID" in msg or "USER_RESTRICTED" in msg


def _is_peer_flood_error(exc: Exception) -> bool:
    """Check if exception represents a PeerFlood rate limit from Telegram."""
    if PeerFloodError and isinstance(exc, PeerFloodError):
        return True
    return "PEER_FLOOD" in str(exc).upper()


def _is_already_left_or_inaccessible(exc: Exception) -> bool:
    """Check if exception means the entity was already left, private, or inaccessible."""
    inaccessible_types = (
        ChannelPrivateError,
        ChatIdInvalidError,
        ChannelInvalidError,
        PeerIdInvalidError,
        UserNotMutualContactError,
        UserNotParticipantError,
        ChatForbiddenError,
    )
    if isinstance(exc, inaccessible_types):
        return True
    msg = str(exc).upper()
    return any(
        err in msg
        for err in (
            "CHANNEL_PRIVATE",
            "CHAT_ID_INVALID",
            "CHANNEL_INVALID",
            "PEER_ID_INVALID",
            "USER_NOT_MUTUAL_CONTACT",
            "USER_NOT_PARTICIPANT",
            "CHAT_FORBIDDEN",
        )
    )


def _is_admin_rights_error(exc: Exception) -> bool:
    """Check if exception indicates leaving requires admin rights or relinquishing admin."""
    if isinstance(exc, (ChatAdminRequiredError, UserAdminInvalidError)):
        return True
    msg = str(exc).upper()
    return "CHAT_ADMIN_REQUIRED" in msg or "USER_ADMIN_INVALID" in msg


def _is_creator_error(exc: Exception) -> bool:
    """Check if exception indicates creator/owner status prevents leaving."""
    if isinstance(exc, UserCreatorError):
        return True
    return "USER_CREATOR" in str(exc).upper()


def _jitter(low: float, high: float) -> float:
    import random

    return random.uniform(low, high)


# ── Job lookup / status helpers (each owns a short-lived session) ────────────


async def _get_job_status(job_uuid: uuid.UUID) -> str | None:
    from app.database import async_session_factory

    async with async_session_factory() as db:
        res = await db.execute(
            select(AutoLeaveJob.status).where(AutoLeaveJob.id == job_uuid)
        )
        return res.scalar_one_or_none()


async def _set_status(job_uuid: uuid.UUID, status: str) -> None:
    from app.database import async_session_factory

    async with async_session_factory() as db:
        res = await db.execute(
            select(AutoLeaveJob).where(AutoLeaveJob.id == job_uuid)
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
    job_uuid: uuid.UUID,
    log: AutoLeaveLog,
    *,
    success: int,
    skipped: int,
    failed: int,
    progress: int,
    total: int,
) -> None:
    from app.database import async_session_factory

    async with async_session_factory() as db:
        db.add(log)
        res = await db.execute(
            select(AutoLeaveJob).where(AutoLeaveJob.id == job_uuid)
        )
        job = res.scalar_one_or_none()
        if job is not None:
            job.success_count = success
            job.skipped_count = skipped
            job.fail_count = failed
            job.total_tasks = total
            job.progress = min(100, max(0, progress))
        await db.commit()


# ── Real-time push ───────────────────────────────────────────────────────────


async def _push(job_id: str, event_type: str, data: dict) -> None:
    """Publish an event to WebSocket clients watching this job."""
    channel = f"autoleave:{job_id}"
    payload = {"type": event_type, **data}

    try:
        from app.utils.redis_dispatcher import publish_ws_event

        await publish_ws_event(channel, payload)
    except Exception as exc:
        logger.warning("Redis WS push failed for auto-leave job %s: %s", job_id, exc)

    try:
        from app.api.ws import manager

        if manager.has_channel(channel):
            await manager.broadcast(channel, payload)
    except Exception:
        pass


# ── Account Scanning ─────────────────────────────────────────────────────────


async def scan_account_dialogs(
    db: AsyncSession, user_id: str, account_ids: list[str]
) -> AutoLeaveScanResponse:
    """Scan dialogs for the given accounts, counting groups and channels."""
    user_uuid = uuid.UUID(user_id)
    acc_uuids = [uuid.UUID(a) for a in account_ids]

    res = await db.execute(
        select(TelegramAccount).where(
            TelegramAccount.id.in_(acc_uuids),
            TelegramAccount.user_id == user_uuid,
        )
    )
    accounts = res.scalars().all()
    account_map = {str(acc.id): acc for acc in accounts}

    items: list[AccountDialogCountItem] = []
    total_groups = 0
    total_channels = 0

    for acc_id in account_ids:
        acc = account_map.get(acc_id)
        if not acc:
            continue

        item = AccountDialogCountItem(
            account_id=acc.id,
            phone=acc.phone,
            first_name=acc.first_name,
            last_name=acc.last_name,
        )

        if not acc.is_active:
            item.error = "Akun tidak aktif / session dinonaktifkan."
            items.append(item)
            continue

        if is_account_restricted(acc):
            item.error = f"Akun sedang dibatasi oleh Telegram ({acc.restriction_status or 'limited'})."
            items.append(item)
            continue

        try:
            session_str = decrypt(acc.session_string)
            client = await client_pool.get(str(acc.id), session_str)
            if client is None:
                item.error = "Akun tidak terhubung / session invalid."
                items.append(item)
                continue

            async for dialog in client.iter_dialogs():
                try:
                    if dialog.is_group:
                        item.group_count += 1
                        total_groups += 1
                        if getattr(dialog.entity, "creator", False):
                            item.creator_group_count += 1
                    elif dialog.is_channel and not dialog.is_group:
                        item.channel_count += 1
                        total_channels += 1
                        if getattr(dialog.entity, "creator", False):
                            item.creator_channel_count += 1
                except Exception as d_err:
                    logger.debug("Skipping unreadable dialog during scan for account %s: %s", acc_id, d_err)
                    continue

        except FloodWaitError as fwe:
            wait_sec = int(fwe.seconds) if getattr(fwe, "seconds", 0) > 0 else _extract_flood_seconds(fwe, str(fwe))
            logger.warning("Scan dialogs FloodWait %ds on account %s", wait_sec, acc_id)
            item.error = f"Akun sedang terkena FloodWait ({wait_sec}s). Silakan coba lagi nanti."
        except Exception as exc:
            logger.warning("Failed to scan dialogs for account %s: %s", acc_id, exc)
            if _is_fatal_session_error(exc):
                item.error = "Sesi Telegram tidak valid atau telah berakhir."
            elif _is_peer_flood_error(exc):
                item.error = "Akun terkena batas aktivitas (PeerFlood). Silakan tunggu."
            else:
                item.error = str(exc)

        items.append(item)

    return AutoLeaveScanResponse(
        accounts=items,
        total_groups=total_groups,
        total_channels=total_channels,
    )


# ── Job Management ───────────────────────────────────────────────────────────


async def start_auto_leave(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    account_ids: list[str],
    leave_type: str = "groups",
    skip_creator: bool = True,
    delay_per_chat: int = 5,
    delay_randomized: bool = False,
) -> tuple[AutoLeaveJob, list[uuid.UUID]]:
    """Create and enqueue auto-leave jobs (one job per account for parallelism)."""
    if not account_ids:
        raise ValueError("Pilih minimal satu akun.")

    res = await db.execute(
        select(TelegramAccount).where(
            TelegramAccount.id.in_([uuid.UUID(a) for a in account_ids]),
            TelegramAccount.user_id == user_id,
        )
    )
    accounts = res.scalars().all()
    if len(accounts) != len(account_ids):
        raise ValueError("Satu atau lebih akun tidak ditemukan atau bukan milik Anda.")

    busy_accounts = await find_busy_accounts(db, account_ids)
    if busy_accounts:
        raise ValueError(
            "Akun berikut sedang dipakai job lain yang aktif: "
            + ", ".join(busy_accounts)
            + ". Hentikan job tersebut atau tunggu selesai sebelum memulai yang baru."
        )

    from app.utils.redis_dispatcher import enqueue_job

    created_jobs: list[AutoLeaveJob] = []
    job_ids: list[uuid.UUID] = []

    for acc_id_str in account_ids:
        job = AutoLeaveJob(
            account_ids=[acc_id_str],
            user_id=user_id,
            leave_type=leave_type,
            skip_creator=skip_creator,
            status="pending",
            delay_per_chat=delay_per_chat,
            delay_randomized=delay_randomized,
            total_tasks=0,
        )
        db.add(job)
        await db.flush()
        created_jobs.append(job)
        job_ids.append(job.id)

    await db.commit()

    # Enqueue each job to Redis
    for job in created_jobs:
        await db.refresh(job)
        primary_acc = job.account_ids[0] if job.account_ids else None
        if not await enqueue_job("autoleave", job.id, account_id=primary_acc):
            job.status = "failed"
            job.completed_at = datetime.now(timezone.utc)
            await db.commit()
            logger.error("Auto-leave job %s could not be enqueued; marked failed", job.id)
            raise ValueError(
                "Gagal mengirim job auto-leave ke worker (Redis). Job dibatalkan, silakan coba lagi."
            )

    primary_job = created_jobs[0]
    return primary_job, job_ids


async def get_auto_leave_job(
    db: AsyncSession, job_id: str, user_id: str
) -> AutoLeaveJob | None:
    try:
        job_uuid = uuid.UUID(job_id)
    except (ValueError, TypeError):
        return None
    res = await db.execute(
        select(AutoLeaveJob).where(
            AutoLeaveJob.id == job_uuid, AutoLeaveJob.user_id == uuid.UUID(user_id)
        )
    )
    return res.scalar_one_or_none()


async def get_auto_leave_jobs(
    db: AsyncSession, user_id: str, limit: int = 20
) -> list[AutoLeaveJob]:
    user_uuid = uuid.UUID(user_id)
    res = await db.execute(
        select(AutoLeaveJob)
        .where(AutoLeaveJob.user_id == user_uuid)
        .order_by(AutoLeaveJob.created_at.desc())
        .limit(limit)
    )
    return list(res.scalars().all())


async def update_auto_leave_job_status(
    db: AsyncSession, job: AutoLeaveJob, status: str
) -> None:
    job.status = status
    if status in ("completed", "cancelled", "failed"):
        job.completed_at = datetime.now(timezone.utc)
        job.progress = 100
    await db.commit()


async def get_auto_leave_logs(
    db: AsyncSession, job_id: str, limit: int = 500
) -> list[AutoLeaveLog]:
    try:
        job_uuid = uuid.UUID(job_id)
    except (ValueError, TypeError):
        return []
    res = await db.execute(
        select(AutoLeaveLog)
        .where(AutoLeaveLog.job_id == job_uuid)
        .order_by(AutoLeaveLog.left_at.desc())
        .limit(limit)
    )
    return list(res.scalars().all())


async def delete_auto_leave_job(
    db: AsyncSession, job_id: str, user_id: str
) -> bool:
    try:
        job_uuid = uuid.UUID(job_id)
    except (ValueError, TypeError):
        return False

    res = await db.execute(
        select(AutoLeaveJob).where(
            AutoLeaveJob.id == job_uuid, AutoLeaveJob.user_id == uuid.UUID(user_id)
        )
    )
    job = res.scalar_one_or_none()
    if job is None:
        return False

    task = _running_auto_leave_tasks.get(job_id)
    if task and not task.done():
        task.cancel()

    await db.delete(job)
    await db.commit()
    return True


async def resume_running_auto_leaves_on_startup(db: AsyncSession) -> int:
    """Find jobs left running or pending when worker was restarted and re-enqueue."""
    res = await db.execute(
        select(AutoLeaveJob)
        .where(AutoLeaveJob.status.in_(["running", "pending"]))
        .order_by(AutoLeaveJob.created_at.asc())
    )
    jobs = res.scalars().all()
    count = 0
    for job in jobs:
        logger.info("Resuming auto-leave job %s on startup", job.id)
        start_auto_leave_task(str(job.id))
        count += 1
    return count


async def cancel_all_auto_leave_tasks() -> int:
    cancelled = 0
    for task in list(_running_auto_leave_tasks.values()):
        if not task.done():
            task.cancel()
            cancelled += 1
    _running_auto_leave_tasks.clear()
    return cancelled


# ── Execution Loop ───────────────────────────────────────────────────────────


def start_auto_leave_task(job_id: str) -> None:
    clear_job_event(job_id)
    task = _running_auto_leave_tasks.get(job_id)
    if task and not task.done():
        return
    _running_auto_leave_tasks[job_id] = asyncio.create_task(
        _execute_auto_leave_job(job_id)
    )


async def _execute_auto_leave_job(job_id: str) -> None:
    """Execute the auto-leave job inside the background worker."""
    from app.database import async_session_factory
    from app.utils.redis_dispatcher import publish_job_completed

    try:
        job_uuid = uuid.UUID(job_id)
    except (ValueError, TypeError):
        logger.error("Auto-leave: invalid job_id %s", job_id)
        return

    async with async_session_factory() as db:
        res = await db.execute(select(AutoLeaveJob).where(AutoLeaveJob.id == job_uuid))
        job = res.scalar_one_or_none()
        if job is None:
            logger.error("Auto-leave job %s not found in DB", job_id)
            return

        acc_ids = list(job.account_ids)
        leave_type = job.leave_type
        skip_creator = job.skip_creator
        delay_per_chat = job.delay_per_chat
        delay_randomized = job.delay_randomized

        # Fetch the account
        if not acc_ids:
            job.status = "failed"
            job.completed_at = datetime.now(timezone.utc)
            await db.commit()
            return

        acc_uuid = uuid.UUID(acc_ids[0])
        acc_res = await db.execute(
            select(TelegramAccount).where(TelegramAccount.id == acc_uuid)
        )
        account = acc_res.scalar_one_or_none()

    if account is None:
        await _set_status(job_uuid, "failed")
        await _push(job_id, "error", {
            "status": "failed",
            "message": "Akun Telegram tidak ditemukan.",
        })
        return

    acc_id_str = str(account.id)
    if not await acquire_lease(acc_id_str, OWNER_WORKER):
        logger.warning("Auto-leave: could not acquire lease for account %s", acc_id_str)
        await _set_status(job_uuid, "failed")
        await _push(job_id, "error", {
            "status": "failed",
            "message": f"Akun {account.phone} sedang dipakai oleh proses lain.",
        })
        return

    # Check restriction
    if is_account_restricted(account):
        await _set_status(job_uuid, "failed")
        await _push(job_id, "error", {
            "status": "failed",
            "message": f"Akun {account.phone} sedang dibatasi oleh Telegram ({account.restriction_status or 'limited'}).",
        })
        await release_lease(acc_id_str, OWNER_WORKER)
        return

    await _set_status(job_uuid, "running")
    await _push(job_id, "status", {"status": "running", "message": "Memulai auto-leave..."})

    try:
        session_str = decrypt(account.session_string)
        client = await client_pool.borrow(acc_id_str, session_str)
        if client is None:
            raise RuntimeError("Gagal menghubungkan client Telegram (session tidak valid).")

        # Step 1: Scan all dialogs matching leave_type
        targets_to_leave: list[dict] = []
        skipped_creators: list[dict] = []

        await _push(job_id, "scanning", {"status": "running", "message": "Memindai daftar grup dan channel..."})

        try:
            async for dialog in client.iter_dialogs():
                cur_st = await _get_job_status(job_uuid)
                if cur_st == "cancelled":
                    break

                try:
                    is_grp = dialog.is_group
                    is_chn = dialog.is_channel and not dialog.is_group

                    target_kind = None
                    if is_grp and leave_type in ("groups", "both"):
                        target_kind = "group"
                    elif is_chn and leave_type in ("channels", "both"):
                        target_kind = "channel"

                    if not target_kind:
                        continue

                    is_creator = getattr(dialog.entity, "creator", False)
                    chat_info = {
                        "entity": dialog.input_entity,
                        "raw_entity": dialog.entity,
                        "chat_id": dialog.id,
                        "title": dialog.name or "Unnamed",
                        "username": getattr(dialog.entity, "username", None),
                        "chat_type": target_kind,
                        "is_creator": is_creator,
                    }

                    if is_creator and skip_creator:
                        skipped_creators.append(chat_info)
                    else:
                        targets_to_leave.append(chat_info)
                except Exception as d_err:
                    logger.debug("Skipping unreadable dialog during execute: %s", d_err)
                    continue
        except FloodWaitError as fwe:
            wait_sec = int(fwe.seconds) if getattr(fwe, "seconds", 0) > 0 else _extract_flood_seconds(fwe, str(fwe))
            safe_wait = wait_sec + 2
            logger.warning("Dialog scan hit FloodWait %ds for account %s", wait_sec, account.phone)
            await _push(job_id, "flood_wait", {
                "status": "running",
                "message": f"Rate limit Telegram saat pemindaian dialog. Menunggu {safe_wait} detik...",
                "wait_seconds": safe_wait,
            })
            await interruptible_sleep(job_id, safe_wait)

        total_tasks = len(targets_to_leave) + len(skipped_creators)
        success_count = 0
        skipped_count = 0
        fail_count = 0

        # Handle 0 targets gracefully
        if total_tasks == 0:
            log = AutoLeaveLog(
                job_id=job_uuid,
                target="Tidak ada grup/channel",
                chat_id=0,
                chat_title="-",
                chat_username=None,
                chat_type="none",
                status="skipped",
                error_type="no_targets",
                error_message="Tidak ditemukan grup atau channel yang memenuhi kriteria untuk ditinggalkan.",
                account_id_used=account.id,
                account_name=account.phone,
            )
            await _save_log_and_counters(
                job_uuid,
                log,
                success=0,
                skipped=0,
                failed=0,
                progress=100,
                total=0,
            )
            await _set_status(job_uuid, "completed")
            await _push(job_id, "completed", {
                "status": "completed",
                "message": "Tidak ditemukan grup atau channel untuk ditinggalkan.",
                "success_count": 0,
                "skipped_count": 0,
                "fail_count": 0,
                "total_tasks": 0,
                "progress": 100,
            })
            await publish_job_completed("autoleave", job_id, [acc_id_str])
            return

        # Log skipped creators immediately
        for sk in skipped_creators:
            skipped_count += 1
            log = AutoLeaveLog(
                job_id=job_uuid,
                target=sk["title"],
                chat_id=sk["chat_id"],
                chat_title=sk["title"],
                chat_username=sk["username"],
                chat_type=sk["chat_type"],
                status="skipped",
                error_type="user_creator",
                error_message="Dilewati: Akun adalah creator/pemilik grup/channel ini.",
                account_id_used=account.id,
                account_name=account.phone,
            )
            prog = int((skipped_count + success_count + fail_count) / max(1, total_tasks) * 100)
            await _save_log_and_counters(
                job_uuid,
                log,
                success=success_count,
                skipped=skipped_count,
                failed=fail_count,
                progress=prog,
                total=total_tasks,
            )
            await _push(job_id, "item_skipped", {
                "status": "running",
                "target": sk["title"],
                "reason": "Dilewati (Creator/Owner)",
                "success_count": success_count,
                "skipped_count": skipped_count,
                "fail_count": fail_count,
                "total_tasks": total_tasks,
                "progress": prog,
            })

        # Step 2: Iterate and leave targets
        fatal_aborted = False
        for idx, item in enumerate(targets_to_leave):
            cur_status = await _get_job_status(job_uuid)
            if cur_status == "cancelled":
                logger.info("Auto-leave job %s was cancelled", job_id)
                break
            while cur_status == "paused":
                await interruptible_sleep(job_id, 86400)
                cur_status = await _get_job_status(job_uuid)
                if cur_status == "cancelled":
                    break
            if cur_status == "cancelled":
                break

            log = AutoLeaveLog(
                job_id=job_uuid,
                target=item["title"],
                chat_id=item["chat_id"],
                chat_title=item["title"],
                chat_username=item["username"],
                chat_type=item["chat_type"],
                account_id_used=account.id,
                account_name=account.phone,
            )

            # Smart FloodWait handling: stay running, wait, retry same target
            rate_limit_retries = 0
            while True:
                cur_status = await _get_job_status(job_uuid)
                if cur_status == "cancelled":
                    break
                while cur_status == "paused":
                    await interruptible_sleep(job_id, 86400)
                    cur_status = await _get_job_status(job_uuid)
                    if cur_status == "cancelled":
                        break
                if cur_status == "cancelled":
                    break

                if rate_limit_retries >= MAX_RATE_LIMIT_RETRIES:
                    log.status = "error"
                    log.error_type = "rate_limit_exceeded"
                    log.error_message = (
                        f"Gagal keluar setelah {MAX_RATE_LIMIT_RETRIES}x rate limit."
                    )
                    fail_count += 1
                    break

                try:
                    # Telethon delete_dialog leaves channel/chat and removes from dialogs
                    await client.delete_dialog(item["entity"])
                    log.status = "success"
                    success_count += 1
                    flood_controller.record_success(acc_id_str)
                    break

                except FloodWaitError as fwe:
                    rate_limit_retries += 1
                    wait_sec = int(fwe.seconds) if getattr(fwe, "seconds", 0) > 0 else _extract_flood_seconds(fwe, str(fwe))
                    safe_wait = wait_sec + 2
                    flood_controller.record_flood(acc_id_str, safe_wait)
                    logger.warning(
                        "AutoLeave FloodWait %ds for %s on account %s. Waiting %ds (retry %d/%d)...",
                        wait_sec,
                        item["title"],
                        account.phone,
                        safe_wait,
                        rate_limit_retries,
                        MAX_RATE_LIMIT_RETRIES,
                    )
                    await _push(job_id, "flood_wait", {
                        "status": "running",
                        "message": f"Rate limit Telegram (FloodWait). Menunggu {safe_wait} detik sebelum mencoba kembali...",
                        "wait_seconds": safe_wait,
                        "target": item["title"],
                        "retry_attempt": rate_limit_retries,
                        "max_retries": MAX_RATE_LIMIT_RETRIES,
                        "success_count": success_count,
                        "skipped_count": skipped_count,
                        "fail_count": fail_count,
                        "total_tasks": total_tasks,
                    })
                    if not await interruptible_sleep(job_id, safe_wait):
                        cur_status = await _get_job_status(job_uuid)
                        if cur_status == "cancelled":
                            break
                        while cur_status == "paused":
                            await interruptible_sleep(job_id, 86400)
                            cur_status = await _get_job_status(job_uuid)
                            if cur_status == "cancelled":
                                break
                        if cur_status == "cancelled":
                            break
                    continue

                except Exception as exc:
                    # Check for PeerFlood
                    if _is_peer_flood_error(exc):
                        rate_limit_retries += 1
                        safe_wait = 300
                        flood_controller.record_flood(acc_id_str, safe_wait)
                        logger.warning(
                            "AutoLeave PeerFlood for %s on account %s. Waiting %ds (retry %d/%d)...",
                            item["title"],
                            account.phone,
                            safe_wait,
                            rate_limit_retries,
                            MAX_RATE_LIMIT_RETRIES,
                        )
                        await _push(job_id, "flood_wait", {
                            "status": "running",
                            "message": f"Rate limit Telegram (PeerFlood). Menunggu {safe_wait} detik sebelum mencoba kembali...",
                            "wait_seconds": safe_wait,
                            "target": item["title"],
                            "retry_attempt": rate_limit_retries,
                            "max_retries": MAX_RATE_LIMIT_RETRIES,
                            "success_count": success_count,
                            "skipped_count": skipped_count,
                            "fail_count": fail_count,
                            "total_tasks": total_tasks,
                        })
                        if not await interruptible_sleep(job_id, safe_wait):
                            cur_status = await _get_job_status(job_uuid)
                            if cur_status == "cancelled":
                                break
                            while cur_status == "paused":
                                await interruptible_sleep(job_id, 86400)
                                cur_status = await _get_job_status(job_uuid)
                                if cur_status == "cancelled":
                                    break
                            if cur_status == "cancelled":
                                break
                        continue

                    # Check for string-based FloodWait
                    err_msg = str(exc)
                    if "flood" in err_msg.lower() or "wait of" in err_msg.lower():
                        sec = _extract_flood_seconds(exc, err_msg)
                        safe_wait = sec + 2
                        rate_limit_retries += 1
                        flood_controller.record_flood(acc_id_str, safe_wait)
                        logger.warning(
                            "AutoLeave rate limit string match %ds for %s. Waiting %ds...",
                            sec,
                            item["title"],
                            safe_wait,
                        )
                        await _push(job_id, "flood_wait", {
                            "status": "running",
                            "message": f"Rate limit Telegram. Menunggu {safe_wait} detik...",
                            "wait_seconds": safe_wait,
                            "target": item["title"],
                            "retry_attempt": rate_limit_retries,
                            "max_retries": MAX_RATE_LIMIT_RETRIES,
                            "success_count": success_count,
                            "skipped_count": skipped_count,
                            "fail_count": fail_count,
                            "total_tasks": total_tasks,
                        })
                        if not await interruptible_sleep(job_id, safe_wait):
                            cur_status = await _get_job_status(job_uuid)
                            if cur_status == "cancelled":
                                break
                            while cur_status == "paused":
                                await interruptible_sleep(job_id, 86400)
                                cur_status = await _get_job_status(job_uuid)
                                if cur_status == "cancelled":
                                    break
                            if cur_status == "cancelled":
                                break
                        continue

                    # Check for Fatal Session Invalidation
                    if _is_fatal_session_error(exc):
                        logger.error("AutoLeave: fatal session error on account %s: %s", account.phone, exc)
                        log.status = "error"
                        log.error_type = "session_revoked"
                        log.error_message = "Sesi akun Telegram telah berakhir atau dinonaktifkan oleh Telegram."
                        fail_count += 1
                        try:
                            async with async_session_factory() as sdb:
                                acc_row = await sdb.get(TelegramAccount, acc_uuid)
                                if acc_row:
                                    acc_row.is_active = False
                                    await sdb.commit()
                        except Exception as db_e:
                            logger.warning("Could not mark account inactive: %s", db_e)
                        try:
                            await client_pool.remove(acc_id_str, save_state=False)
                        except Exception:
                            pass
                        fatal_aborted = True
                        break

                    # Check for Account Restriction
                    if _is_restriction_error(exc):
                        logger.warning("AutoLeave: account restricted by Telegram: %s", exc)
                        log.status = "error"
                        log.error_type = "account_restricted"
                        log.error_message = f"Akun dibatasi oleh Telegram: {err_msg}"
                        fail_count += 1
                        try:
                            async with async_session_factory() as sdb:
                                acc_row = await sdb.get(TelegramAccount, acc_uuid)
                                if acc_row:
                                    mark_account_restricted(acc_row, RESTRICTED_LIMITED, err_msg)
                                    await sdb.commit()
                        except Exception as db_e:
                            logger.warning("Could not mark account restricted: %s", db_e)
                        await _push(job_id, "account_restricted", {
                            "account": account.phone,
                            "message": f"Akun {account.phone} dibatasi oleh Telegram. Job dihentikan.",
                        })
                        fatal_aborted = True
                        break

                    # Check for Creator Error
                    if _is_creator_error(exc):
                        log.status = "skipped"
                        log.error_type = "user_creator"
                        log.error_message = "Akun adalah pemilik grup/channel (tidak dapat keluar tanpa transfer kepemilikan)."
                        skipped_count += 1
                        break

                    # Check for Admin Rights Error
                    if _is_admin_rights_error(exc):
                        log.status = "skipped"
                        log.error_type = "chat_admin_required"
                        log.error_message = "Tidak dapat keluar: Diperlukan hak akses admin atau lepaskan status admin terlebih dahulu."
                        skipped_count += 1
                        break

                    # Check for Inaccessible / Already Left
                    if _is_already_left_or_inaccessible(exc):
                        log.status = "success"
                        log.error_message = "Sudah keluar atau tidak lagi menjadi anggota."
                        success_count += 1
                        flood_controller.record_success(acc_id_str)
                        break

                    # Generic failure
                    log.status = "error"
                    log.error_type = type(exc).__name__
                    log.error_message = err_msg
                    fail_count += 1
                    break

            prog = int((skipped_count + success_count + fail_count) / max(1, total_tasks) * 100)
            await _save_log_and_counters(
                job_uuid,
                log,
                success=success_count,
                skipped=skipped_count,
                failed=fail_count,
                progress=prog,
                total=total_tasks,
            )

            await _push(job_id, "progress", {
                "status": "running",
                "target": item["title"],
                "target_status": log.status,
                "error_message": log.error_message,
                "success_count": success_count,
                "skipped_count": skipped_count,
                "fail_count": fail_count,
                "total_tasks": total_tasks,
                "progress": prog,
            })

            if fatal_aborted:
                logger.info("Auto-leave job %s stopping early due to fatal account condition", job_id)
                break

            # Pacing delay between chats
            if idx < len(targets_to_leave) - 1:
                delay = float(delay_per_chat)
                if delay_randomized:
                    delay = _jitter(delay * 0.7, delay * 1.4)
                actual_delay = max(delay, flood_controller.get_delay(acc_id_str))
                await interruptible_sleep(job_id, actual_delay)

        # Finalize status
        final_status = await _get_job_status(job_uuid)
        if fatal_aborted:
            final_status = "failed"
            await _set_status(job_uuid, "failed")
        elif final_status != "cancelled":
            final_status = "completed"
            await _set_status(job_uuid, "completed")

        await _push(job_id, final_status, {
            "status": final_status,
            "success_count": success_count,
            "skipped_count": skipped_count,
            "fail_count": fail_count,
            "total_tasks": total_tasks,
            "progress": 100,
        })

        await publish_job_completed("autoleave", job_id, [acc_id_str])

    except Exception as exc:
        logger.error("Auto-leave job %s crashed: %s", job_id, exc, exc_info=True)
        await _set_status(job_uuid, "failed")
        await _push(job_id, "error", {"status": "failed", "message": str(exc)})
    finally:
        try:
            await client_pool.release(acc_id_str)
        except Exception:
            pass
        await release_lease(acc_id_str, OWNER_WORKER)
        _running_auto_leave_tasks.pop(job_id, None)
