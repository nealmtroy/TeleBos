"""Broadcast management business logic — group lists, text lists, jobs, execution."""

import asyncio
import json
import logging
import random
import time
import uuid
from datetime import datetime, timezone

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import InvalidRequestError

from app.models.broadcast_job import BroadcastJob
from app.models.broadcast_log import BroadcastLog
from app.models.group_list import GroupList
from app.models.text_list import TextList
from app.models.telegram_account import TelegramAccount
from app.models.user import User
from app.services.telegram_client import client_pool
from app.utils.encryption import decrypt
from app.utils.flood_control import flood_controller
from app.utils.telegram_errors import classify_telegram_error

logger = logging.getLogger(__name__)

# In-process task tracker for background broadcast jobs (replaces Celery)
_running_tasks: dict[str, asyncio.Task] = {}
_job_events: dict[str, asyncio.Event] = {}


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
            logger.warning("BroadcastJob detached from session and has no identity, cannot re-fetch")
            return None

        logger.warning("BroadcastJob %s detached from session, re-fetching", job_id)
        from app.database import async_session_factory
        async with async_session_factory() as fresh_db:
            result = await fresh_db.execute(
                select(BroadcastJob).where(BroadcastJob.id == job_id)
            )
            fresh_job = result.scalar_one_or_none()
            if fresh_job is None:
                return None
        # Merge back into the original session so subsequent state changes
        # are tracked as expected.
        return await db.merge(fresh_job)

async def _interruptible_sleep(job_id: str, seconds: float) -> bool:
    """Sleep for `seconds`, but wake up immediately if _wake_job is called.
    Returns True if sleep completed naturally, False if interrupted."""
    if seconds <= 0:
        return True

    ev = _job_events.get(job_id)
    if not ev:
        ev = asyncio.Event()
        _job_events[job_id] = ev

    ev.clear()
    try:
        # Wait for either the timeout or the event to be set
        await asyncio.wait_for(ev.wait(), timeout=seconds)
        # If we get here, the event was set (interrupted)
        return False
    except asyncio.TimeoutError:
        # If we get TimeoutError, it means the event was NOT set and time expired (natural completion)
        return True


# ── Group Lists ──────────────────────────────────────────────────────────────


async def get_group_lists(db: AsyncSession, user: User) -> list[GroupList]:
    result = await db.execute(
        select(GroupList)
        .where(GroupList.user_id == user.id)
        .order_by(GroupList.updated_at.desc())
    )
    return list(result.scalars().all())


async def create_group_list(db: AsyncSession, user: User, name: str, items: list) -> GroupList:
    gl = GroupList(user_id=user.id, name=name, items=items)
    db.add(gl)
    await db.flush()
    await db.refresh(gl)
    return gl


async def update_group_list(db: AsyncSession, gl_id: str, user_id: str, name: str | None, items: list | None) -> GroupList:
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
    await db.delete(gl)


# ── Text Lists ───────────────────────────────────────────────────────────────


async def get_text_lists(db: AsyncSession, user: User) -> list[TextList]:
    result = await db.execute(
        select(TextList)
        .where(TextList.user_id == user.id)
        .order_by(TextList.updated_at.desc())
    )
    return list(result.scalars().all())


async def create_text_list(db: AsyncSession, user: User, name: str, texts: list) -> TextList:
    tl = TextList(user_id=user.id, name=name, texts=texts)
    db.add(tl)
    await db.flush()
    await db.refresh(tl)
    return tl


async def update_text_list(db: AsyncSession, tl_id: str, user_id: str, name: str | None, texts: list | None) -> TextList:
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
) -> BroadcastJob:
    """Create a new broadcast job and queue it."""
    # Validate existence of accounts
    if not account_ids:
        raise ValueError("At least one account is required")

    from app.services.account_service import get_account
    valid_account_ids = []
    for acc_id in account_ids:
        account = await get_account(db, acc_id, str(user.id))
        if account is None:
            raise ValueError(f"Account {acc_id} not found")
        valid_account_ids.append(str(account.id))

    gl_result = await db.execute(
        select(GroupList).where(GroupList.id == group_list_id, GroupList.user_id == user.id)
    )
    group_list = gl_result.scalar_one_or_none()
    if group_list is None:
        raise ValueError("Group list not found")

    text_list = None
    if text_list_id:
        tl_result = await db.execute(
            select(TextList).where(TextList.id == text_list_id, TextList.user_id == user.id)
        )
        text_list = tl_result.scalar_one_or_none()
        if text_list is None:
            raise ValueError("Text list not found")

    if mode == "single_text" and not custom_text and not text_list:
        raise ValueError("single_text mode requires custom_text or text_list")

    total_groups = len(group_list.items)

    job = BroadcastJob(
        account_ids=valid_account_ids,
        user_id=user.id,
        group_list_id=group_list_id,
        text_list_id=text_list_id,
        mode=mode,
        custom_text=custom_text,
        status="running",
        total_groups=total_groups,
        delay_per_group=delay_per_group,
        delay_after_all=delay_after_all,
        loop_enabled=loop_enabled,
        delay_randomized=delay_randomized,
        log_destination=log_destination,
    )
    db.add(job)
    await db.flush()
    await db.commit()
    await db.refresh(job)

    # Run broadcast in background asyncio task (no Celery needed)
    job_id_str = str(job.id)

    async def _safe_execute():
        try:
            await execute_broadcast(job_id_str)
        except Exception as exc:
            logger.exception("Background broadcast task %s crashed: %s", job_id_str, exc)
        finally:
            _running_tasks.pop(job_id_str, None)
            _job_events.pop(job_id_str, None)

    task = asyncio.create_task(_safe_execute())
    _running_tasks[job_id_str] = task

    return job



def _wake_job(job_id: str) -> None:
    ev = _job_events.get(job_id)
    if ev:
        ev.set()

async def get_job(db: AsyncSession, job_id: str, user_id: str) -> BroadcastJob | None:
    result = await db.execute(
        select(BroadcastJob).where(BroadcastJob.id == job_id, BroadcastJob.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def get_jobs_for_user(
    db: AsyncSession, user_id: str, limit: int = 20
) -> list[BroadcastJob]:
    result = await db.execute(
        select(BroadcastJob)
        .where(BroadcastJob.user_id == user_id)
        .order_by(BroadcastJob.created_at.desc())
        .limit(limit)
    )
    return list(result.scalars().all())


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
        select(BroadcastJob).where(
            BroadcastJob.id == job_id, BroadcastJob.user_id == user_id
        )
    )
    job = result.scalar_one_or_none()
    if job is None:
        raise ValueError("Job not found")
    if job.status in ("running", "paused"):
        raise ValueError("Cannot delete an active job — stop it first")
    await db.delete(job)
    await db.flush()


async def retry_job(db: AsyncSession, job_id: str, user_id: str) -> BroadcastJob:
    """Reset and re-queue a terminal broadcast job with the same parameters."""
    result = await db.execute(
        select(BroadcastJob).where(
            BroadcastJob.id == job_id, BroadcastJob.user_id == user_id
        )
    )
    job = result.scalar_one_or_none()
    if job is None:
        raise ValueError("Job not found")
    if job.status not in ("completed", "cancelled", "failed"):
        raise ValueError(f"Cannot retry a job with status '{job.status}'")

    # Reset job state — old logs remain
    job.status = "running"
    job.progress = 0
    job.sent_count = 0
    job.fail_count = 0
    job.completed_at = None
    await db.flush()
    await db.commit()
    await db.refresh(job)

    # Run broadcast in background asyncio task
    job_id_str = str(job.id)

    async def _safe_execute():
        try:
            await execute_broadcast(job_id_str)
        except Exception as exc:
            logger.exception("Background broadcast task %s crashed: %s", job_id_str, exc)
        finally:
            _running_tasks.pop(job_id_str, None)
            _job_events.pop(job_id_str, None)

    task = asyncio.create_task(_safe_execute())
    _running_tasks[job_id_str] = task

    return job


async def get_job_logs(
    db: AsyncSession,
    job_id: str,
    filters: dict | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[BroadcastLog]:
    query = select(BroadcastLog).where(BroadcastLog.job_id == job_id)

    if filters:
        if filters.get("status"):
            query = query.where(BroadcastLog.status == filters["status"])
        if filters.get("error_type"):
            query = query.where(BroadcastLog.error_type == filters["error_type"])
        if filters.get("search"):
            search_val = filters["search"].replace("%", "\\%").replace("_", "\\_")
            search = f"%{search_val}%"
            query = query.where(BroadcastLog.group_identifier.ilike(search, escape="\\"))

        if filters.get("cycle"):
            query = query.where(BroadcastLog.cycle_number == int(filters["cycle"]))

    query = query.order_by(BroadcastLog.sent_at.asc()).offset(offset).limit(limit)
    result = await db.execute(query)
    return list(result.scalars().all())


# ── Broadcast Execution (runs as asyncio.Task in-process) ─────────────────────


async def _push_broadcast(job_id: str, event_type: str, data: dict) -> None:
    """Push a real-time event to WebSocket clients subscribed to this job."""
    try:
        from app.api.ws import manager
        await manager.broadcast(
            f"broadcast:{job_id}",
            {"type": event_type, **data},
        )
    except Exception as push_exc:
        logger.warning("WS push failed for job %s: %s", job_id, push_exc)


async def _account_for_log(account_id: str, db: AsyncSession | None = None) -> TelegramAccount | None:
    """Fetch a TelegramAccount by id-string for log labeling."""
    import uuid as _uuid
    try:
        acc_uuid = _uuid.UUID(account_id)
    except (ValueError, TypeError):
        return None

    if db is not None:
        res = await db.execute(
            select(TelegramAccount).where(TelegramAccount.id == acc_uuid)
        )
        return res.scalar_one_or_none()

    from app.database import async_session_factory
    async with async_session_factory() as fresh_db:
        res = await fresh_db.execute(
            select(TelegramAccount).where(TelegramAccount.id == acc_uuid)
        )
        return res.scalar_one_or_none()

def _invite_hash(target: str) -> str | None:
    text = target.strip()
    if "joinchat/" in text:
        return text.split("joinchat/", 1)[1].split("?", 1)[0].strip("/")
    if "t.me/+" in text:
        return text.split("t.me/+", 1)[1].split("?", 1)[0].strip("/")
    if text.startswith("+"):
        return text[1:].split("?", 1)[0].strip("/")
    return None


def _chatlist_slug(target: str) -> str | None:
    text = target.strip()
    if "t.me/addlist/" in text:
        return text.split("t.me/addlist/", 1)[1].split("?", 1)[0].strip("/")
    if "telegram.me/addlist/" in text:
        return text.split("telegram.me/addlist/", 1)[1].split("?", 1)[0].strip("/")
    if text.startswith("addlist/"):
        return text.split("addlist/", 1)[1].split("?", 1)[0].strip("/")
    return None


def _public_target(target: str) -> str:
    text = target.strip()
    for prefix in ("https://t.me/", "http://t.me/", "t.me/"):
        if text.startswith(prefix):
            text = text[len(prefix):]
            break
    return text.lstrip("@").split("?", 1)[0].strip("/")


def _chatlist_peers(invite) -> list:
    if hasattr(invite, "peers"):
        return list(invite.peers or [])
    peers = []
    peers.extend(getattr(invite, "missing_peers", []) or [])
    peers.extend(getattr(invite, "already_peers", []) or [])
    return peers


async def _join_and_resolve_chatlist(client, target: str) -> list:
    from telethon.tl.functions.chatlists import CheckChatlistInviteRequest, JoinChatlistInviteRequest

    slug = _chatlist_slug(target)
    if not slug:
        return []

    invite = await client(CheckChatlistInviteRequest(slug))
    peers = _chatlist_peers(invite)
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
        try:
            entities.append(await client.get_entity(peer))
        except Exception:
            pass
    return entities


async def _join_and_resolve_target(client, target: str):
    from telethon.tl.functions.channels import JoinChannelRequest, GetFullChannelRequest
    from telethon.tl.functions.messages import ImportChatInviteRequest, CheckChatInviteRequest
    from telethon.tl.types import ChatInviteAlready, ChatInvite, Channel
    from telethon.errors import UserAlreadyParticipantError

    invite = _invite_hash(target)
    entity = None

    if invite:
        # Check invite link status before joining
        invite_info = await client(CheckChatInviteRequest(invite))
        if isinstance(invite_info, ChatInviteAlready):
            entity = invite_info.chat
        else:
            try:
                updates = await client(ImportChatInviteRequest(invite))
                if getattr(updates, "chats", None):
                    entity = updates.chats[0]
            except UserAlreadyParticipantError:
                # Fallback: if CheckChatInviteRequest did not return ChatInviteAlready
                # but we are already a participant, search dialogue list by name matching the invite title
                expected_title = getattr(invite_info, "title", None)
                if expected_title:
                    async for dialog in client.iter_dialogs():
                        if dialog.name == expected_title:
                            entity = dialog.entity
                            break
                if not entity:
                    raise ValueError(f"Already a participant but could not find private chat with title '{expected_title}' in dialogs")
    else:
        public = _public_target(target)
        if public.lstrip("-").isdigit():
            entity = await client.get_entity(int(public))
        else:
            entity = await client.get_entity(public)

        try:
            await client(JoinChannelRequest(entity))
        except UserAlreadyParticipantError:
            pass
        except Exception:
            # Fallback in case JoinChannelRequest fails for other reasons but entity is accessible
            pass

    if not entity:
        raise ValueError(f"Could not resolve or join target: {target}")

    # If the resolved entity is a broadcast Channel, look for its linked discussion group
    if isinstance(entity, Channel) and entity.broadcast:
        try:
            full_channel = await client(GetFullChannelRequest(entity))
            discussion_chat_id = full_channel.full_chat.linked_chat_id
            if discussion_chat_id:
                discussion_entity = await client.get_entity(discussion_chat_id)
                try:
                    await client(JoinChannelRequest(discussion_entity))
                except UserAlreadyParticipantError:
                    pass
                except Exception:
                    pass
                entity = discussion_entity
        except Exception as e:
            logger.warning("Failed to resolve/join discussion group for channel %s: %s", target, e)

    return entity


async def _broadcast_entities_for_target(client, target: str) -> list:
    if _chatlist_slug(target):
        entities = await _join_and_resolve_chatlist(client, target)
        if entities:
            return entities
    return [await _join_and_resolve_target(client, target)]


async def execute_broadcast(job_id: str):
    """Execute a broadcast job. Runs as an asyncio.Task in the FastAPI process."""
    from app.database import async_session_factory
    import uuid as _uuid
    import time
    from telethon import TelegramClient
    from telethon.sessions import StringSession
    import telethon
    from app.config import get_settings
    from app.utils.flood_control import flood_controller as fc
    from app.services.telegram_client import client_pool
    from app.utils.encryption import decrypt
    from app.utils.telegram_errors import classify_telegram_error
    from telethon.utils import get_peer_id

    try:
        job_uuid = _uuid.UUID(job_id) if isinstance(job_id, str) else job_id
    except ValueError:
        job_uuid = job_id

    job_id_str = str(job_uuid)

    # Helper to check and retrieve the current status of the job using a fresh session
    async def _get_current_status(jid):
        async with async_session_factory() as sdb:
            res = await sdb.execute(
                select(BroadcastJob.status).where(BroadcastJob.id == jid)
            )
            return res.scalar_one_or_none()

    try:
        # ── Initial Setup (runs in a short-lived DB session) ──
        async with async_session_factory() as db:
            result = await db.execute(
                select(BroadcastJob).where(BroadcastJob.id == job_uuid)
            )
            job_orm = result.scalar_one_or_none()
            if job_orm is None:
                return
            # If already cancelled/completed before execution starts
            if job_orm.status in ("cancelled", "completed"):
                return

            # Ensure status is running
            job_orm.status = "running"
            await db.commit()

            # Copy required parameters into memory
            loop_enabled = job_orm.loop_enabled
            delay_randomized = job_orm.delay_randomized
            delay_per_group = job_orm.delay_per_group
            delay_after_all = job_orm.delay_after_all
            log_destination = job_orm.log_destination
            mode = job_orm.mode
            custom_text = job_orm.custom_text
            account_ids = list(job_orm.account_ids)
            sent = job_orm.sent_count
            failed = job_orm.fail_count
            total_groups = job_orm.total_groups

            await _push_broadcast(job_id_str, "status", {
                "status": "running",
                "total": total_groups,
                "sent": sent,
                "failed": failed,
            })

            # Load group list
            gl_result = await db.execute(
                select(GroupList).where(GroupList.id == job_orm.group_list_id)
            )
            group_list = gl_result.scalar_one_or_none()
            if not group_list or not account_ids:
                job_orm.status = "failed"
                await db.commit()
                await _push_broadcast(job_id_str, "error", {
                    "status": "failed",
                    "message": "Group list or accounts not configured properly",
                })
                return
            items = list(group_list.items)
            group_list_name = group_list.name

            # Load texts
            texts = []
            if job_orm.text_list_id:
                tl_result = await db.execute(
                    select(TextList).where(TextList.id == job_orm.text_list_id)
                )
                text_list = tl_result.scalar_one_or_none()
                if text_list and text_list.texts:
                    texts = list(text_list.texts)
            if mode == "single_text" and custom_text:
                texts = [custom_text]

            # Load active accounts
            active_accounts = []
            settings = get_settings()

            for acc_id_str in account_ids:
                try:
                    acc_uuid = _uuid.UUID(acc_id_str)
                except ValueError:
                    continue
                acc_result = await db.execute(
                    select(TelegramAccount).where(TelegramAccount.id == acc_uuid)
                )
                account = acc_result.scalar_one_or_none()
                if not account:
                    logger.warning("Account %s not found, skipping", acc_id_str)
                    continue

                try:
                    session_str = decrypt(account.session_string)
                    client = await client_pool.get(acc_id_str, session_str)
                    if not client:
                        logger.warning("Account %s not authorized/pool failure, skipping", acc_id_str)
                        continue

                    active_accounts.append({
                        "account_id": acc_id_str,
                        "account_name": f"{account.first_name or ''} ({account.phone or ''})",
                        "client": client,
                        "cooldown_until": 0.0,
                        "join_cooldown_until": 0.0
                    })
                except Exception as connect_exc:
                    logger.exception("Failed to connect account %s: %s", acc_id_str, connect_exc)

            if not active_accounts:
                job_orm.status = "failed"
                await db.commit()
                await _push_broadcast(job_id_str, "error", {
                    "status": "failed",
                    "message": "No authorized Telegram accounts could be connected",
                })
                return

            # Query current max cycle to support resuming correctly
            cycle_res = await db.execute(
                select(func.max(BroadcastLog.cycle_number)).where(BroadcastLog.job_id == job_uuid)
            )
            max_cycle = cycle_res.scalar()
            cycle_count = max_cycle if max_cycle is not None else 0

        # Setup is complete and db session is closed.
        current_acc_idx = 0
        joined_pool: dict = {}
        pending_pool: dict = {}
        permanent_failures_pool: set = set()

        while True:
            is_looping = loop_enabled
            current_cycle = cycle_count + 1

            # ── Every cycle, retry pending groups first ──
            if pending_pool and is_looping:
                newly_joined = []
                still_pending = {}
                for pkey, pitem in list(pending_pool.items()):
                    current_status = await _get_current_status(job_uuid)
                    if current_status is None or current_status in ("cancelled", "paused"):
                        break

                    # Find ready account for joining
                    selected_acc = None
                    now_ts = time.time()
                    ready_accs = [
                        a for a in active_accounts 
                        if now_ts >= a["cooldown_until"] and now_ts >= a.get("join_cooldown_until", 0.0)
                    ]
                    if not ready_accs:
                        still_pending[pkey] = pitem
                        for k, v in pending_pool.items():
                            if k not in newly_joined and k not in joined_pool:
                                still_pending[k] = v
                        break

                    for offset in range(len(active_accounts)):
                        i_idx = (current_acc_idx + offset) % len(active_accounts)
                        candidate = active_accounts[i_idx]
                        if now_ts >= candidate["cooldown_until"] and now_ts >= candidate.get("join_cooldown_until", 0.0):
                            selected_acc = candidate
                            current_acc_idx = (i_idx + 1) % len(active_accounts)
                            break

                    if not selected_acc:
                        still_pending[pkey] = pitem
                        continue

                    client = selected_acc["client"]
                    try:
                        entities_retry = await _broadcast_entities_for_target(client, pitem["group_identifier"])
                        if entities_retry:
                            joined_pool[pkey] = entities_retry
                            newly_joined.append(pkey)
                            await _push_broadcast(job_id_str, "pending_joined", {
                                "group": pitem["group_identifier"],
                                "message": f"Retry join successful for {pitem['group_identifier']}",
                            })
                        else:
                            still_pending[pkey] = pitem
                    except Exception as resolve_exc:
                        resolve_err = classify_telegram_error(resolve_exc)
                        err_type, _ = resolve_err
                        if err_type in ("flood", "peer_flood", "slowmode"):
                            still_pending[pkey] = pitem
                            wait = 30
                            if hasattr(resolve_exc, "seconds"):
                                wait = resolve_exc.seconds
                            selected_acc["join_cooldown_until"] = time.time() + wait
                            continue
                        elif err_type == "already_invited":
                            joined_pool[pkey] = True
                            newly_joined.append(pkey)
                            continue
                        continue

                pending_pool = still_pending

            for idx, item in enumerate(items):
                # Find the next ready account
                selected_acc = None
                while True:
                    current_status = await _get_current_status(job_uuid)
                    if current_status is None or current_status == "cancelled":
                        break
                    while current_status == "paused":
                        await _interruptible_sleep(job_id_str, 86400) # Sleep indefinitely until woken
                        current_status = await _get_current_status(job_uuid)
                        if current_status is None or current_status == "cancelled":
                            break
                    if current_status == "cancelled":
                        break

                    if not active_accounts:
                        break

                    now_ts = time.time()
                    ready_accs = [a for a in active_accounts if now_ts >= a["cooldown_until"]]
                    if ready_accs:
                        target_val = item.get("value", "") or ""
                        target_type = item.get("type", "username")
                        target_pkey = f"{target_type}:{target_val}"
                        is_target_joined = target_pkey in joined_pool

                        if not is_target_joined:
                            for offset in range(len(active_accounts)):
                                i_idx = (current_acc_idx + offset) % len(active_accounts)
                                candidate = active_accounts[i_idx]
                                if now_ts >= candidate["cooldown_until"] and now_ts >= candidate.get("join_cooldown_until", 0.0):
                                    selected_acc = candidate
                                    current_acc_idx = (i_idx + 1) % len(active_accounts)
                                    break

                        if not selected_acc:
                            for offset in range(len(active_accounts)):
                                i_idx = (current_acc_idx + offset) % len(active_accounts)
                                candidate = active_accounts[i_idx]
                                if now_ts >= candidate["cooldown_until"]:
                                    selected_acc = candidate
                                    current_acc_idx = (i_idx + 1) % len(active_accounts)
                                    break

                        if selected_acc:
                            break

                    earliest_ready_time = min(a["cooldown_until"] for a in active_accounts)
                    wait_sec = max(1.0, earliest_ready_time - now_ts)

                    await _push_broadcast(job_id_str, "flood_wait", {
                        "wait_seconds": int(wait_sec),
                        "message": f"All accounts on cooldown. Waiting {int(wait_sec)}s...",
                    })

                    await _interruptible_sleep(job_id_str, wait_sec)

                current_status = await _get_current_status(job_uuid)
                if current_status is None or current_status == "cancelled":
                    break

                if not active_accounts:
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
                    await _push_broadcast(job_id_str, "error", {
                        "status": "failed",
                        "message": "All Telegram accounts have been limited or failed. Job stopped.",
                    })
                    break

                client = selected_acc["client"]
                acc_id_str = selected_acc["account_id"]
                acc_name = selected_acc["account_name"]

                group_identifier = item.get("value", "") or ""
                item_type = item.get("type", "username")

                pkey = f"{item_type}:{group_identifier}"
                cached_entity = joined_pool.get(pkey)

                if pkey in pending_pool:
                    continue

                if pkey in permanent_failures_pool:
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
                log_group_id = None

                # If we need to resolve/join, but the selected account is on join cooldown
                if cached_entity is None and time.time() < selected_acc.get("join_cooldown_until", 0.0):
                    log_status = "error"
                    log_err_type = "join_cooldown"
                    log_err_msg = "Skipped join: account is on join limit/cooldown"
                    
                    pending_pool[pkey] = {
                        "group_identifier": group_identifier,
                        "item_type": item_type,
                    }
                    failed += 1

                    # Update progress & save log in fresh session
                    async with async_session_factory() as fresh_db:
                        job_res = await fresh_db.execute(
                            select(BroadcastJob).where(BroadcastJob.id == job_uuid)
                        )
                        db_job = job_res.scalar_one_or_none()
                        if db_job:
                            db_job.progress = int(((idx + 1) / len(items)) * 100) if len(items) > 0 else 0
                            db_job.sent_count = sent
                            db_job.fail_count = failed
                        
                        db_log = BroadcastLog(
                            job_id=job_uuid,
                            cycle_number=current_cycle,
                            group_identifier=group_identifier,
                            account_id_used=_uuid.UUID(acc_id_str) if acc_id_str else None,
                            sent_text=chosen_text,
                            status=log_status,
                            error_type=log_err_type,
                            error_message=log_err_msg,
                            sent_at=datetime.now(timezone.utc),
                        )
                        fresh_db.add(db_log)
                        await fresh_db.commit()

                    await _push_broadcast(job_id_str, "progress", {
                        "current": idx + 1,
                        "total": len(items),
                        "progress": int(((idx + 1) / len(items)) * 100) if len(items) > 0 else 0,
                        "sent": sent,
                        "failed": failed,
                        "cycle": current_cycle,
                        "status": current_status,
                    })
                    await _push_broadcast(job_id_str, "log", {
                        "group": group_identifier,
                        "status": log_status,
                        "error_type": log_err_type,
                        "text": chosen_text,
                        "cycle": current_cycle,
                        "account_id_used": acc_id_str,
                        "account_name": acc_name,
                    })
                    continue

                entities = None
                try:
                    if cached_entity is not None:
                        entities = cached_entity
                    else:
                        entities = await _broadcast_entities_for_target(client, group_identifier)
                        if not entities:
                            raise ValueError(f"Could not resolve any entities for: {group_identifier}")

                except Exception as resolve_exc:
                    err_type, err_msg = classify_telegram_error(resolve_exc)

                    if err_type in ("flood", "peer_flood", "slowmode", "must_join_discussion", "guest_restricted", "send_restricted"):
                        pending_pool[pkey] = {
                            "group_identifier": group_identifier,
                            "item_type": item_type,
                        }

                    if err_type in ("invite_request_sent", "already_invited"):
                        log_status = "success"
                        log_err_type = err_type
                        log_err_msg = err_msg
                        log_duration_ms = int((time.time() - start_time) * 1000)
                        sent += 1
                    else:
                        log_status = "error"
                        log_err_type = err_type
                        log_err_msg = err_msg
                        failed += 1
                        permanent_failures_pool.add(pkey)

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
                            selected_acc["join_cooldown_until"] = time.time() + wait
                else:
                    try:
                        if chosen_text:
                            for entity in entities:
                                for retry_attempt in range(2):
                                    try:
                                        await client.send_message(entity, chosen_text)
                                        break
                                    except telethon.errors.UserNotParticipantError as unpe:
                                        if retry_attempt == 0:
                                            try:
                                                await client(telethon.errors.channels.JoinChannelRequest(entity))
                                                await asyncio.sleep(2)
                                                continue
                                            except Exception as join_err:
                                                raise join_err
                                        raise
                                    except (ConnectionError, TimeoutError, OSError) as net_exc:
                                        if retry_attempt == 0:
                                            logger.warning("Transient error sending message (job %s, account %s): %s. Retrying once...", job_id_str, acc_id_str, net_exc)
                                            await asyncio.sleep(2)
                                            if not client.is_connected():
                                                logger.info("Client %s disconnected, attempting reconnect...", acc_id_str)
                                                try:
                                                    await client.connect()
                                                    if not await client.is_user_authorized():
                                                        raise ValueError("Session expired after disconnect")
                                                    logger.info("Client %s reconnected successfully", acc_id_str)
                                                except Exception as reconnect_exc:
                                                    logger.error("Failed to reconnect client %s: %s", acc_id_str, reconnect_exc)
                                                    raise
                                            continue
                                        raise

                        if entities:
                            try:
                                log_group_id = get_peer_id(entities[0])
                            except Exception:
                                log_group_id = getattr(entities[0], "id", None)
                        else:
                            log_group_id = None

                        if entities:
                            joined_pool[pkey] = entities

                        log_status = "success"
                        log_duration_ms = int((time.time() - start_time) * 1000)
                        log_err_msg = None
                        log_err_type = None
                        sent += 1

                        fc.record_success(acc_id_str)

                    except Exception as exc:
                        err_type, err_msg = classify_telegram_error(exc)

                        if entities:
                            joined_pool[pkey] = entities

                        log_status = "error"
                        log_err_type = err_type
                        log_err_msg = err_msg
                        failed += 1

                        if err_type in ("admin_only", "banned", "invalid_username", "invalid_link", "private_channel"):
                            permanent_failures_pool.add(pkey)

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
                            selected_acc["cooldown_until"] = time.time() + wait

                        if err_type in ("session_revoked", "user_deactivated", "phone_banned"):
                            await _push_broadcast(job_id_str, "account_failed", {
                                "account": acc_name,
                                "message": f"Account {acc_name} session is revoked or banned ({err_type}). Removing.",
                            })
                            from app.services.telegram_client import client_pool
                            from app.services.event_relay import event_relay
                            await event_relay.detach(acc_id_str)
                            await client_pool.remove(acc_id_str)
                            
                            async with async_session_factory() as db_session:
                                acc = await _account_for_log(acc_id_str, db_session)
                                if acc:
                                    acc.is_active = False
                                    await db_session.commit()
                            active_accounts.remove(selected_acc)
                            if current_acc_idx >= len(active_accounts) and active_accounts:
                                current_acc_idx = 0

                # Save log and update progress
                async with async_session_factory() as fresh_db:
                    job_res = await fresh_db.execute(
                        select(BroadcastJob).where(BroadcastJob.id == job_uuid)
                    )
                    db_job = job_res.scalar_one_or_none()
                    if db_job:
                        db_job.progress = int(((idx + 1) / len(items)) * 100) if len(items) > 0 else 0
                        db_job.sent_count = sent
                        db_job.fail_count = failed
                    
                    db_log = BroadcastLog(
                        job_id=job_uuid,
                        cycle_number=current_cycle,
                        group_identifier=group_identifier,
                        account_id_used=_uuid.UUID(acc_id_str) if acc_id_str else None,
                        sent_text=chosen_text,
                        status=log_status,
                        error_type=log_err_type,
                        error_message=log_err_msg,
                        duration_ms=log_duration_ms,
                        group_id=log_group_id,
                        sent_at=datetime.now(timezone.utc),
                    )
                    fresh_db.add(db_log)
                    await fresh_db.commit()

                await _push_broadcast(job_id_str, "progress", {
                    "current": idx + 1,
                    "total": len(items),
                    "progress": int(((idx + 1) / len(items)) * 100) if len(items) > 0 else 0,
                    "sent": sent,
                    "failed": failed,
                    "cycle": current_cycle,
                    "status": current_status,
                })
                await _push_broadcast(job_id_str, "log", {
                    "group": group_identifier,
                    "status": log_status,
                    "error_type": log_err_type,
                    "text": chosen_text,
                    "cycle": current_cycle,
                    "account_id_used": acc_id_str,
                    "account_name": acc_name,
                })

                # Delay between groups (use flood-controlled delay if larger)
                if delay_randomized:
                    base_delay = random.randint(5, 30)
                else:
                    base_delay = delay_per_group
                flood_delay = fc.get_delay(acc_id_str)
                actual_delay = max(base_delay, flood_delay)
                await _interruptible_sleep(job_id_str, actual_delay)

            # Check if cancelled mid-cycle
            current_status = await _get_current_status(job_uuid)
            if current_status is None or current_status == "cancelled":
                break

            if is_looping:
                cycle_count += 1
                await _push_broadcast(job_id_str, "cycle_complete", {
                    "cycle": cycle_count,
                    "sent": sent,
                    "failed": failed,
                    "status": "running",
                })

                # Send per-cycle log summary via the broadcasting account itself
                try:
                    from app.services.broadcast_log_sender import send_cycle_summary
                    async with async_session_factory() as db_summary:
                        cycle_logs = await get_job_logs(
                            db_summary, job_id_str, {"cycle": cycle_count}, limit=9999
                        )
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
                        sender = active_accounts[(current_acc_idx - 1) % len(active_accounts)]
                        await send_cycle_summary(
                            client=sender["client"],
                            job=db_job_summary,
                            cycle_number=cycle_count,
                            group_list_name=group_list_name or "—",
                            total_groups=len(items),
                            active_this_round=len(items),
                            cycle_logs=cycle_logs,
                            accounts_by_id=accounts_by_id,
                            item_type_by_identifier=item_type_by_id,
                        )
                except Exception as log_exc:
                    logger.warning("cycle log send failed for job %s: %s", job_id_str, log_exc)

                # Delay after all groups before starting next cycle
                if delay_after_all > 0:
                    logger.info(
                        "Job %s cycle %d complete (sent=%d failed=%d), waiting %ds before next cycle",
                        job_id_str, cycle_count, sent, failed, delay_after_all,
                    )
                    end_time = time.time() + delay_after_all
                    while time.time() < end_time:
                        current_status = await _get_current_status(job_uuid)
                        if current_status is None or current_status in ("cancelled", "completed", "failed"):
                            break
                        while current_status == "paused":
                            await _interruptible_sleep(job_id_str, 86400) # Sleep indefinitely until woken
                            current_status = await _get_current_status(job_uuid)
                            if current_status is None or current_status in ("cancelled", "completed", "failed"):
                                break

                        if current_status in ("cancelled", "completed", "failed"):
                            break

                        remaining = max(0, end_time - time.time())
                        if remaining > 0:
                            await _interruptible_sleep(job_id_str, remaining)

                    current_status = await _get_current_status(job_uuid)
                    if current_status in ("cancelled", "completed", "failed"):
                        break
            else:
                break

        # Mark completed (only for non-looping jobs)
        current_status = await _get_current_status(job_uuid)
        if current_status == "running" and not loop_enabled:
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
                    
                    await _push_broadcast(job_id_str, "completed", {
                        "total": len(items),
                        "sent": sent,
                        "failed": failed,
                    })

                    # Send final cycle summary via the broadcasting account
                    try:
                        from app.services.broadcast_log_sender import send_cycle_summary
                        final_cycle = (cycle_count or 0) + 1
                        cycle_logs = await get_job_logs(
                            db_complete, job_id_str, {"cycle": final_cycle}, limit=9999
                        )
                        accounts_by_id = {
                            a["account_id"]: await _account_for_log(a["account_id"], db_complete)
                            for a in active_accounts
                        }
                        item_type_by_id = {
                            i.get("value", ""): i.get("type", "username") for i in items
                        }
                        if active_accounts:
                            sender = active_accounts[
                                (current_acc_idx - 1) % len(active_accounts)
                            ]
                            await send_cycle_summary(
                                client=sender["client"],
                                job=db_job_complete,
                                cycle_number=final_cycle,
                                group_list_name=group_list_name or "—",
                                total_groups=len(items),
                                active_this_round=len(items),
                                cycle_logs=cycle_logs,
                                accounts_by_id=accounts_by_id,
                                item_type_by_identifier=item_type_by_id,
                            )
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
                await _push_broadcast(job_id_str, "error", {
                    "status": "failed",
                    "message": str(exc),
                })
        except Exception:
            pass


async def resume_running_broadcasts_on_startup(db: AsyncSession) -> int:
    """Find all broadcast jobs with status 'running' and resume them in the background."""
    result = await db.execute(
        select(BroadcastJob).where(BroadcastJob.status == "running")
    )
    jobs = result.scalars().all()
    count = 0
    for job in jobs:
        job_id_str = str(job.id)
        if job_id_str in _running_tasks:
            continue

        async def _safe_execute(jid=job_id_str):
            try:
                await execute_broadcast(jid)
            except Exception as exc:
                logger.exception("Resumed background broadcast task %s crashed: %s", jid, exc)
            finally:
                _running_tasks.pop(jid, None)

        task = asyncio.create_task(_safe_execute())
        _running_tasks[job_id_str] = task
        count += 1
    logger.info("Resumed %d running broadcast jobs on startup", count)
    return count

