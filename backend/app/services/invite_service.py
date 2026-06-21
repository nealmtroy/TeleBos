"""Invite management business logic — scrape members from source groups, invite to destination."""

import asyncio
import logging
import time
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.invite_job import InviteJob
from app.models.invite_log import InviteLog
from app.models.telegram_account import TelegramAccount
from app.models.user import User
from app.utils.encryption import decrypt
from app.utils.flood_control import flood_controller
from app.utils.telegram_errors import classify_telegram_error

logger = logging.getLogger(__name__)

# In-process task tracker for background invite jobs
_running_invite_tasks: dict[str, asyncio.Task] = {}


# ── Invite Jobs ──────────────────────────────────────────────────────────────


async def start_invite(
    db: AsyncSession,
    user: User,
    account_ids: list[str],
    destination_group: str,
    destination_type: str,
    source_groups: list[dict],
    delay_per_invite: int,
    delay_per_batch: int,
    batch_size: int,
) -> InviteJob:
    """Create a new invite job and queue it."""
    from app.services.account_service import get_account

    if not account_ids:
        raise ValueError("At least one account is required")

    valid_account_ids = []
    for acc_id in account_ids:
        account = await get_account(db, acc_id, str(user.id))
        if account is None:
            raise ValueError(f"Account {acc_id} not found")
        valid_account_ids.append(str(account.id))

    if not source_groups:
        raise ValueError("At least one source group is required")

    job = InviteJob(
        account_ids=valid_account_ids,
        user_id=user.id,
        destination_group=destination_group,
        destination_type=destination_type,
        source_groups=source_groups,
        status="running",
        delay_per_invite=delay_per_invite,
        delay_per_batch=delay_per_batch,
        batch_size=batch_size,
    )
    db.add(job)
    await db.flush()
    await db.commit()
    await db.refresh(job)

    # Run invite in background asyncio task
    job_id_str = str(job.id)

    async def _safe_execute():
        try:
            await execute_invite(job_id_str)
        except Exception as exc:
            logger.exception("Background invite task %s crashed: %s", job_id_str, exc)
        finally:
            _running_invite_tasks.pop(job_id_str, None)

    task = asyncio.create_task(_safe_execute())
    _running_invite_tasks[job_id_str] = task

    return job


async def get_invite_job(db: AsyncSession, job_id: str, user_id: str) -> InviteJob | None:
    result = await db.execute(
        select(InviteJob).where(InviteJob.id == job_id, InviteJob.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def get_invite_jobs(
    db: AsyncSession, user_id: str, limit: int = 20
) -> list[InviteJob]:
    result = await db.execute(
        select(InviteJob)
        .where(InviteJob.user_id == user_id)
        .order_by(InviteJob.created_at.desc())
        .limit(limit)
    )
    return list(result.scalars().all())


async def update_invite_job_status(db: AsyncSession, job: InviteJob, status: str) -> None:
    job.status = status
    if status in ("completed", "cancelled", "failed"):
        job.completed_at = datetime.now(timezone.utc)
    await db.flush()


async def delete_invite_job(db: AsyncSession, job_id: str, user_id: str) -> None:
    result = await db.execute(
        select(InviteJob).where(InviteJob.id == job_id, InviteJob.user_id == user_id)
    )
    job = result.scalar_one_or_none()
    if job is None:
        raise ValueError("Invite job not found")
    if job.status in ("running", "paused"):
        raise ValueError("Cannot delete an active job — stop it first")
    await db.delete(job)
    await db.flush()


async def retry_invite_job(db: AsyncSession, job_id: str, user_id: str) -> InviteJob:
    result = await db.execute(
        select(InviteJob).where(InviteJob.id == job_id, InviteJob.user_id == user_id)
    )
    job = result.scalar_one_or_none()
    if job is None:
        raise ValueError("Invite job not found")
    if job.status not in ("completed", "cancelled", "failed"):
        raise ValueError(f"Cannot retry a job with status '{job.status}'")

    # Reset job state
    job.status = "running"
    job.progress = 0
    job.invited_count = 0
    job.already_member_count = 0
    job.fail_count = 0
    job.skip_count = 0
    job.total_members = 0
    job.completed_at = None
    await db.flush()
    await db.commit()
    await db.refresh(job)

    job_id_str = str(job.id)

    async def _safe_execute():
        try:
            await execute_invite(job_id_str)
        except Exception as exc:
            logger.exception("Background invite task %s crashed: %s", job_id_str, exc)
        finally:
            _running_invite_tasks.pop(job_id_str, None)

    task = asyncio.create_task(_safe_execute())
    _running_invite_tasks[job_id_str] = task

    return job


async def get_invite_logs(
    db: AsyncSession,
    job_id: str,
    filters: dict | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[InviteLog]:
    query = select(InviteLog).where(InviteLog.job_id == job_id)

    if filters:
        if filters.get("status"):
            query = query.where(InviteLog.status == filters["status"])
        if filters.get("error_type"):
            query = query.where(InviteLog.error_type == filters["error_type"])
        if filters.get("search"):
            search_val = filters["search"].replace("%", "\\%").replace("_", "\\_")
            search = f"%{search_val}%"
            query = query.where(
                InviteLog.username.ilike(search, escape="\\")
                | InviteLog.first_name.ilike(search, escape="\\")
                | InviteLog.source_group.ilike(search, escape="\\")
            )


    query = query.order_by(InviteLog.invited_at.asc()).offset(offset).limit(limit)
    result = await db.execute(query)
    return list(result.scalars().all())


# ── Invite Execution (runs as asyncio.Task in-process) ─────────────────────


async def _push_invite(job_id: str, event_type: str, data: dict) -> None:
    """Push a real-time event to WebSocket clients subscribed to this invite job."""
    try:
        from app.api.ws import manager
        await manager.broadcast(
            f"invite:{job_id}",
            {"type": event_type, **data},
        )
    except Exception as push_exc:
        logger.warning("WS push failed for invite job %s: %s", job_id, push_exc)


async def _resolve_group(client, item_type: str, group_identifier: str, telethon_mod):
    """Resolve a group entity from identifier.

    Strategy:
    1. Try get_entity() first — works if the account is ALREADY a member.
    2. If not a member, try the invite link flow (join via ImportChatInviteRequest).
    3. If all fail, return error.

    Returns (entity, error_tuple_or_None).
    """
    entity = None

    # ── Helper: extract a look-up key from any identifier type ────────────
    def _extract_key(identifier: str) -> str:
        """Extract a @-prefixed username or chat identifier from link/username/group_id."""
        if "/" in identifier:
            # It's a link — try to extract the last segment as name or hash
            return identifier.split("/")[-1]
        return identifier.lstrip("@")

    # ── Step 1: Try get_entity() - works if already a member ──────────────
    try:
        lookup_key = _extract_key(group_identifier)
        entity = await client.get_entity(lookup_key)
        if entity is not None:
            return entity, None
    except Exception:
        entity = None  # not a member yet, fall through to invite-join

    # ── Step 2: For links, try the invite / join flow ─────────────────────
    if item_type == "link":
        invite_hash = group_identifier.split("/")[-1] if "/" in group_identifier else group_identifier
        if invite_hash.startswith("+"):
            invite_hash = invite_hash[1:]
        try:
            # Try to check the invite first (no side-effects)
            try:
                invite_info = await client(
                    telethon_mod.tl.functions.messages.CheckChatInviteRequest(hash=invite_hash)
                )
                # If chat is already accessible from the check, use it
                if hasattr(invite_info, "chat"):
                    entity = invite_info.chat
                else:
                    # Need to actually join to get the entity
                    join_result = await client(
                        telethon_mod.tl.functions.messages.ImportChatInviteRequest(hash=invite_hash)
                    )
                    if hasattr(join_result, "chats") and join_result.chats:
                        entity = join_result.chats[0]
            except Exception:
                # Check failed (probably expired/invalid) — try joining directly
                try:
                    join_result = await client(
                        telethon_mod.tl.functions.messages.ImportChatInviteRequest(hash=invite_hash)
                    )
                    if hasattr(join_result, "chats") and join_result.chats:
                        entity = join_result.chats[0]
                except Exception as join_exc:
                    return None, classify_telegram_error(join_exc)
        except Exception as exc:
            return None, classify_telegram_error(exc)

    # ── Step 3: For username/group_id, fallback to get_entity variants ────
    elif item_type == "username":
        # get_entity already failed in step 1 — user isn't a member
        try:
            identifier = group_identifier.lstrip("@")
            entity = await client.get_entity(identifier)
            if entity:
                return entity, None
        except Exception as exc:
            return None, classify_telegram_error(exc)

    elif item_type == "group_id":
        try:
            numeric_id = int(group_identifier)
            entity = await client.get_entity(numeric_id)
            if entity:
                return entity, None
        except Exception as exc:
            return None, classify_telegram_error(exc)

    return entity, None


async def _scrape_participants(client, entity, telethon_mod, limit_per_group: int = 10000):
    """Scrape participants from a group entity. Returns list of user objects."""
    participants = []
    offset = 0
    batch_size = 200

    try:
        while offset < limit_per_group:
            try:
                result = await client(
                    telethon_mod.tl.functions.channels.GetParticipantsRequest(
                        channel=entity,
                        filter=telethon_mod.tl.types.ChannelParticipantsSearch(""),
                        offset=offset,
                        limit=batch_size,
                        hash=0,
                    )
                )
            except Exception as exc:
                # For non-channel groups, try a different approach
                err_type, _ = classify_telegram_error(exc)
                if err_type in ("admin_only", "private_channel"):
                    logger.warning(
                        "Cannot scrape participants (admin_only/private): %s", exc
                    )
                    break
                # Try get_participants for supergroups
                try:
                    result = await client(
                        telethon_mod.tl.functions.channels.GetParticipantsRequest(
                            channel=entity,
                            filter=telethon_mod.tl.types.ChannelParticipantsRecent(),
                            offset=offset,
                            limit=batch_size,
                            hash=0,
                        )
                    )
                except Exception:
                    logger.warning("Failed to scrape participants: %s", exc)
                    break

            if not result.users:
                break

            for user in result.users:
                # Skip bots, deleted accounts, and self
                if getattr(user, "bot", False):
                    continue
                if getattr(user, "deleted", False):
                    continue
                participants.append(user)

            if len(result.users) < batch_size:
                break
            offset += batch_size

            # Small delay between pagination requests
            await asyncio.sleep(0.5)

    except Exception as exc:
        logger.warning("Participant scraping error: %s", exc)

    return participants


async def execute_invite(job_id: str):
    """Execute an invite job. Runs as an asyncio.Task in the FastAPI process."""
    from app.database import async_session_factory
    import uuid as _uuid
    import time

    try:
        job_uuid = _uuid.UUID(job_id) if isinstance(job_id, str) else job_id
    except ValueError:
        job_uuid = job_id

    active_accounts = []
    async with async_session_factory() as db:
        try:
            result = await db.execute(
                select(InviteJob).where(InviteJob.id == job_uuid)
            )
            job = result.scalar_one_or_none()
            if job is None:
                return
            if job.status in ("cancelled", "completed"):
                return

            job.status = "running"
            await db.commit()
            await _push_invite(job_id, "status", {"status": "running"})

            # Load active accounts
            from telethon import TelegramClient
            from telethon.sessions import StringSession
            import telethon
            from app.config import get_settings
            from app.utils.flood_control import flood_controller as fc

            settings = get_settings()
            active_accounts = []

            for acc_id_str in job.account_ids:
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
                    if not settings.TELEGRAM_API_ID or not settings.TELEGRAM_API_HASH:
                        logger.warning("Telegram API ID or Hash is unconfigured. Skipping account %s", acc_id_str)
                        continue
                    session_str = decrypt(account.session_string)
                    from app.utils.device_spoof import random_ios_device
                    ios_params = random_ios_device()
                    client = TelegramClient(
                        StringSession(session_str),
                        api_id=settings.TELEGRAM_API_ID,
                        api_hash=settings.TELEGRAM_API_HASH,
                        device_model=ios_params["device_model"],
                        app_version=ios_params["app_version"],
                        system_version=ios_params["system_version"],
                        lang_code=ios_params["lang_code"],
                        system_lang_code=ios_params["system_lang_code"],
                    )
                    await client.connect()
                    if not await client.is_user_authorized():
                        logger.warning("Account %s not authorized, skipping", acc_id_str)
                        await client.disconnect()
                        continue

                    me = await client.get_me()
                    my_id = me.id if me else None
                    active_accounts.append({
                        "account_id": acc_id_str,
                        "account_name": f"{account.first_name or ''} ({account.phone or ''})",
                        "client": client,
                        "me": me,
                        "my_id": my_id,
                        "consecutive_peer_floods": 0,
                        "cooldown_until": 0.0
                    })
                except Exception as connect_exc:
                    logger.exception("Failed to connect account %s: %s", acc_id_str, connect_exc)

            if not active_accounts:
                job.status = "failed"
                await db.commit()
                await _push_invite(job_id, "error", {
                    "status": "failed",
                    "message": "No authorized Telegram accounts could be connected",
                })
                return

            # ── Step 1: Resolve destination group ─────────────────────────
            dest_entity = None
            dest_err = None
            for acc in active_accounts:
                dest_entity, dest_err = await _resolve_group(
                    acc["client"], job.destination_type, job.destination_group, telethon
                )
                if dest_entity is not None:
                    break

            if dest_entity is None:
                err_msg = dest_err[1] if dest_err else f"Could not resolve destination: {job.destination_group}"
                job.status = "failed"
                await db.commit()
                for acc in active_accounts:
                    await acc["client"].disconnect()
                await _push_invite(job_id, "error", {
                    "status": "failed",
                    "message": err_msg,
                })
                return

            # Detect entity type — channel vs supergroup vs legacy group
            from telethon.tl.types import Channel as TelethonChannel
            from telethon.tl.types import Chat as LegacyChat
            dest_is_channel = isinstance(dest_entity, TelethonChannel) and getattr(dest_entity, "broadcast", False)
            dest_is_megagroup = isinstance(dest_entity, TelethonChannel) and getattr(dest_entity, "megagroup", False)
            dest_is_legacy = isinstance(dest_entity, LegacyChat)
            logger.info(
                "Destination resolved: id=%s title=%s is_channel=%s is_megagroup=%s is_legacy_group=%s",
                dest_entity.id, getattr(dest_entity, "title", "?"),
                dest_is_channel, dest_is_megagroup, dest_is_legacy,
            )
            if dest_is_channel:
                await _push_invite(job_id, "phase", {
                    "phase": "destination_check",
                    "message": "Destination is a broadcast channel. Note: only Telegram accounts with admin rights can add members to channels.",
                })
            elif dest_is_legacy:
                await _push_invite(job_id, "phase", {
                    "phase": "destination_check",
                    "message": "Destination is a legacy group (basic group, not supergroup/channel).",
                })

            # ── Auto-join destination group if not already a member ──────────
            await _push_invite(job_id, "phase", {
                "phase": "joining_destination",
                "message": "Ensuring accounts have joined the destination group...",
            })
            for acc in active_accounts:
                try:
                    await acc["client"].get_entity(dest_entity.id)
                except Exception:
                    # Not a member — try to join
                    try:
                        if job.destination_type == "link":
                            invite_hash = job.destination_group.split("/")[-1]
                            if invite_hash.startswith("+"):
                                invite_hash = invite_hash[1:]
                            await acc["client"](
                                telethon.tl.functions.messages.ImportChatInviteRequest(hash=invite_hash)
                            )
                        else:
                            lookup_key = job.destination_group.lstrip("@")
                            await acc["client"](
                                telethon.tl.functions.channels.JoinChannelRequest(lookup_key)
                            )
                        logger.info("Account %s auto-joined destination %s", acc["account_name"], job.destination_group)
                    except Exception as join_exc:
                        logger.warning(
                            "Account %s could not auto-join destination %s: %s",
                            acc["account_name"], job.destination_group, join_exc,
                        )

            # Scrape existing participants from destination group to avoid duplicate invites
            dest_member_ids = set()
            for acc in active_accounts:
                try:
                    dest_participants = await _scrape_participants(acc["client"], dest_entity, telethon)
                    if dest_participants:
                        dest_member_ids = {u.id for u in dest_participants}
                        logger.info("Scraped %d existing members from destination group", len(dest_member_ids))
                        break
                except Exception as scrape_dest_exc:
                    logger.warning("Failed to scrape destination group using account %s: %s", acc["account_id"], scrape_dest_exc)

            await _push_invite(job_id, "phase", {
                "phase": "scraping",
                "message": "Scraping members from source groups...",
            })

            # ── Step 2: Scrape participants from all source groups ────────
            all_members = {}  # user_id -> (user_obj, source_group_identifier)
            source_groups = job.source_groups

            for sg_idx, sg in enumerate(source_groups):
                await db.refresh(job)
                if job.status == "cancelled":
                    break

                sg_type = sg.get("type", "username")
                sg_value = sg.get("value", "")

                await _push_invite(job_id, "scrape_progress", {
                    "current_source": sg_idx + 1,
                    "total_sources": len(source_groups),
                    "source": sg_value,
                    "message": f"Scraping {sg_value} ({sg_idx + 1}/{len(source_groups)})...",
                })

                scraped_ok = False
                for acc in active_accounts:
                    src_entity, src_err = await _resolve_group(
                        acc["client"], sg_type, sg_value, telethon
                    )
                    if src_err is not None or src_entity is None:
                        logger.warning(
                            "Account %s could not resolve source group %s: %s",
                            acc["account_id"],
                            sg_value,
                            src_err[1] if src_err else "unknown",
                        )
                        continue

                    participants = await _scrape_participants(acc["client"], src_entity, telethon)
                    if participants:
                        my_ids = {a["my_id"] for a in active_accounts if a["my_id"]}
                        for user in participants:
                            uid = user.id
                            if uid in my_ids:
                                continue
                            if uid not in all_members:
                                all_members[uid] = (user, sg_value)

                        logger.info(
                            "Scraped %d members from %s using account %s (total unique so far: %d)",
                            len(participants),
                            sg_value,
                            acc["account_name"],
                            len(all_members),
                        )
                        scraped_ok = True
                        break

                if not scraped_ok:
                    logger.warning("Failed to scrape source group %s with any account", sg_value)
                    await _push_invite(job_id, "scrape_error", {
                        "source": sg_value,
                        "error": "Could not scrape group with any account",
                    })

                # Small delay between source group scrapes
                await asyncio.sleep(1)

            # Check if cancelled during scraping
            await db.refresh(job)
            if job.status == "cancelled":
                for acc in active_accounts:
                    await acc["client"].disconnect()
                return

            if not all_members:
                job.status = "completed"
                job.total_members = 0
                job.progress = 100
                job.completed_at = datetime.now(timezone.utc)
                await db.commit()
                for acc in active_accounts:
                    await acc["client"].disconnect()
                await _push_invite(job_id, "completed", {
                    "total": 0,
                    "invited": 0,
                    "message": "No members found to invite",
                })
                return

            # Update total members count
            members_list = list(all_members.values())
            job.total_members = len(members_list)
            await db.commit()

            await _push_invite(job_id, "phase", {
                "phase": "inviting",
                "total_members": len(members_list),
                "message": f"Found {len(members_list)} unique members. Starting invite...",
            })

            # ── Step 3: Invite members one by one ────────────────────────
            invited = 0
            already = 0
            failed = 0
            skipped = 0
            total = len(members_list)
            max_peer_floods = 3  # Stop using an account after 3 consecutive PeerFlood errors
            current_acc_idx = 0

            for idx, (user_obj, source_group) in enumerate(members_list):
                # Find the next ready account
                while True:
                    await db.refresh(job)
                    if job.status == "cancelled":
                        break
                    while job.status == "paused":
                        await asyncio.sleep(1)
                        await db.refresh(job)
                        if job.status == "cancelled":
                            break
                    if job.status == "cancelled":
                        break

                    # If no active accounts left, we fail the job
                    if not active_accounts:
                        break

                    # Check if any account is ready (cooldown passed)
                    now_ts = time.time()
                    ready_accs = [a for a in active_accounts if now_ts >= a["cooldown_until"]]
                    if ready_accs:
                        selected_acc = None
                        for offset in range(len(active_accounts)):
                            i_idx = (current_acc_idx + offset) % len(active_accounts)
                            candidate = active_accounts[i_idx]
                            if now_ts >= candidate["cooldown_until"]:
                                selected_acc = candidate
                                current_acc_idx = (i_idx + 1) % len(active_accounts)
                                break
                        if selected_acc:
                            break

                    # If no accounts are ready, find the minimum cooldown time to wait
                    earliest_ready_time = min(a["cooldown_until"] for a in active_accounts)
                    wait_sec = max(1.0, earliest_ready_time - now_ts)

                    await _push_invite(job_id, "flood_wait", {
                        "wait_seconds": int(wait_sec),
                        "message": f"All accounts on cooldown. Waiting {int(wait_sec)}s...",
                    })

                    # Sleep in increments of 1s so we can check cancel status
                    for _ in range(int(wait_sec)):
                        await asyncio.sleep(1)
                        await db.refresh(job)
                        if job.status == "cancelled":
                            break
                    if job.status == "cancelled":
                        break

                if job.status == "cancelled":
                    break

                if not active_accounts:
                    job.status = "failed"
                    job.invited_count = invited
                    job.already_member_count = already
                    job.fail_count = failed
                    job.skip_count = skipped
                    job.progress = int(((idx + 1) / total) * 100) if total > 0 else 0
                    job.completed_at = datetime.now(timezone.utc)
                    await db.commit()
                    await _push_invite(job_id, "error", {
                        "status": "failed",
                        "message": "All Telegram accounts have been limited or failed. Job stopped.",
                    })
                    break

                # Retrieve selected account details
                client = selected_acc["client"]
                acc_id_str = selected_acc["account_id"]
                acc_name = selected_acc["account_name"]

                user_id_tg = user_obj.id
                username = getattr(user_obj, "username", None)
                first_name = getattr(user_obj, "first_name", None) or ""

                log = InviteLog(
                    job_id=job.id,
                    user_id_tg=user_id_tg,
                    username=username,
                    first_name=first_name,
                    source_group=source_group,
                    account_id_used=_uuid.UUID(acc_id_str),
                )

                if user_id_tg in dest_member_ids:
                    log.status = "already_member"
                    log.invited_at = datetime.now(timezone.utc)
                    db.add(log)
                    already += 1
                    logger.info(
                        "Invite already_member | account=%s target=%s username=%s dest=%s",
                        acc_id_str, user_id_tg, username or first_name, job.destination_group,
                    )
                    
                    job.progress = int(((idx + 1) / total) * 100) if total > 0 else 0
                    job.already_member_count = already
                    await db.commit()

                    await _push_invite(job_id, "progress", {
                        "current": idx + 1,
                        "total": total,
                        "progress": job.progress,
                        "invited": invited,
                        "already_member": already,
                        "failed": failed,
                        "skipped": skipped,
                        "status": job.status,
                    })

                    await _push_invite(job_id, "log", {
                        "user_id_tg": user_id_tg,
                        "username": username,
                        "first_name": first_name,
                        "source_group": source_group,
                        "status": log.status,
                        "error_type": log.error_type,
                        "account_id_used": acc_id_str,
                        "account_name": acc_name,
                    })
                    continue

                try:
                    # Determine entity type and use the correct invite method
                    from telethon.tl.types import Chat as LegacyChat
                    from telethon.tl.types import InputChannel
                    dest_is_legacy_group = isinstance(dest_entity, LegacyChat)

                    # Re-resolve entity with current account from the original identifier
                    try:
                        lookup_key = job.destination_group.lstrip("@")
                        if job.destination_type == "username":
                            current_entity = await client.get_entity(lookup_key)
                        elif job.destination_type == "link":
                            current_entity = await client.get_entity(lookup_key)
                        else:
                            current_entity = await client.get_entity(dest_entity.id)
                    except Exception:
                        current_entity = dest_entity

                    if dest_is_legacy_group:
                        # Legacy group (not a supergroup/channel)
                        await client(
                            telethon.tl.functions.messages.AddChatUserRequest(
                                chat_id=current_entity.id,
                                user_id=user_obj,
                                fwd_limit=50,
                            )
                        )
                    else:
                        # Channel or supergroup — use re-resolved entity
                        from telethon.tl.types import InputChannel
                        if hasattr(current_entity, "access_hash") and current_entity.access_hash:
                            input_channel = InputChannel(
                                channel_id=current_entity.id,
                                access_hash=current_entity.access_hash,
                            )
                        else:
                            input_channel = current_entity
                        await client(
                            telethon.tl.functions.channels.InviteToChannelRequest(
                                channel=input_channel,
                                users=[user_obj],
                            )
                        )
                    log.status = "success"
                    log.invited_at = datetime.now(timezone.utc)
                    db.add(log)
                    invited += 1
                    selected_acc["consecutive_peer_floods"] = 0
                    fc.record_success(acc_id_str)
                    dest_member_ids.add(user_id_tg)
                    logger.info(
                        "Invite success | account=%s account_name=%s target=%s username=%s dest=%s",
                        acc_id_str, acc_name, user_id_tg, username or first_name, job.destination_group,
                    )

                except Exception as exc:
                    err_type, err_msg = classify_telegram_error(exc)
                    log.error_type = err_type
                    log.error_message = err_msg
                    log.invited_at = datetime.now(timezone.utc)

                    if err_type == "already_member":
                        log.status = "already_member"
                        already += 1
                        selected_acc["consecutive_peer_floods"] = 0
                        dest_member_ids.add(user_id_tg)

                    elif err_type in (
                        "privacy_restricted",
                        "not_mutual_contact",
                        "too_many_channels",
                        "deactivated",
                        "user_kicked",
                        "user_id_invalid",
                    ):
                        log.status = "skipped"
                        skipped += 1
                        selected_acc["consecutive_peer_floods"] = 0

                    elif err_type == "flood":
                        log.status = "error"
                        failed += 1
                        wait = 30
                        if hasattr(exc, "seconds"):
                            wait = exc.seconds
                        fc.record_flood(acc_id_str, wait)
                        selected_acc["cooldown_until"] = time.time() + wait

                        await _push_invite(job_id, "flood_wait", {
                            "wait_seconds": wait,
                            "account": acc_name,
                            "message": f"Flood wait on {acc_name}: waiting {wait} seconds...",
                        })

                    elif err_type == "peer_flood":
                        log.status = "error"
                        failed += 1
                        selected_acc["consecutive_peer_floods"] += 1

                        backoff_time = 300  # 5 minutes
                        fc.record_flood(acc_id_str, backoff_time)
                        selected_acc["cooldown_until"] = time.time() + backoff_time

                        await _push_invite(job_id, "peer_flood", {
                            "backoff_seconds": backoff_time,
                            "consecutive": selected_acc["consecutive_peer_floods"],
                            "account": acc_name,
                            "message": f"PeerFlood on {acc_name} ({selected_acc['consecutive_peer_floods']}x). Backing off {backoff_time}s...",
                        })

                        if selected_acc["consecutive_peer_floods"] >= max_peer_floods:
                            await _push_invite(job_id, "account_failed", {
                                "account": acc_name,
                                "message": f"Account {acc_name} reached max consecutive PeerFloods. Removing from rotation.",
                            })
                            try:
                                await client.disconnect()
                            except Exception:
                                pass
                            active_accounts.remove(selected_acc)
                            if current_acc_idx >= len(active_accounts) and active_accounts:
                                current_acc_idx = 0

                    elif err_type == "banned":
                        # UserBannedInChannelError → the TARGET user is banned from
                        # this channel, not our account. Skip the user, keep the account.
                        log.status = "skipped"
                        skipped += 1
                        selected_acc["consecutive_peer_floods"] = 0

                    elif err_type == "phone_banned":
                        # PhoneNumberBannedError → our phone is banned from Telegram.
                        # This IS account-level — remove it from rotation.
                        log.status = "error"
                        failed += 1
                        await _push_invite(job_id, "account_failed", {
                            "account": acc_name,
                            "message": f"Account {acc_name} is banned from Telegram. Removing from rotation.",
                        })
                        try:
                            await client.disconnect()
                        except Exception:
                            pass
                        active_accounts.remove(selected_acc)
                        if current_acc_idx >= len(active_accounts) and active_accounts:
                            current_acc_idx = 0

                    elif err_type in ("admin_only", "admin_invite_only"):
                        log.status = "error"
                        failed += 1

                        # Remove this account from rotation and try with others
                        await _push_invite(job_id, "account_failed", {
                            "account": acc_name,
                            "message": f"Account {acc_name} cannot invite ({err_type}). Removing from rotation.",
                        })
                        try:
                            await client.disconnect()
                        except Exception:
                            pass
                        active_accounts.remove(selected_acc)
                        if current_acc_idx >= len(active_accounts) and active_accounts:
                            current_acc_idx = 0

                    elif err_type in ("invite_request_sent", "already_invited"):
                        log.status = "skipped"
                        skipped += 1
                        selected_acc["consecutive_peer_floods"] = 0

                    else:
                        log.status = "error"
                        failed += 1
                        selected_acc["consecutive_peer_floods"] = 0
                        logger.warning(
                            "Unknown invite error | account=%s user=%s type=%s msg=%s",
                            acc_id_str, user_id_tg, err_type, err_msg,
                        )

                        if "authorized" in err_msg.lower() or "session" in err_msg.lower():
                            await _push_invite(job_id, "account_failed", {
                                "account": acc_name,
                                "message": f"Account {acc_name} session is invalid/unauthorized. Removing.",
                            })
                            try:
                                await client.disconnect()
                            except Exception:
                                pass
                            active_accounts.remove(selected_acc)
                            if current_acc_idx >= len(active_accounts) and active_accounts:
                                current_acc_idx = 0

                    db.add(log)

                # Check if this was the last account before progressing
                if not active_accounts:
                    job.status = "failed"
                    job.invited_count = invited
                    job.already_member_count = already
                    job.fail_count = failed
                    job.skip_count = skipped
                    job.progress = int(((idx + 1) / total) * 100) if total > 0 else 0
                    job.completed_at = datetime.now(timezone.utc)
                    await db.commit()
                    await _push_invite(job_id, "error", {
                        "status": "failed",
                        "message": "All Telegram accounts have been limited or failed. Job stopped.",
                    })
                    break

                # Update progress + push to WS
                job.progress = int(((idx + 1) / total) * 100) if total > 0 else 0
                job.invited_count = invited
                job.already_member_count = already
                job.fail_count = failed
                job.skip_count = skipped
                await db.commit()

                await _push_invite(job_id, "progress", {
                    "current": idx + 1,
                    "total": total,
                    "progress": job.progress,
                    "invited": invited,
                    "already_member": already,
                    "failed": failed,
                    "skipped": skipped,
                    "status": job.status,
                })

                await _push_invite(job_id, "log", {
                    "user_id_tg": user_id_tg,
                    "username": username,
                    "first_name": first_name,
                    "source_group": source_group,
                    "status": log.status,
                    "error_type": log.error_type,
                    "account_id_used": acc_id_str,
                    "account_name": acc_name,
                })

                # Delay between invites — only apply flood delay for the account
                # that actually sent. Other accounts are not penalized.
                flood_delay = fc.get_delay(acc_id_str) if selected_acc["cooldown_until"] <= time.time() else 0
                actual_delay = max(job.delay_per_invite, flood_delay)

                if (idx + 1) % job.batch_size == 0 and job.delay_per_batch > 0:
                    actual_delay = max(actual_delay, job.delay_per_batch)
                    await _push_invite(job_id, "batch_delay", {
                        "batch_number": (idx + 1) // job.batch_size,
                        "delay": actual_delay,
                        "message": f"Batch delay: waiting {actual_delay}s...",
                    })

                await asyncio.sleep(actual_delay)

            # Mark completed
            await db.refresh(job)
            if job.status == "running":
                job.status = "completed"
                job.progress = 100
                job.invited_count = invited
                job.already_member_count = already
                job.fail_count = failed
                job.skip_count = skipped
                job.completed_at = datetime.now(timezone.utc)
                await db.commit()
                await _push_invite(job_id, "completed", {
                    "total": total,
                    "invited": invited,
                    "already_member": already,
                    "failed": failed,
                    "skipped": skipped,
                })

        except Exception as exc:
            logger.exception("Invite job %s failed: %s", job_id, exc)
            try:
                await db.rollback()
                result = await db.execute(
                    select(InviteJob).where(InviteJob.id == job_uuid)
                )
                job = result.scalar_one_or_none()
                if job:
                    job.status = "failed"
                    await db.commit()
                    await _push_invite(job_id, "error", {
                        "status": "failed",
                        "message": str(exc),
                    })
            except Exception:
                pass
        finally:
            for acc in active_accounts:
                try:
                    await acc["client"].disconnect()
                except Exception:
                    pass
