"""Telethon integration helpers — reusable client retrieval and chat/group joining/resolution."""

import asyncio
import logging
from typing import Any

from telethon import TelegramClient
from telethon.tl.functions.channels import JoinChannelRequest, GetFullChannelRequest
from telethon.tl.functions.messages import ImportChatInviteRequest, CheckChatInviteRequest
from telethon.tl.types import ChatInviteAlready, Channel
from telethon.errors import UserAlreadyParticipantError, InviteRequestSentError, FloodWaitError

from app.utils.encryption import decrypt
from app.services.telegram_client import client_pool

logger = logging.getLogger(__name__)


async def get_active_client(account) -> TelegramClient:
    """Decrypt session credentials and fetch client from the connection pool.
    
    Supports both ORM object and dictionary.
    Raises RuntimeError if the client is disconnected.
    """
    if isinstance(account, dict):
        acc_id = account.get("id") or account.get("account_id")
        enc_session = account.get("session_string")
    else:
        acc_id = account.id
        enc_session = account.session_string

    session_str = decrypt(enc_session)
    client = await client_pool.get(str(acc_id), session_str)
    if client is None:
        raise RuntimeError(f"Account {acc_id} is disconnected. Please reconnect first.")
    return client


def parse_invite_hash(target: str) -> str | None:
    """Parse invite link hash from various invite link formats."""
    text = target.strip()
    if "joinchat/" in text:
        return text.split("joinchat/", 1)[1].split("?", 1)[0].strip("/")
    if "t.me/+" in text:
        return text.split("t.me/+", 1)[1].split("?", 1)[0].strip("/")
    if text.startswith("+"):
        return text[1:].split("?", 1)[0].strip("/")
    return None


def parse_public_target(target: str) -> str:
    """Parse username/ID from public t.me or raw links."""
    text = target.strip()
    for prefix in ("https://t.me/", "http://t.me/", "t.me/"):
        if text.startswith(prefix):
            text = text[len(prefix) :]
            break
    return text.lstrip("@").split("?", 1)[0].strip("/")


async def join_and_resolve_chat(client: TelegramClient, target: str, job_id_str: str | None = None) -> Any:
    """Resolve and join a chat target (invite link, username, or ID).
    
    Features support for discussion group resolution and admin permission check.
    Raises standard Telethon exceptions or ValueError on failure.
    """
    invite = parse_invite_hash(target)
    entity = None

    if invite:
        # Check invite link status before joining
        invite_info = await client(CheckChatInviteRequest(invite))
        if isinstance(invite_info, ChatInviteAlready):
            entity = invite_info.chat
        else:
            for attempt in range(2):
                try:
                    updates = await client(ImportChatInviteRequest(invite))
                    if getattr(updates, "chats", None):
                        entity = updates.chats[0]
                    break
                except UserAlreadyParticipantError:
                    # Fallback 1: try resolving target link directly
                    try:
                        entity = await client.get_entity(target)
                    except Exception:
                        pass

                    if not entity:
                        # Fallback 2: search dialogue list by name matching the invite title
                        expected_title = getattr(invite_info, "title", None)
                        if expected_title:
                            async for dialog in client.iter_dialogs():
                                if dialog.name == expected_title:
                                    entity = dialog.entity
                                    break
                    if not entity:
                        raise ValueError(
                            f"Already a participant but could not resolve private chat with link or title '{expected_title}'"
                        )
                    break
                except FloodWaitError as e:
                    if e.seconds <= 30:
                        logger.warning(
                            "Flood wait error joining private group! Waiting %s seconds...",
                            e.seconds,
                        )
                        if job_id_str:
                            from app.services.broadcast_service import _interruptible_sleep
                            completed = await _interruptible_sleep(job_id_str, e.seconds)
                            if not completed:
                                raise
                        else:
                            await asyncio.sleep(e.seconds)
                        if attempt == 0:
                            continue
                    raise
    else:
        public = parse_public_target(target)
        if public.lstrip("-").isdigit():
            entity = await client.get_entity(int(public))
        else:
            entity = await client.get_entity(public)

        for attempt in range(2):
            try:
                await client(JoinChannelRequest(entity))
                break
            except UserAlreadyParticipantError:
                break
            except InviteRequestSentError:
                raise
            except FloodWaitError as e:
                if e.seconds <= 30:
                    logger.warning(
                        "Flood wait error joining public group! Waiting %s seconds...", e.seconds
                    )
                    if job_id_str:
                        from app.services.broadcast_service import _interruptible_sleep
                        completed = await _interruptible_sleep(job_id_str, e.seconds)
                        if not completed:
                            raise
                    else:
                        await asyncio.sleep(e.seconds)
                    if attempt == 0:
                        continue
                raise
            except Exception:
                if attempt == 1:
                    # Fallback in case JoinChannelRequest fails but entity is accessible
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

    # Proactive admin-only chat detection: if the group's default_banned_rights
    # forbids sending messages, regular members cannot post.
    if isinstance(entity, Channel):
        dbr = getattr(entity, "default_banned_rights", None)
        if dbr and (getattr(dbr, "send_messages", False) or getattr(dbr, "send_plain", False)):
            raise ValueError(f"CHAT_WRITE_FORBIDDEN: Admin-only chat detected — {target}")

    return entity
