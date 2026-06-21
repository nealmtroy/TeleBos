"""Background service that attaches Telethon event handlers to forward
real-time Telegram updates to WebSocket clients.

Hooks into every connected TelegramClient's update stream and relays:
- New messages (incoming) → chat_update event
- Message read/seen → unread_count update
- User typing → typing indicator
- Chat participant changes → member update
"""

import asyncio
import json
import logging
from datetime import datetime, timezone

from telethon import events
from telethon.tl.types import (
    Message,
    UpdateNewMessage,
    UpdateNewChannelMessage,
    UpdateShortMessage,
    UpdateShortChatMessage,
    PeerUser,
    PeerChat,
    PeerChannel,
)

from app.services.telegram_client import client_pool
from app.api.ws import manager
from app.database import async_session_factory
from app.models.telegram_account import TelegramAccount
from app.models.auto_reply_log import AutoReplyLog
from sqlalchemy import select

logger = logging.getLogger(__name__)


class TelegramEventRelay:
    """
    Registers Telethon event handlers per connected account and
    pushes parsed events to the WebSocket ConnectionManager.
    """

    def __init__(self) -> None:
        self._handlers: dict[str, list] = {}  # account_id -> list of handler callables

    # ── Public API ───────────────────────────────────────────────────────────

    async def attach(self, account_id: str, session_string: str) -> bool:
        """Register event handlers on a Telethon client for this account."""
        if account_id in self._handlers:
            return True  # already attached

        client = await client_pool.get(account_id, session_string)
        if client is None:
            return False

        # New incoming message (private / small group)
        new_msg_handler = client.on(events.NewMessage(incoming=True))(
            lambda event: asyncio.create_task(self._on_new_message(account_id, event))
        )

        # Outgoing message (so frontend sees what the user sent)
        outgoing_handler = client.on(events.NewMessage(outgoing=True))(
            lambda event: asyncio.create_task(
                self._on_outgoing_message(account_id, event)
            )
        )

        # Message edited
        edit_handler = client.on(events.MessageEdited())(
            lambda event: asyncio.create_task(
                self._on_message_edited(account_id, event)
            )
        )

        # Message read (someone read our messages)
        read_handler = client.on(events.MessageRead())(
            lambda event: asyncio.create_task(
                self._on_message_read(account_id, event)
            )
        )

        # User typing
        typing_handler = client.on(events.UserUpdate())(
            lambda event: asyncio.create_task(
                self._on_user_update(account_id, event)
            )
        )

        # Chat action (someone joined/left/pinned)
        chat_action_handler = client.on(events.ChatAction())(
            lambda event: asyncio.create_task(
                self._on_chat_action(account_id, event)
            )
        )

        self._handlers[account_id] = [
            new_msg_handler,
            outgoing_handler,
            edit_handler,
            read_handler,
            typing_handler,
            chat_action_handler,
        ]
        logger.info("Event handlers attached for account %s", account_id)
        return True

    async def detach(self, account_id: str) -> None:
        """Remove all event handlers for an account."""
        handlers = self._handlers.pop(account_id, None)
        if handlers is None:
            return
        client = (await client_pool.get_connected_clients()).get(account_id)
        if client:
            for handler in handlers:
                client.remove_event_handler(handler)
        logger.info("Event handlers detached for account %s", account_id)

    # ── Event handlers ──────────────────────────────────────────────────────

    async def _on_new_message(self, account_id: str, event) -> None:
        """Fire when a new message arrives (incoming)."""
        msg: Message = event.message

        # get_chat/get_sender can fail with "Request was unsuccessful 6 time(s)"
        # when Telegram has transient issues. Degrade gracefully rather than crash.
        try:
            chat = await event.get_chat()
        except Exception:
            chat = None
            logger.debug("Failed to get chat for new message (account %s)", account_id)

        try:
            sender = await event.get_sender()
        except Exception:
            sender = None
            logger.debug("Failed to get sender for new message (account %s)", account_id)

        channel = f"chats:{account_id}"
        await manager.broadcast(
            channel,
            {
                "type": "new_message",
                "chat_id": chat.id if chat else None,
                "chat_title": getattr(chat, "title", None) or getattr(chat, "first_name", None),
                "message_id": msg.id,
                "text": msg.text or "[media]",
                "sender_name": getattr(sender, "first_name", None) or "Unknown",
                "sender_id": getattr(sender, "id", None),
                "date": msg.date.isoformat() if msg.date else None,
                "is_outgoing": msg.out,
            },
        )

        # ── Auto-reply (welcome message) ─────────────────────────────────────
        # Only fire for private chats (not groups/channels) and not from bots
        if not event.is_private:
            return
        if sender is None or getattr(sender, "bot", False):
            return

        async with async_session_factory() as db:
            try:
                # 1. Fetch account + auto-reply settings
                result = await db.execute(
                    select(TelegramAccount).where(TelegramAccount.id == account_id)
                )
                account = result.scalar_one_or_none()
                if account is None:
                    return
                if not account.auto_reply_enabled or not account.auto_reply_text:
                    return

                # Check Redis rate limit and cooldown
                from app.utils.redis import check_auto_reply_rate_limit, record_auto_reply_sent
                if not await check_auto_reply_rate_limit(account_id):
                    logger.warning("Auto-reply skipped for account %s due to rate limit/cooldown", account_id)
                    return

                # 2. Fast path: check DB log for existing reply
                sender_id = sender.id
                log_result = await db.execute(
                    select(AutoReplyLog).where(
                        AutoReplyLog.account_id == account.id,
                        AutoReplyLog.sender_id == sender_id,
                    )
                )
                if log_result.scalar_one_or_none() is not None:
                    return  # Already replied to this user

                # 3. Authoritative path: check Telegram for any outgoing messages
                #    (catches edge case where server crashed between send and DB write)
                if chat is None:
                    return

                try:
                    recent = await event.client.get_messages(chat, limit=5)
                    has_replied = any(getattr(m, "out", False) for m in recent)
                except Exception:
                    # If the Telethon API call fails, assume no reply was sent
                    # so auto-reply can proceed
                    has_replied = False

                if has_replied:
                    # Not a first DM — log it so we skip the API check next time
                    db.add(AutoReplyLog(account_id=account.id, sender_id=sender_id))
                    await db.flush()
                    await db.commit()
                    return

                # 4. First DM — send auto-reply as a reply to the incoming message
                await event.client.send_message(
                    chat, account.auto_reply_text, reply_to=msg.id
                )

                # 5. Log the reply so we never reply to this user again
                db.add(AutoReplyLog(account_id=account.id, sender_id=sender_id))
                await db.flush()
                await db.commit()

                # Record the sent reply to enforce rate limit/cooldown in Redis
                await record_auto_reply_sent(account_id)

            except Exception as exc:
                logger.error(
                    "Auto-reply error for account %s: %s", account_id, exc
                )


    async def _on_outgoing_message(self, account_id: str, event) -> None:
        """Fire when we send a message."""
        msg: Message = event.message
        try:
            chat = await event.get_chat()
        except Exception:
            chat = None

        channel = f"chats:{account_id}"
        await manager.broadcast(
            channel,
            {
                "type": "outgoing_message",
                "chat_id": chat.id if chat else None,
                "message_id": msg.id,
                "text": msg.text or "[media]",
                "date": msg.date.isoformat() if msg.date else None,
            },
        )

    async def _on_message_edited(self, account_id: str, event) -> None:
        """Fire when a message is edited."""
        msg: Message = event.message
        try:
            chat = await event.get_chat()
        except Exception:
            chat = None

        channel = f"chats:{account_id}"
        await manager.broadcast(
            channel,
            {
                "type": "message_edited",
                "chat_id": chat.id if chat else None,
                "message_id": msg.id,
                "text": msg.text or "[media]",
            },
        )

    async def _on_message_read(self, account_id: str, event) -> None:
        """Fire when someone reads our messages (updates unread count)."""
        channel = f"chats:{account_id}"
        await manager.broadcast(
            channel,
            {
                "type": "chat_update",
                "action": "read",
                "inbox_unread": getattr(event, "inbox_unread_count", 0),
            },
        )

    async def _on_user_update(self, account_id: str, event) -> None:
        """User status update (online/offline/typing)."""
        channel = f"chats:{account_id}"
        user = event
        if hasattr(user, "status"):
            status_str = str(user.status) if user.status else "unknown"
            await manager.broadcast(
                channel,
                {
                    "type": "user_update",
                    "user_id": getattr(user, "id", None),
                    "status": status_str,
                },
            )

    async def _on_chat_action(self, account_id: str, event) -> None:
        """Chat action: someone joined, left, pinned a message, etc."""
        channel = f"chats:{account_id}"
        try:
            user_name = getattr(await event.get_user(), "first_name", None) if event.user_id else None
        except Exception:
            user_name = None
        await manager.broadcast(
            channel,
            {
                "type": "chat_action",
                "chat_id": event.chat_id,
                "action": str(event.action_message) if event.action_message else None,
                "user_id": event.user_id,
                "user_name": user_name,
            },
        )


# Singleton
event_relay = TelegramEventRelay()
