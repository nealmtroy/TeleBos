"""Broadcast worker — runs broadcast jobs as background asyncio tasks."""

import asyncio
import logging
import random
from datetime import datetime, timezone

import telethon
from telethon.tl import types
from telethon.tl.functions.messages import CheckChatInviteRequest, ImportChatInviteRequest
from telethon.errors.rpcerrorlist import (
    UserBannedInChannelError,
    ChatWriteForbiddenError,
    ChannelPrivateError,
    UsernameNotOccupiedError,
    InviteHashInvalidError,
    FloodWaitError,
    SlowModeWaitError,
)

from app.database import async_session_factory
from app.utils.redis import redis_client
from app.utils.telethon_pool import telethon_pool
from app.models.broadcast_job import BroadcastJob
from app.models.broadcast_log import BroadcastLog
from app.models.group_list import GroupList
from app.models.text_list import TextList

logger = logging.getLogger(__name__)


class BroadcastWorkerManager:
    """Manages running broadcast jobs: start, pause, resume, stop."""

    def __init__(self):
        self._tasks: dict[str, asyncio.Task] = {}
        self._pause_events: dict[str, asyncio.Event] = {}
        self._stop_events: dict[str, asyncio.Event] = {}

    async def start(self, job_id: str) -> None:
        """Start or resume a broadcast job in a background task."""
        if job_id in self._tasks and not self._tasks[job_id].done():
            logger.warning("Job %s already running", job_id[:8])
            return
        self._stop_events[job_id] = asyncio.Event()
        self._pause_events[job_id] = asyncio.Event()
        self._pause_events[job_id].set()  # not paused initially
        task = asyncio.create_task(
            self._run_job(job_id, self._stop_events[job_id], self._pause_events[job_id])
        )
        self._tasks[job_id] = task

    async def pause(self, job_id: str) -> bool:
        event = self._pause_events.get(job_id)
        if event is None or event.is_set():
            return False
        event.clear()
        await self._update_job_status(job_id, "paused")
        return True

    async def resume(self, job_id: str) -> bool:
        event = self._pause_events.get(job_id)
        if event is None or event.is_set():
            return False
        event.set()
        await self._update_job_status(job_id, "running")
        return True

    async def stop(self, job_id: str) -> bool:
        event = self._stop_events.get(job_id)
        if event is None or event.is_set():
            return False
        event.set()
        return True

    async def _update_job_status(self, job_id: str, status: str):
        async with async_session_factory() as session:
            result = await session.get(BroadcastJob, job_id)
            if result:
                result.status = status
                if status in ("completed", "stopped", "failed"):
                    result.completed_at = datetime.now(timezone.utc)
                await session.commit()

    async def _run_job(self, job_id: str, stop: asyncio.Event, pause: asyncio.Event):
        """Main broadcast loop — process each group sequentially."""
        async with async_session_factory() as db:
            job = await db.get(BroadcastJob, job_id)
            if not job:
                return

            job.status = "running"
            job.started_at = datetime.now(timezone.utc)

            # Load group list
            glist = await db.get(GroupList, job.group_list_id)
            if not glist or not glist.items:
                job.status = "failed"
                await db.commit()
                return

            # Load text list
            texts = []
            if job.mode == "multi_random" and job.text_list_id:
                tlist = await db.get(TextList, job.text_list_id)
                if tlist:
                    texts = list(tlist.texts)  # copy to avoid mutation
            single_text = job.single_text

            groups = list(glist.items)
            job.progress_total = len(groups)

            # Get Telethon client
            try:
                ta = await db.get(TelegramAccount, job.account_id)
                if not ta or not ta.session_string:
                    job.status = "failed"
                    await db.commit()
                    return
                client = await telethon_pool.get_or_create(
                    account_id=ta.id,
                    session_string=ta.session_string,
                    phone=ta.phone,
                )
            except Exception as e:
                job.status = "failed"
                await db.commit()
                logger.error("Failed to get client for job %s: %s", job_id[:8], e)
                return

            # We need TelegramAccount but only imported broadcast models above
            from app.models.telegram_account import TelegramAccount

            await db.commit()

        # Process each group
        for idx, group_item in enumerate(groups):
            if stop.is_set():
                await self._update_job_status(job_id, "stopped")
                await self._publish_progress(job_id, "stopped", idx, len(groups))
                return

            # Wait if paused
            await pause.wait()

            group_identifier = group_item.get("username") or group_item.get("link") or str(group_item.get("group_id", ""))
            group_name = group_item.get("name", "")

            # Pick text
            if job.mode == "multi_random" and texts:
                msg = random.choice(texts)
            elif single_text:
                msg = single_text
            else:
                msg = ""

            # Progress publish
            await self._publish_progress(job_id, "running", idx, len(groups), group_identifier)

            # Send
            log_entry = await self._send_to_group(
                db=async_session_factory,
                client=client,
                job_id=job_id,
                group_identifier=group_identifier,
                group_name=group_name,
                text=msg,
            )

            # Update progress
            async with async_session_factory() as db:
                job_db = await db.get(BroadcastJob, job_id)
                if job_db:
                    job_db.current_group_index = idx + 1
                    job_db.progress_done = idx + 1
                    await db.commit()

            # Delay between groups (check for stop/pause during delay)
            delay = job.delay_between_groups
            for _ in range(delay):
                if stop.is_set() or not pause.is_set():
                    break
                await asyncio.sleep(1)

        # Completed
        await self._update_job_status(job_id, "completed")
        await self._publish_progress(job_id, "completed", len(groups), len(groups))

    async def _send_to_group(self, db_factory, client, job_id, group_identifier, group_name, text) -> BroadcastLog:
        """Send a text to one group and return the log entry."""
        status = "success"
        error_msg = None
        error_code = None

        try:
            # Resolve entity by username, link, or ID
            is_tme_link = group_identifier.startswith("https://t.me/") or group_identifier.startswith("http://t.me/") or group_identifier.startswith("t.me/")
            if is_tme_link:
                # Check if it's public or invite hash
                if "+" not in group_identifier and "joinchat" not in group_identifier:
                    # Public username link
                    username = group_identifier.rstrip("/").split("/")[-1]
                    try:
                        entity = await client.get_entity(username)
                    except Exception:
                        entity = None
                else:
                    # Invite link
                    clean_url = group_identifier.rstrip("/")
                    invite_hash = clean_url.split("/")[-1] if "/" in clean_url else clean_url
                    invite_hash = invite_hash.lstrip("+")
                    
                    try:
                        invite_info = await client(CheckChatInviteRequest(hash=invite_hash))
                        if isinstance(invite_info, types.ChatInviteAlready):
                            entity = invite_info.chat
                        else:
                            updates = await client(ImportChatInviteRequest(hash=invite_hash))
                            entity = updates.chats[0] if (updates and hasattr(updates, "chats") and updates.chats) else None
                            await asyncio.sleep(2)
                    except telethon.errors.UserAlreadyParticipantError:
                        try:
                            entity = await client.get_entity(invite_hash)
                        except Exception:
                            entity = None
                    except Exception:
                        # Fallback try join or get_entity
                        try:
                            updates = await client(ImportChatInviteRequest(hash=invite_hash))
                            entity = updates.chats[0] if (updates and hasattr(updates, "chats") and updates.chats) else None
                            await asyncio.sleep(2)
                        except Exception:
                            try:
                                entity = await client.get_entity(invite_hash)
                            except Exception:
                                entity = None
            elif group_identifier.startswith("-") and group_identifier.lstrip("-").isdigit():
                entity = await client.get_entity(int(group_identifier))
            else:
                entity = await client.get_entity(group_identifier)

            if entity:
                await client.send_message(entity, text)
            else:
                status = "not_found"

        except FloodWaitError as e:
            status = "flood_error"
            error_msg = f"Flood wait: {e.seconds}s"
            error_code = e.code
        except SlowModeWaitError as e:
            status = "slowmode"
            error_msg = f"Slow mode: {e.seconds}s"
            error_code = e.code
        except UserBannedInChannelError as e:
            status = "banned"
            error_msg = str(e)
            error_code = e.code
        except ChatWriteForbiddenError as e:
            status = "admin_only"
            error_msg = str(e)
            error_code = e.code
        except ChannelPrivateError as e:
            status = "not_admin"
            error_msg = str(e)
            error_code = e.code
        except UsernameNotOccupiedError as e:
            status = "not_found"
            error_msg = "Username not found"
            error_code = e.code
        except InviteHashInvalidError as e:
            status = "not_found"
            error_msg = "Invalid invite link"
            error_code = e.code
        except Exception as e:
            status = "other_error"
            error_msg = str(e)

        # Save log
        async with db_factory() as db:
            log_entry = BroadcastLog(
                job_id=job_id,
                group_identifier=group_identifier,
                group_name=group_name,
                sent_text=text,
                status=status,
                error_message=error_msg,
                telegram_error_code=error_code,
            )
            db.add(log_entry)
            await db.commit()
            log_id = log_entry.id
            return log_entry

    async def _publish_progress(self, job_id: str, status: str, done: int, total: int, current_group: str = ""):
        """Publish progress to Redis channel for WebSocket broadcast."""
        try:
            await redis_client.publish(
                f"broadcast_progress:{job_id}",
                {
                    "type": "progress",
                    "status": status,
                    "done": done,
                    "total": total,
                    "current_group": current_group,
                },
            )
        except Exception:
            logger.exception("Failed to publish progress for job %s", job_id[:8])


# Singleton
broadcast_manager = BroadcastWorkerManager()
