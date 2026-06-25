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
    # Raw TL types for profile change detection
    UpdateUserName,
    UpdateUserPhone,
    UpdateUser,
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
        self._tg_id_map: dict[str, int] = {}  # account_id -> telegram_id (for self-detection)
        self._db_sem = asyncio.Semaphore(10)  # Limit concurrent DB writes to prevent pool exhaustion

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

        # Raw TL handler for profile changes (instant detection)
        # Catches UpdateUserName, UpdateUserPhone, UpdateUser for self
        raw_profile_handler = client.on(
            events.Raw(types=(UpdateUserName, UpdateUserPhone, UpdateUser))
        )(
            lambda event: asyncio.create_task(
                self._on_profile_change(account_id, event)
            )
        )

        # Cache our own telegram_id for self-detection in raw handlers
        try:
            me = await client.get_me()
            if me:
                self._tg_id_map[account_id] = me.id
        except Exception:
            pass

        self._handlers[account_id] = [
            new_msg_handler,
            outgoing_handler,
            edit_handler,
            read_handler,
            typing_handler,
            chat_action_handler,
            raw_profile_handler,
        ]
        logger.info("Event handlers attached for account %s", account_id)
        return True

    async def detach(self, account_id: str) -> None:
        """Remove all event handlers for an account."""
        handlers = self._handlers.pop(account_id, None)
        self._tg_id_map.pop(account_id, None)
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
        if not event.is_private:
            return
        if account_id not in self._handlers:
            return
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

        # Update DB in the background
        if chat:
            asyncio.create_task(
                self._update_chat_on_new_message(account_id, chat, msg, is_outgoing=False)
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

                # 3. First DM — send auto-reply as a reply to the incoming message
                if chat is None:
                    return

                await event.client.send_message(
                    chat, account.auto_reply_text, reply_to=msg.id
                )

                # 4. Log the reply so we never reply to this user again
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
        if not event.is_private:
            return
        if account_id not in self._handlers:
            return
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

        # Update DB in the background
        if chat:
            asyncio.create_task(
                self._update_chat_on_new_message(account_id, chat, msg, is_outgoing=True)
            )

    async def _on_message_edited(self, account_id: str, event) -> None:
        """Fire when a message is edited."""
        if not event.is_private:
            return
        if account_id not in self._handlers:
            return
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

        # Also update the message text in the DB in the background
        if chat:
            asyncio.create_task(
                self._update_chat_on_new_message(account_id, chat, msg, is_outgoing=msg.out)
            )

    async def _on_message_read(self, account_id: str, event) -> None:
        """Fire when someone reads our messages (updates unread count)."""
        if not event.is_private:
            return
        if account_id not in self._handlers:
            return
        channel = f"chats:{account_id}"
        await manager.broadcast(
            channel,
            {
                "type": "chat_update",
                "action": "read",
                "inbox_unread": getattr(event, "inbox_unread_count", 0),
            },
        )

        # Update DB in the background
        asyncio.create_task(self._update_chat_read(account_id, event))

    async def _on_user_update(self, account_id: str, event) -> None:
        """User status update (online/offline/typing)."""
        if account_id not in self._handlers:
            return
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
        if account_id not in self._handlers:
            return
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

        # Update DB in the background
        asyncio.create_task(self._update_chat_action(account_id, event))


    # ── Database Event Synchronization Helpers ───────────────────────────────

    async def _update_chat_on_new_message(
        self, account_id: str, chat, msg, is_outgoing: bool
    ) -> None:
        from app.models.telegram_chat import TelegramChat
        from sqlalchemy.dialects.postgresql import insert
        from sqlalchemy import func
        import uuid

        chat_type_val = "unknown"
        is_creator = False
        username = getattr(chat, "username", None)
        title = getattr(chat, "title", None) or getattr(chat, "first_name", "Unknown")

        # Classify entity type
        from telethon.tl.types import User as TLUser, Chat as TLChat, Channel as TLChannel
        if isinstance(chat, TLUser):
            chat_type_val = "user"
        elif isinstance(chat, TLChannel):
            if getattr(chat, "megagroup", False):
                chat_type_val = "supergroup"
            else:
                chat_type_val = "channel"
            is_creator = getattr(chat, "creator", False)
        elif isinstance(chat, TLChat):
            chat_type_val = "group"
            is_creator = getattr(chat, "creator", False)

        last_msg = msg.text or "[non-text message]" if msg.text else ""
        last_time = msg.date

        async with self._db_sem:
            async with async_session_factory() as db:
                try:
                    # Build upsert statement
                    stmt = insert(TelegramChat).values(
                        id=uuid.uuid4(),
                        account_id=account_id,
                        chat_id=chat.id,
                        title=title,
                        username=username,
                        type=chat_type_val,
                        unread_count=0 if is_outgoing else 1,
                        last_message=last_msg,
                        last_message_date=last_time,
                        is_active=True,
                        is_creator=is_creator,
                    )

                    set_clause = {
                        "last_message": stmt.excluded.last_message,
                        "last_message_date": stmt.excluded.last_message_date,
                        "is_active": True,
                        "updated_at": func.now(),
                    }
                    if not is_outgoing:
                        set_clause["unread_count"] = TelegramChat.unread_count + 1

                    stmt = stmt.on_conflict_do_update(
                        constraint="uq_telegram_chat_account_chat",
                        set_=set_clause
                    )
                    await db.execute(stmt)
                    await db.commit()
                except Exception as exc:
                    logger.warning("Failed to update chat on message in DB (account %s): %s", account_id, exc)

    async def _update_chat_read(self, account_id: str, event) -> None:
        # If we read it (event.inbox is True)
        if getattr(event, "inbox", False):
            from app.models.telegram_chat import TelegramChat
            from sqlalchemy import update, func
            async with self._db_sem:
                async with async_session_factory() as db:
                    try:
                        await db.execute(
                            update(TelegramChat)
                            .where(TelegramChat.account_id == account_id)
                            .where(TelegramChat.chat_id == event.chat_id)
                            .values(unread_count=0, updated_at=func.now())
                        )
                        await db.commit()
                    except Exception as exc:
                        logger.warning("Failed to reset chat unread count in DB (account %s): %s", account_id, exc)

    async def _update_chat_action(self, account_id: str, event) -> None:
        my_tg_id = self._tg_id_map.get(account_id)
        if my_tg_id is None:
            return

        chat_id = event.chat_id

        # If we left / were kicked
        if (event.user_left or event.user_kicked) and event.user_id == my_tg_id:
            from app.models.telegram_chat import TelegramChat
            from sqlalchemy import update, func
            async with self._db_sem:
                async with async_session_factory() as db:
                    try:
                        await db.execute(
                            update(TelegramChat)
                            .where(TelegramChat.account_id == account_id)
                            .where(TelegramChat.chat_id == chat_id)
                            .values(is_active=False, updated_at=func.now())
                        )
                        await db.commit()
                        logger.info("Deactivated chat %s for account %s (user left/kicked)", chat_id, account_id)
                    except Exception as exc:
                        logger.warning("Failed to deactivate chat on action in DB (account %s): %s", account_id, exc)

        # If we joined / were added
        elif (event.user_joined or event.user_added) and event.user_id == my_tg_id:
            try:
                chat = await event.get_chat()
                if chat:
                    await self._update_single_chat(account_id, chat)
            except Exception as exc:
                logger.warning("Failed to sync new chat on action (account %s): %s", account_id, exc)

    async def _update_single_chat(self, account_id: str, chat) -> None:
        from app.models.telegram_chat import TelegramChat
        from sqlalchemy.dialects.postgresql import insert
        from sqlalchemy import func
        import uuid

        chat_type_val = "unknown"
        is_creator = False
        username = getattr(chat, "username", None)
        title = getattr(chat, "title", None) or getattr(chat, "first_name", "Unknown")

        from telethon.tl.types import User as TLUser, Chat as TLChat, Channel as TLChannel
        if isinstance(chat, TLUser):
            chat_type_val = "user"
        elif isinstance(chat, TLChannel):
            if getattr(chat, "megagroup", False):
                chat_type_val = "supergroup"
            else:
                chat_type_val = "channel"
            is_creator = getattr(chat, "creator", False)
        elif isinstance(chat, TLChat):
            chat_type_val = "group"
            is_creator = getattr(chat, "creator", False)

        async with self._db_sem:
            async with async_session_factory() as db:
                try:
                    stmt = insert(TelegramChat).values(
                        id=uuid.uuid4(),
                        account_id=account_id,
                        chat_id=chat.id,
                        title=title,
                        username=username,
                        type=chat_type_val,
                        unread_count=0,
                        last_message=None,
                        last_message_date=None,
                        is_active=True,
                        is_creator=is_creator,
                    )
                    stmt = stmt.on_conflict_do_update(
                        constraint="uq_telegram_chat_account_chat",
                        set_={
                            "title": stmt.excluded.title,
                            "username": stmt.excluded.username,
                            "type": stmt.excluded.type,
                            "is_active": True,
                            "is_creator": stmt.excluded.is_creator,
                            "updated_at": func.now(),
                        }
                    )
                    await db.execute(stmt)
                    await db.commit()
                    logger.info("Upserted joined chat %s for account %s", chat.id, account_id)
                except Exception as exc:
                    logger.warning("Failed to upsert chat on join in DB (account %s): %s", account_id, exc)


    async def _on_profile_change(self, account_id: str, event) -> None:
        """Handle raw TL profile updates (UpdateUserName, UpdateUserPhone, UpdateUser).

        These are pushed by Telegram when the account's profile is changed
        from another client (official app, desktop, etc.). We only process
        events for our own user_id, then trigger an immediate sync.
        """
        if account_id not in self._handlers:
            return
        # Extract user_id from the raw update
        tg_user_id = getattr(event, "user_id", None)
        if tg_user_id is None:
            return

        # Only process if this is OUR profile (self-detection)
        my_tg_id = self._tg_id_map.get(account_id)
        if my_tg_id is None or tg_user_id != my_tg_id:
            return

        update_type = type(event).__name__
        logger.info(
            "Profile change detected via %s for account %s (tg_id=%s)",
            update_type, account_id, tg_user_id,
        )

        # Trigger immediate profile sync (deferred import to avoid circular)
        from app.services.profile_sync_service import sync_account_profile

        try:
            async with async_session_factory() as db:
                result = await db.execute(
                    select(TelegramAccount).where(TelegramAccount.id == account_id)
                )
                account = result.scalar_one_or_none()
                if account:
                    changes = await sync_account_profile(db, account)
                    if changes:
                        await db.commit()
                        logger.info(
                            "Instant profile sync completed for %s: %s",
                            account_id, list(changes.keys()),
                        )
        except Exception as exc:
            logger.warning(
                "Instant profile sync failed for %s: %s", account_id, exc
            )


# Singleton
event_relay = TelegramEventRelay()
