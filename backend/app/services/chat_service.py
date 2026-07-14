"""Chat and folder business logic."""

import logging
import uuid
from typing import Any

import telethon
from sqlalchemy import select, func, update, delete
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.telegram_account import TelegramAccount
from app.models.chat_folder import ChatFolder
from app.models.telegram_chat import TelegramChat
from app.services.telegram_client import client_pool
from app.utils.encryption import decrypt

logger = logging.getLogger(__name__)


async def sync_chats_to_db(account: TelegramAccount, db: AsyncSession) -> None:
    """Sync groups, channels, supergroups, and user chats into local DB."""
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        logger.error("Failed to sync chats for account %s: Client is disconnected", account.id)
        return

    logger.info("Starting chat synchronization for account %s...", account.id)

    synced_chat_ids = set()
    values = []

    try:
        # 1. Fetch main dialogs (folder 0)
        dialogs = await client.get_dialogs(limit=100, folder=0)
        for d in dialogs:
            chat_type_val = _classify_chat(d.entity)
            if chat_type_val in ("group", "supergroup", "channel"):
                continue
            is_creator = getattr(d.entity, "creator", False)
            access_hash = getattr(d.entity, "access_hash", None)

            # Save the last message text and date
            last_msg = None
            last_time = None
            if d.message:
                last_msg = d.message.text or "[non-text message]" if d.message.text else ""
                last_time = d.message.date

            values.append({
                "id": uuid.uuid4(),
                "account_id": account.id,
                "chat_id": d.id,
                "title": d.name or d.title or "Unknown",
                "username": getattr(d.entity, "username", None),
                "type": chat_type_val,
                "unread_count": d.unread_count or 0,
                "last_message": last_msg,
                "last_message_date": last_time,
                "access_hash": access_hash,
                "is_active": True,
                "is_creator": is_creator,
                "is_archived": False,
                "is_pinned": getattr(d, "pinned", False),
                "is_muted": _is_chat_muted(d),
            })
            synced_chat_ids.add(d.id)

        # 2. Fetch archived dialogs (folder 1)
        try:
            archived_dialogs = await client.get_dialogs(limit=100, folder=1)
            for d in archived_dialogs:
                chat_type_val = _classify_chat(d.entity)
                if chat_type_val in ("group", "supergroup", "channel"):
                    continue
                is_creator = getattr(d.entity, "creator", False)
                access_hash = getattr(d.entity, "access_hash", None)

                # Save the last message text and date
                last_msg = None
                last_time = None
                if d.message:
                    last_msg = d.message.text or "[non-text message]" if d.message.text else ""
                    last_time = d.message.date

                values.append({
                    "id": uuid.uuid4(),
                    "account_id": account.id,
                    "chat_id": d.id,
                    "title": d.name or d.title or "Unknown",
                    "username": getattr(d.entity, "username", None),
                    "type": chat_type_val,
                    "unread_count": d.unread_count or 0,
                    "last_message": last_msg,
                    "last_message_date": last_time,
                    "access_hash": access_hash,
                    "is_active": True,
                    "is_creator": is_creator,
                    "is_archived": True,
                    "is_pinned": getattr(d, "pinned", False),
                    "is_muted": _is_chat_muted(d),
                })
                synced_chat_ids.add(d.id)
        except Exception as arch_exc:
            logger.debug("Failed to fetch archived dialogs (folder=1): %s", arch_exc)

    except Exception as exc:
        logger.error("Error during get_dialogs for account %s: %s", account.id, exc)
        return

    if not values:
        logger.info("No dialogs found for account %s to sync", account.id)
        return

    # Bulk upsert using ON CONFLICT DO UPDATE
    # Let's batch inserts in chunks of 100 to avoid giant SQL statements
    chunk_size = 100
    for i in range(0, len(values), chunk_size):
        chunk = values[i : i + chunk_size]
        stmt = insert(TelegramChat).values(chunk)
        stmt = stmt.on_conflict_do_update(
            constraint="uq_telegram_chat_account_chat",
            set_={
                "title": stmt.excluded.title,
                "username": stmt.excluded.username,
                "type": stmt.excluded.type,
                "unread_count": stmt.excluded.unread_count,
                "last_message": stmt.excluded.last_message,
                "last_message_date": stmt.excluded.last_message_date,
                "access_hash": stmt.excluded.access_hash,
                "is_active": True,
                "is_creator": stmt.excluded.is_creator,
                "is_archived": stmt.excluded.is_archived,
                "is_pinned": stmt.excluded.is_pinned,
                "is_muted": stmt.excluded.is_muted,
                "updated_at": func.now(),
            }
        )
        await db.execute(stmt)

    # Mark other chats no longer present in sync as inactive (excluding groups/channels)
    if synced_chat_ids:
        await db.execute(
            update(TelegramChat)
            .where(TelegramChat.account_id == account.id)
            .where(TelegramChat.type.not_in(["group", "supergroup", "channel"]))
            .where(TelegramChat.chat_id.not_in(list(synced_chat_ids)))
            .values(is_active=False, updated_at=func.now())
        )
    else:
        await db.execute(
            update(TelegramChat)
            .where(TelegramChat.account_id == account.id)
            .where(TelegramChat.type.not_in(["group", "supergroup", "channel"]))
            .values(is_active=False, updated_at=func.now())
        )

    await db.commit()
    logger.info("Successfully synced %d chats for account %s", len(synced_chat_ids), account.id)


async def get_dialogs(
    account: TelegramAccount,
    db: AsyncSession,
    *,
    page: int = 1,
    page_size: int = 50,
    chat_type: str | None = None,
) -> tuple[list[dict], int]:
    """Fetch dialogs from PostgreSQL database.

    If *chat_type* is provided it may be a comma-separated list of types
    (e.g. ``"group,supergroup"``) — only dialogs whose classified type
    matches one of the values are returned.
    """
    stmt = select(TelegramChat).where(
        TelegramChat.account_id == account.id,
        TelegramChat.is_active == True,
    )

    # Parse chat_type filter
    if chat_type:
        allowed_types = {t.strip() for t in chat_type.split(",")}
        stmt = stmt.where(TelegramChat.type.in_(allowed_types))

    # Get total count before pagination
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = await db.scalar(count_stmt) or 0

    # Order and paginate
    stmt = stmt.order_by(TelegramChat.last_message_date.desc().nullslast())
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(stmt)
    chats = result.scalars().all()

    # Determine if this is a group/channel list query to skip heavy API calls
    is_group_channel_query = False
    if chat_type:
        allowed_types = {t.strip() for t in chat_type.split(",")}
        if allowed_types.intersection({"group", "supergroup", "channel"}):
            is_group_channel_query = True

    # If the database does not have enough chats to satisfy the requested page,
    # we can try to fetch more chats from Telegram API using offset parameters
    if not is_group_channel_query and (len(chats) < page_size or total < page * page_size) and page > 0:
        try:
            session_str = decrypt(account.session_string)
            client = await client_pool.get(str(account.id), session_str)
            if client and client.is_connected():
                # Find the oldest synced chat in the DB to use its date and peer as offsets
                oldest_stmt = select(TelegramChat).where(
                    TelegramChat.account_id == account.id,
                    TelegramChat.is_active == True,
                    TelegramChat.type.not_in(["group", "supergroup", "channel"])
                ).order_by(TelegramChat.last_message_date.asc()).limit(1)

                oldest_res = await db.execute(oldest_stmt)
                oldest_chat = oldest_res.scalar_one_or_none()

                offset_date = None
                offset_peer = None
                if oldest_chat:
                    offset_date = oldest_chat.last_message_date
                    offset_peer = await resolve_chat_entity(client, account.id, oldest_chat.chat_id)

                # Fetch more dialogs from Telegram starting after the oldest chat we have
                logger.info("Loading more dialogs on-demand from Telegram (offset_date=%s) for account %s", offset_date, account.id)
                dialogs = await client.get_dialogs(
                    limit=50,
                    offset_date=offset_date,
                    offset_peer=offset_peer
                )

                if dialogs:
                    # Sync these newly loaded dialogs to DB!
                    new_values = []
                    for d in dialogs:
                        chat_type_val = _classify_chat(d.entity)
                        if chat_type_val in ("group", "supergroup", "channel"):
                            continue
                        is_creator = getattr(d.entity, "creator", False)
                        access_hash = getattr(d.entity, "access_hash", None)

                        last_msg = None
                        last_time = None
                        if d.message:
                            last_msg = d.message.text or "[non-text message]" if d.message.text else ""
                            last_time = d.message.date

                        new_values.append({
                            "id": uuid.uuid4(),
                            "account_id": account.id,
                            "chat_id": d.id,
                            "title": d.name or d.title or "Unknown",
                            "username": getattr(d.entity, "username", None),
                            "type": chat_type_val,
                            "unread_count": d.unread_count or 0,
                            "last_message": last_msg,
                            "last_message_date": last_time,
                            "access_hash": access_hash,
                            "is_active": True,
                            "is_creator": is_creator,
                        })

                    if new_values:
                        from sqlalchemy.dialects.postgresql import insert
                        stmt_insert = insert(TelegramChat).values(new_values)
                        stmt_insert = stmt_insert.on_conflict_do_update(
                            constraint="uq_telegram_chat_account_chat",
                            set_={
                                "title": stmt_insert.excluded.title,
                                "username": stmt_insert.excluded.username,
                                "type": stmt_insert.excluded.type,
                                "unread_count": stmt_insert.excluded.unread_count,
                                "last_message": stmt_insert.excluded.last_message,
                                "last_message_date": stmt_insert.excluded.last_message_date,
                                "access_hash": stmt_insert.excluded.access_hash,
                                "is_active": True,
                                "is_creator": stmt_insert.excluded.is_creator,
                                "updated_at": func.now(),
                            }
                        )
                        await db.execute(stmt_insert)
                        await db.commit()

                        # Re-calculate total count and fetch page chats
                        stmt = select(TelegramChat).where(
                            TelegramChat.account_id == account.id,
                            TelegramChat.is_active == True,
                        )
                        if chat_type:
                            stmt = stmt.where(TelegramChat.type.in_(allowed_types))

                        count_stmt = select(func.count()).select_from(stmt.subquery())
                        total = await db.scalar(count_stmt) or 0

                        stmt = stmt.order_by(TelegramChat.last_message_date.desc().nullslast())
                        stmt = stmt.offset((page - 1) * page_size).limit(page_size)

                        result = await db.execute(stmt)
                        chats = result.scalars().all()

        except Exception as offset_exc:
            logger.warning("Failed to load more dialogs using offsets for account %s: %s", account.id, offset_exc)

    page_dialogs = []
    for c in chats:
        last_time_str = c.last_message_date.isoformat() if c.last_message_date else None
        page_dialogs.append({
            "chat_id": c.chat_id,
            "title": c.title,
            "username": c.username,
            "chat_type": c.type,
            "last_message": c.last_message,
            "last_message_time": last_time_str,
            "unread_count": c.unread_count,
            "is_muted": c.is_muted,
            "is_pinned": c.is_pinned,
            "folder_id": 1 if c.is_archived else 0,
            "is_archived": c.is_archived,
            "is_creator": c.is_creator,
        })

    return page_dialogs, total


def _classify_chat(entity: Any) -> str:
    from telethon.tl.types import (
        User as TLUser,
        Chat as TLChat,
        Channel as TLChannel,
    )
    if isinstance(entity, TLUser):
        return "user"
    if isinstance(entity, TLChannel):
        if getattr(entity, "megagroup", False):
            return "supergroup"
        return "channel"
    if isinstance(entity, TLChat):
        return "group"
    return "unknown"


def _is_chat_muted(d: Any) -> bool:
    """Check if a dialog is muted."""
    if hasattr(d, "dialog") and d.dialog and hasattr(d.dialog, "notify_settings") and d.dialog.notify_settings:
        ns = d.dialog.notify_settings
        if getattr(ns, "mute_until", None):
            import datetime
            from datetime import timezone
            mute_until = ns.mute_until
            now = datetime.datetime.now(timezone.utc)
            if mute_until.tzinfo is None:
                mute_until = mute_until.replace(tzinfo=timezone.utc)
            return mute_until > now
        if getattr(ns, "silent", False):
            return True
    return False


async def get_dialog_stats(account: "TelegramAccount", db: AsyncSession) -> dict:
    """Fetch aggregate dialog statistics for an account using database + Telegram contacts check."""
    # Count chats from database
    stmt = select(
        func.count().filter(TelegramChat.type.in_(["group", "supergroup"])).label("total_groups"),
        func.count().filter(TelegramChat.type.in_(["group", "supergroup"]) & TelegramChat.is_creator).label("owned_groups"),
        func.count().filter(TelegramChat.type == "channel").label("total_channels"),
        func.count().filter((TelegramChat.type == "channel") & TelegramChat.is_creator).label("owned_channels"),
    ).where(
        TelegramChat.account_id == account.id,
        TelegramChat.is_active == True,
    )
    res = await db.execute(stmt)
    row = res.fetchone()

    total_groups = row.total_groups if row else 0
    owned_groups = row.owned_groups if row else 0
    total_channels = row.total_channels if row else 0
    owned_channels = row.owned_channels if row else 0

    # Contacts count (best-effort from Telegram API)
    contacts_count = 0
    try:
        session_str = decrypt(account.session_string)
        client = await client_pool.get(str(account.id), session_str)
        if client is not None:
            from telethon.tl.functions.contacts import GetContactsRequest
            result = await client(GetContactsRequest(0))
            if result and result.users:
                contacts_count = len(result.users)
    except Exception as exc:
        logger.warning("Failed to fetch contacts count for account %s: %s", account.id, exc)

    return {
        "contacts_count": contacts_count,
        "total_groups": total_groups,
        "owned_groups": owned_groups,
        "total_channels": total_channels,
        "owned_channels": owned_channels,
    }



async def get_folders(account_id: str, db: AsyncSession) -> list[ChatFolder]:
    result = await db.execute(
        select(ChatFolder)
        .where(ChatFolder.account_id == account_id)
        .order_by(ChatFolder.folder_id)
    )
    return list(result.scalars().all())


async def sync_folders_from_telegram(account: TelegramAccount, db: AsyncSession) -> None:
    """Sync chat folders from Telegram into our DB."""
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected.")

    try:
        dialog_filters = await client(telethon.tl.functions.messages.GetDialogFiltersRequest())
    except Exception as exc:
        logger.warning("Cannot fetch folders for %s: %s", account.id, exc)
        return

    # Handle messages.DialogFilters vs list of DialogFilter
    if hasattr(dialog_filters, "filters"):
        folders = dialog_filters.filters
    elif isinstance(dialog_filters, list):
        folders = dialog_filters
    else:
        logger.warning("Unexpected dialog filters type for %s: %s", account.id, type(dialog_filters))
        return

    # Delete existing folders
    existing = await db.execute(
        select(ChatFolder).where(ChatFolder.account_id == account.id)
    )
    for f in existing.scalars().all():
        await db.delete(f)

    # Insert new folders
    import telethon.tl.types as types
    for folder in folders:
        if isinstance(folder, types.DialogFilter):
            included = [c.id for c in folder.include_peers if hasattr(c, "id")]
            excluded = [c.id for c in folder.exclude_peers if hasattr(c, "id")]
            pinned = [c.id for c in folder.pinned_peers if hasattr(c, "id")]

            # Ensure title is a string and handle TextWithEntities or None
            title = ""
            if folder.title:
                if hasattr(folder.title, "text"):
                    title = folder.title.text
                else:
                    title = str(folder.title)
            if not title:
                title = f"Folder {folder.id}"
            title = title[:255]

            # Try to extract emoji and color if present
            emoji = getattr(folder, "emoticon", None)
            if emoji:
                if hasattr(emoji, "text"):
                    emoji = emoji.text
                else:
                    emoji = str(emoji)
                emoji = emoji[:10]

            color = getattr(folder, "color", None)
            if color is not None:
                try:
                    color = int(color)
                except (ValueError, TypeError):
                    color = None

            cf = ChatFolder(
                account_id=account.id,
                folder_id=folder.id,
                title=title,
                emoji=emoji,
                color=color,
                included_chat_ids=included,
                excluded_chat_ids=excluded,
                pinned_chat_ids=pinned,
            )
            db.add(cf)

    await db.flush()


# ── Message operations ───────────────────────────────────────────────────────


async def resolve_chat_entity(client, account_id, chat_id: int):
    """Resolve a chat ID into an entity (InputPeer or actual entity) using cache, DB lookup, or network fallback."""
    import telethon.tl.types as types
    import uuid
    try:
        # 1. Try to get input entity from cache (fastest)
        return await client.get_input_entity(chat_id)
    except Exception:
        # 2. Look up access_hash from local database
        from app.database import async_session_factory
        from app.models.telegram_chat import TelegramChat
        from sqlalchemy import select
        
        access_hash = None
        chat_type = "user"
        try:
            acc_uuid = uuid.UUID(str(account_id))
            async with async_session_factory() as session:
                res = await session.execute(
                    select(TelegramChat.access_hash, TelegramChat.type)
                    .where(TelegramChat.account_id == acc_uuid)
                    .where(TelegramChat.chat_id == chat_id)
                )
                row = res.first()
                if row:
                    access_hash, chat_type = row
        except Exception as db_err:
            logger.debug("Failed to query access_hash from DB for entity resolution: %s", db_err)

        if access_hash is not None:
            if chat_type == "user":
                return types.InputPeerUser(user_id=chat_id, access_hash=access_hash)
            elif chat_type in ("channel", "supergroup"):
                return types.InputPeerChannel(channel_id=chat_id, access_hash=access_hash)
            else:
                return types.InputPeerChat(chat_id=chat_id)

        # 3. Fallback to slow network query
        return await client.get_entity(chat_id)


async def get_messages(
    account: TelegramAccount, chat_id: int, *, limit: int = 50, offset_id: int = 0
) -> tuple[list[dict], bool]:
    """Fetch message history for a specific chat.

    Returns:
        Tuple of (messages_list, has_more).
    """
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")

    entity = await resolve_chat_entity(client, account.id, chat_id)
    me = await client.get_me()
    my_id = me.id

    messages = await client.get_messages(
        entity, limit=limit + 1, offset_id=offset_id
    )

    has_more = len(messages) > limit
    if has_more:
        messages = messages[:limit]

    result = []
    for msg in reversed(messages):  # oldest first
        sender_name = None
        sender_id = None

        if msg.sender:
            sender_id = msg.sender_id
            if hasattr(msg.sender, "first_name"):
                first = msg.sender.first_name or ""
                last = getattr(msg.sender, "last_name", "") or ""
                sender_name = f"{first} {last}".strip() or str(sender_id)
            elif hasattr(msg.sender, "title"):
                sender_name = msg.sender.title
            else:
                sender_name = str(sender_id)

        # Determine media type
        media_type = None
        media_filename = None
        if msg.media:
            media_type = _classify_media(msg.media)
            if hasattr(msg.media, "document") and msg.media.document:
                for attr in getattr(msg.media.document, "attributes", []):
                    if hasattr(attr, "file_name"):
                        media_filename = attr.file_name
                        break

        # Reply preview
        reply_preview = None
        reply_to_msg_id = None
        if msg.reply_to:
            reply_to_msg_id = getattr(msg.reply_to, "reply_to_msg_id", None)

        # Extract stripped thumbnail
        stripped_thumb_base64 = None
        if msg.media:
            from telethon.tl.types import MessageMediaPhoto, MessageMediaDocument
            from telethon.utils import stripped_photo_to_jpg
            import base64
            
            stripped_bytes = None
            if isinstance(msg.media, MessageMediaPhoto) and msg.media.photo:
                for size in getattr(msg.media.photo, "sizes", []):
                    if type(size).__name__ == "PhotoStrippedSize":
                        stripped_bytes = size.bytes
                        break
            elif isinstance(msg.media, MessageMediaDocument) and msg.media.document:
                for size in getattr(msg.media.document, "thumbs", []):
                    if type(size).__name__ == "PhotoStrippedSize":
                        stripped_bytes = size.bytes
                        break
                        
            if stripped_bytes:
                try:
                    jpeg_bytes = stripped_photo_to_jpg(stripped_bytes)
                    stripped_thumb_base64 = "data:image/jpeg;base64," + base64.b64encode(jpeg_bytes).decode('utf-8')
                except Exception as e:
                    logger.warning("Failed to decode stripped thumbnail for message %s: %s", msg.id, e)

        # Extract voice waveform levels
        waveform_levels = []
        if media_type == "voice" and msg.media and hasattr(msg.media, "document") and msg.media.document:
            from telethon.utils import decode_waveform
            for attr in getattr(msg.media.document, "attributes", []):
                if type(attr).__name__ == "DocumentAttributeAudio" and getattr(attr, "voice", False):
                    raw_wave = getattr(attr, "waveform", None)
                    if raw_wave:
                        try:
                            waveform_levels = list(decode_waveform(raw_wave))
                        except Exception as e:
                            logger.warning("Failed to decode waveform for message %s: %s", msg.id, e)
                    break

        # Extract file size and mime_type
        file_size = None
        mime_type = None
        if msg.media and hasattr(msg.media, "document") and msg.media.document:
            file_size = msg.media.document.size
            mime_type = msg.media.document.mime_type
        elif msg.media and hasattr(msg.media, "photo") and msg.media.photo:
            sizes = getattr(msg.media.photo, "sizes", [])
            if sizes:
                largest = sizes[-1]
                file_size = getattr(largest, "size", None)
            mime_type = "image/jpeg"

        # Parse poll details if type is poll
        poll_info = None
        if media_type == "poll" and msg.media:
            poll_obj = getattr(msg.media, "poll", None)
            results_obj = getattr(msg.media, "results", None)
            if poll_obj:
                voters_map = {}
                if results_obj and getattr(results_obj, "results", []):
                    for v in results_obj.results:
                        opt_id = v.option.decode("utf-8") if isinstance(v.option, bytes) else str(v.option)
                        voters_map[opt_id] = v.voters
                
                chosen_options = []
                if results_obj and getattr(results_obj, "results", []):
                    for v in results_obj.results:
                        if getattr(v, "chosen", False):
                            chosen_options.append(v.option.decode("utf-8") if isinstance(v.option, bytes) else str(v.option))

                correct_answers = getattr(results_obj, "correct_answers", []) or []
                correct_options = [c.decode("utf-8") if isinstance(c, bytes) else str(c) for c in correct_answers]

                options = []
                for i, ans in enumerate(getattr(poll_obj, "answers", [])):
                    opt_id = ans.option.decode("utf-8") if isinstance(ans.option, bytes) else str(ans.option)
                    options.append({
                        "text": ans.text,
                        "voters": voters_map.get(opt_id, 0),
                        "chosen": opt_id in chosen_options or str(i) in chosen_options,
                        "correct": opt_id in correct_options or str(i) in correct_options,
                    })
                
                poll_info = {
                    "question": poll_obj.question,
                    "options": options,
                    "total_voters": getattr(results_obj, "total_voters", 0) if results_obj else 0,
                    "closed": bool(poll_obj.closed),
                    "is_quiz": bool(poll_obj.quiz),
                }

        # Service message detection
        is_service = False
        service_text = None
        if type(msg).__name__ == "MessageService" or getattr(msg, "action", None):
            is_service = True
            action_name = type(msg.action).__name__ if getattr(msg, "action", None) else "MessageAction"
            subj = sender_name or "Someone"
            if action_name == "MessageActionChatCreate":
                service_text = f"Group '{msg.action.title}' was created"
            elif action_name == "MessageActionChatAddUser":
                service_text = f"{subj} joined the group"
            elif action_name == "MessageActionChatDeleteUser":
                service_text = f"{subj} left the group"
            elif action_name == "MessageActionPinMessage":
                service_text = f"{subj} pinned a message"
            elif action_name == "MessageActionChatEditTitle":
                service_text = f"{subj} changed group name to '{msg.action.title}'"
            elif action_name == "MessageActionChatEditPhoto":
                service_text = f"{subj} changed group photo"
            elif action_name == "MessageActionChatDeletePhoto":
                service_text = f"{subj} removed group photo"
            else:
                service_text = f"Service message"

        result.append({
            "id": msg.id,
            "sender_id": sender_id,
            "sender_name": sender_name,
            "text": msg.text or "",
            "date": msg.date.isoformat() if msg.date else None,
            "is_outgoing": sender_id == my_id if sender_id else msg.out,
            "reply_to_msg_id": reply_to_msg_id,
            "reply_preview": reply_preview,
            "media_type": media_type,
            "media_filename": media_filename,
            "stripped_thumb": stripped_thumb_base64,
            "waveform_levels": waveform_levels,
            "file_size": file_size,
            "mime_type": mime_type,
            "poll": poll_info,
            "is_service": is_service,
            "service_text": service_text,
        })

    return result, has_more


def _classify_media(media: Any) -> str:
    """Classify Telethon media into a human-readable type string."""
    from telethon.tl.types import (
        MessageMediaPhoto,
        MessageMediaDocument,
        MessageMediaGeo,
        MessageMediaContact,
        MessageMediaPoll,
        MessageMediaWebPage,
    )

    if isinstance(media, MessageMediaPhoto):
        return "photo"
    if isinstance(media, MessageMediaDocument):
        doc = media.document
        if doc:
            mime = getattr(doc, "mime_type", "") or ""
            for attr in getattr(doc, "attributes", []):
                cls_name = type(attr).__name__
                if "Sticker" in cls_name:
                    return "sticker"
                if "Video" in cls_name:
                    if "round" in str(getattr(attr, "round_message", "")):
                        return "video_note"
                    return "video"
                if "Audio" in cls_name:
                    if getattr(attr, "voice", False):
                        return "voice"
                    return "audio"
                if "Animated" in cls_name:
                    return "animation"
            if "video" in mime:
                return "video"
            if "audio" in mime or "ogg" in mime:
                return "voice"
            return "document"
    if isinstance(media, MessageMediaGeo):
        return "location"
    if isinstance(media, MessageMediaContact):
        return "contact"
    if isinstance(media, MessageMediaPoll):
        return "poll"
    if isinstance(media, MessageMediaWebPage):
        return "link"
    return "other"


async def send_message(
    account: TelegramAccount,
    chat_id: int,
    text: str,
    reply_to: int | None = None,
) -> dict:
    """Send a text message to a chat."""
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")

    entity = await resolve_chat_entity(client, account.id, chat_id)
    msg = await client.send_message(entity, text, reply_to=reply_to)

    return {
        "id": msg.id,
        "text": msg.text,
        "date": msg.date.isoformat() if msg.date else None,
    }


async def send_media(
    account: TelegramAccount,
    chat_id: int,
    file_bytes: bytes,
    filename: str,
    caption: str | None = None,
    reply_to: int | None = None,
) -> dict:
    """Send a media file (photo, video, document, etc.) to a chat."""
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")

    entity = await resolve_chat_entity(client, account.id, chat_id)
    
    import io
    file_io = io.BytesIO(file_bytes)
    file_io.name = filename
    
    msg = await client.send_file(
        entity,
        file_io,
        caption=caption,
        reply_to=reply_to,
    )

    media_type = None
    media_filename = None
    if msg.media:
        media_type = _classify_media(msg.media)
        if hasattr(msg.media, "document") and msg.media.document:
            for attr in getattr(msg.media.document, "attributes", []):
                if hasattr(attr, "file_name"):
                    media_filename = attr.file_name
                    break

    return {
        "id": msg.id,
        "text": msg.text,
        "date": msg.date.isoformat() if msg.date else None,
        "media_type": media_type,
        "media_filename": media_filename,
    }


async def join_chat(account: TelegramAccount, identifier: str) -> dict:
    """Join a Telegram group or channel.

    Supports:
      - @username or bare username
      - t.me/username
      - t.me/+invite_hash
      - t.me/joinchat/invite_hash

    Returns dict with chat_id, title, username, chat_type.
    """
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")

    import telethon.tl.functions as funcs
    import telethon

    # Normalise the identifier
    ident = identifier.strip()

    # Detect invite link
    invite_hash = None
    if "t.me/" in ident or "telegram.me/" in ident:
        # Extract the last segment after the last /
        parts = ident.rstrip("/").split("/")
        last = parts[-1]
        if last and last != ident:
            invite_hash = last
    elif ident.startswith("+"):
        invite_hash = ident[1:]

    entity = None

    if invite_hash:
        # ── Invite link path ──────────────────────────────────────────────
        # Strip + prefix if present
        hash_clean = invite_hash.lstrip("+")
        try:
            info = await client(telethon.tl.functions.messages.CheckChatInviteRequest(hash=hash_clean))
            if isinstance(info, telethon.tl.types.ChatInviteAlready):
                entity = info.chat  # already a member
            else:
                result = await client(telethon.tl.functions.messages.ImportChatInviteRequest(hash=hash_clean))
                if hasattr(result, "chats") and result.chats:
                    entity = result.chats[0]
        except Exception as exc:
            # Maybe we are already a member — try get_entity from the chat link
            err_msg = str(exc)
            try:
                # For t.me/username style links, try as username
                if not hash_clean.startswith(("/", "+")):
                    entity = await client.get_entity(hash_clean)
            except Exception:
                raise RuntimeError(f"Failed to join: {err_msg}") from exc
    else:
        # ── Username path ─────────────────────────────────────────────────
        username = ident.lstrip("@").split("/")[-1]
        # Try resolving first
        try:
            entity = await client.get_entity(username)
        except Exception:
            pass

        if entity is None:
            # Not a member yet — try joining
            try:
                await client(funcs.channels.JoinChannelRequest(username))
                entity = await client.get_entity(username)
            except Exception as exc:
                raise RuntimeError(f"Failed to join: {exc}") from exc
        else:
            # Already resolved — check membership; join if needed
            try:
                await client.get_permissions(entity, "me")
            except Exception:
                try:
                    await client(funcs.channels.JoinChannelRequest(entity))
                except Exception:
                    pass  # we have entity anyway

    if entity is None:
        raise RuntimeError("Could not resolve or join the group/channel.")

    chat_type = _classify_chat(entity)
    title = getattr(entity, "title", None) or getattr(entity, "name", "") or "Unknown"
    username = getattr(entity, "username", None)
    chat_id = getattr(entity, "id", None)

    if chat_id is None:
        raise RuntimeError("Could not determine chat ID.")

    return {
        "chat_id": chat_id,
        "title": title,
        "username": username,
        "chat_type": chat_type,
    }


async def mark_read(db: AsyncSession, account: TelegramAccount, chat_id: int) -> None:
    """Mark all messages in a chat as read."""
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")

    entity = await resolve_chat_entity(client, account.id, chat_id)
    await client.send_read_acknowledge(entity)

    # Update unread count in database
    stmt = (
        update(TelegramChat)
        .where(TelegramChat.account_id == account.id)
        .where(TelegramChat.chat_id == chat_id)
        .values(unread_count=0, updated_at=func.now())
    )
    await db.execute(stmt)
    await db.commit()


# ── Archive / Unarchive / Delete ───────────────────────────────────────────────


async def archive_chat(db: AsyncSession, account: TelegramAccount, chat_id: int) -> None:
    """Move a chat to the Archived folder (folder_id=1)."""
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")

    entity = await resolve_chat_entity(client, account.id, chat_id)

    from telethon.tl.functions.folders import EditPeerFoldersRequest
    from telethon.tl.types import InputFolderPeer
    await client(EditPeerFoldersRequest(folder_peers=[
        InputFolderPeer(peer=entity, folder_id=1)
    ]))

    # Update database record
    stmt = (
        update(TelegramChat)
        .where(TelegramChat.account_id == account.id)
        .where(TelegramChat.chat_id == chat_id)
        .values(is_archived=True, updated_at=func.now())
    )
    await db.execute(stmt)
    await db.commit()


async def unarchive_chat(db: AsyncSession, account: TelegramAccount, chat_id: int) -> None:
    """Move a chat out of the Archived folder back to Main (folder_id=0)."""
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")

    entity = await resolve_chat_entity(client, account.id, chat_id)

    from telethon.tl.functions.folders import EditPeerFoldersRequest
    from telethon.tl.types import InputFolderPeer
    await client(EditPeerFoldersRequest(folder_peers=[
        InputFolderPeer(peer=entity, folder_id=0)
    ]))

    # Update database record
    stmt = (
        update(TelegramChat)
        .where(TelegramChat.account_id == account.id)
        .where(TelegramChat.chat_id == chat_id)
        .values(is_archived=False, updated_at=func.now())
    )
    await db.execute(stmt)
    await db.commit()


async def delete_chat(db: AsyncSession, account: TelegramAccount, chat_id: int) -> None:
    """Delete a chat / conversation completely."""
    logger.info("Deleting chat %s for account %s", chat_id, account.id)
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")

    # 1. Try to delete on Telegram
    try:
        entity = await resolve_chat_entity(client, account.id, chat_id)
        await client.delete_dialog(entity, revoke=True)
        logger.info("Successfully deleted chat %s on Telegram for account %s", chat_id, account.id)
    except Exception as exc:
        # If it was already deleted on Telegram, we still want to deactivate it locally.
        logger.warning("Failed to delete chat %s on Telegram: %s. Proceeding to deactivate locally.", chat_id, exc)

    # 2. Deactivate locally in the database
    stmt = (
        update(TelegramChat)
        .where(TelegramChat.account_id == account.id)
        .where(TelegramChat.chat_id == chat_id)
        .values(is_active=False, updated_at=func.now())
    )
    await db.execute(stmt)
    await db.commit()
    logger.info("Deactivated chat %s in local database for account %s", chat_id, account.id)


async def batch_archive_chats(db: AsyncSession, account: TelegramAccount, chat_ids: list[int]) -> None:
    """Archive multiple chats at once."""
    for chat_id in chat_ids:
        try:
            await archive_chat(db, account, chat_id)
        except Exception as exc:
            logger.warning("Failed to archive chat %s: %s", chat_id, exc)


async def batch_unarchive_chats(db: AsyncSession, account: TelegramAccount, chat_ids: list[int]) -> None:
    """Unarchive multiple chats at once."""
    for chat_id in chat_ids:
        try:
            await unarchive_chat(db, account, chat_id)
        except Exception as exc:
            logger.warning("Failed to unarchive chat %s: %s", chat_id, exc)


async def batch_delete_chats(db: AsyncSession, account: TelegramAccount, chat_ids: list[int]) -> None:
    """Delete multiple chats at once."""
    for chat_id in chat_ids:
        try:
            await delete_chat(db, account, chat_id)
        except Exception as exc:
            logger.warning("Failed to delete chat %s: %s", chat_id, exc)


async def sync_groups_channels_to_db(account: TelegramAccount, db: AsyncSession) -> None:
    """Fetch all groups and channels the account is joined to and cache in the DB."""
    import datetime as dt
    from sqlalchemy.dialects.postgresql import insert

    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please reconnect first.")

    logger.info("Starting groups & channels sync for account %s...", account.id)

    synced_group_channel_ids = set()
    values = []

    try:
        dialogs = await client.get_dialogs(limit=500)
        for d in dialogs:
            chat_type_val = _classify_chat(d.entity)
            if chat_type_val not in ("group", "supergroup", "channel"):
                continue

            left = getattr(d.entity, "left", False)
            deactivated = getattr(d.entity, "deactivated", False)
            is_active = not (left or deactivated)
            is_creator = getattr(d.entity, "creator", False)
            access_hash = getattr(d.entity, "access_hash", None)

            # Save the last message text and date
            last_msg = None
            last_time = None
            if d.message:
                last_msg = d.message.text or "[non-text message]" if d.message.text else ""
                last_time = d.message.date

            values.append({
                "id": uuid.uuid4(),
                "account_id": account.id,
                "chat_id": d.id,
                "title": d.name or d.title or "Unknown",
                "username": getattr(d.entity, "username", None),
                "type": chat_type_val,
                "unread_count": d.unread_count or 0,
                "last_message": last_msg,
                "last_message_date": last_time,
                "access_hash": access_hash,
                "is_active": is_active,
                "is_creator": is_creator,
                "is_archived": getattr(d, "folder_id", 0) == 1,
                "is_pinned": getattr(d, "pinned", False),
                "is_muted": _is_chat_muted(d),
            })
            if is_active:
                synced_group_channel_ids.add(d.id)
    except Exception as exc:
        logger.error("Error during get_dialogs for account %s: %s", account.id, exc)
        raise RuntimeError(f"Telegram API error: {exc}")

    # Bulk upsert groups and channels
    if values:
        chunk_size = 100
        for i in range(0, len(values), chunk_size):
            chunk = values[i : i + chunk_size]
            stmt = insert(TelegramChat).values(chunk)
            stmt = stmt.on_conflict_do_update(
                constraint="uq_telegram_chat_account_chat",
                set_={
                    "title": stmt.excluded.title,
                    "username": stmt.excluded.username,
                    "type": stmt.excluded.type,
                    "unread_count": stmt.excluded.unread_count,
                    "last_message": stmt.excluded.last_message,
                    "last_message_date": stmt.excluded.last_message_date,
                    "access_hash": stmt.excluded.access_hash,
                    "is_active": True,
                    "is_creator": stmt.excluded.is_creator,
                    "is_archived": stmt.excluded.is_archived,
                    "is_pinned": stmt.excluded.is_pinned,
                    "is_muted": stmt.excluded.is_muted,
                    "updated_at": func.now(),
                }
            )
            await db.execute(stmt)

    # Mark groups and channels that were not returned in this sync as inactive
    if synced_group_channel_ids:
        await db.execute(
            update(TelegramChat)
            .where(TelegramChat.account_id == account.id)
            .where(TelegramChat.type.in_(["group", "supergroup", "channel"]))
            .where(TelegramChat.chat_id.not_in(list(synced_group_channel_ids)))
            .values(is_active=False, updated_at=func.now())
        )
    else:
        await db.execute(
            update(TelegramChat)
            .where(TelegramChat.account_id == account.id)
            .where(TelegramChat.type.in_(["group", "supergroup", "channel"]))
            .values(is_active=False, updated_at=func.now())
        )

    # Refresh cached counts on TelegramAccount model
    count_stmt = select(
        func.count().filter(TelegramChat.type.in_(["group", "supergroup"])).label("total_groups"),
        func.count().filter(TelegramChat.type.in_(["group", "supergroup"]) & TelegramChat.is_creator).label("owned_groups"),
        func.count().filter(TelegramChat.type == "channel").label("total_channels"),
        func.count().filter((TelegramChat.type == "channel") & TelegramChat.is_creator).label("owned_channels"),
    ).where(
        TelegramChat.account_id == account.id,
        TelegramChat.is_active == True,
    )
    res = await db.execute(count_stmt)
    row = res.fetchone()
    if row:
        account.total_groups = row.total_groups
        account.owned_groups = row.owned_groups
        account.total_channels = row.total_channels
        account.owned_channels = row.owned_channels

    # Update synced_at timestamp
    account.groups_channels_synced_at = dt.datetime.now(dt.timezone.utc)
    
    await db.commit()
    logger.info("Successfully synced %d groups/channels for account %s", len(synced_group_channel_ids), account.id)


async def delete_messages(account: TelegramAccount, chat_id: int, message_ids: list[int], revoke: bool = True) -> None:
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")
    entity = await resolve_chat_entity(client, account.id, chat_id)
    await client.delete_messages(entity, message_ids, revoke=revoke)


async def edit_message(account: TelegramAccount, chat_id: int, message_id: int, text: str) -> dict:
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")
    entity = await resolve_chat_entity(client, account.id, chat_id)
    msg = await client.edit_message(entity, message_id, text)
    return {
        "id": msg.id,
        "text": msg.text,
        "date": msg.date.isoformat() if msg.date else None,
    }


async def forward_messages(account: TelegramAccount, from_chat_id: int, message_ids: list[int], to_chat_ids: list[int]) -> list:
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")
    
    from_entity = await resolve_chat_entity(client, account.id, from_chat_id)
    
    results = []
    for to_id in to_chat_ids:
        to_entity = await resolve_chat_entity(client, account.id, to_id)
        msgs = await client.forward_messages(to_entity, message_ids, from_entity)
        if isinstance(msgs, list):
            results.extend([{"id": m.id, "to_chat_id": to_id} for m in msgs])
        else:
            results.append({"id": msgs.id, "to_chat_id": to_id})
    return results


async def get_shared_media(
    account: TelegramAccount, chat_id: int, media_type: str | None = None, limit: int = 50, offset_id: int = 0
) -> tuple[list[dict], bool, int]:
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")
    
    entity = await resolve_chat_entity(client, account.id, chat_id)
    
    flt = None
    if media_type:
        from telethon.tl import types as tl_types
        mt = media_type.lower().strip()
        if mt in ("photo", "photos"):
            flt = tl_types.InputMessagesFilterPhotos()
        elif mt in ("video", "videos"):
            flt = tl_types.InputMessagesFilterVideo()
        elif mt in ("document", "documents", "file", "files"):
            flt = tl_types.InputMessagesFilterDocument()
        elif mt in ("url", "urls", "link", "links"):
            flt = tl_types.InputMessagesFilterUrl()
        elif mt in ("music", "audio"):
            flt = tl_types.InputMessagesFilterMusic()
        elif mt in ("voice", "voices"):
            flt = tl_types.InputMessagesFilterVoice()
        elif mt in ("gif", "gifs"):
            flt = tl_types.InputMessagesFilterGif()
        elif mt in ("round_video", "round_videos", "video_note", "video_notes"):
            flt = tl_types.InputMessagesFilterRoundVideo()
            
    messages = await client.get_messages(
        entity, limit=limit + 1, offset_id=offset_id, filter=flt
    )
    
    has_more = len(messages) > limit
    if has_more:
        messages = messages[:limit]
        
    items = []
    next_offset_id = 0
    
    for msg in messages:
        m_type = "other"
        m_filename = None
        stripped_thumb = None
        file_size = None
        mime_type = None
        
        if msg.media:
            m_type = _classify_media(msg.media)
            if hasattr(msg.media, "document") and msg.media.document:
                for attr in getattr(msg.media.document, "attributes", []):
                    if hasattr(attr, "file_name"):
                        m_filename = attr.file_name
                        break
                file_size = msg.media.document.size
                mime_type = msg.media.document.mime_type
            elif hasattr(msg.media, "photo") and msg.media.photo:
                sizes = getattr(msg.media.photo, "sizes", [])
                if sizes:
                    largest = sizes[-1]
                    file_size = getattr(largest, "size", None)
                mime_type = "image/jpeg"
                
            from telethon.tl.types import MessageMediaPhoto, MessageMediaDocument
            from telethon.utils import stripped_photo_to_jpg
            import base64
            
            stripped_bytes = None
            if isinstance(msg.media, MessageMediaPhoto) and msg.media.photo:
                for size in getattr(msg.media.photo, "sizes", []):
                    if type(size).__name__ == "PhotoStrippedSize":
                        stripped_bytes = size.bytes
                        break
            elif isinstance(msg.media, MessageMediaDocument) and msg.media.document:
                for size in getattr(msg.media.document, "thumbs", []):
                    if type(size).__name__ == "PhotoStrippedSize":
                        stripped_bytes = size.bytes
                        break
            if stripped_bytes:
                try:
                    jpeg_bytes = stripped_photo_to_jpg(stripped_bytes)
                    stripped_thumb = "data:image/jpeg;base64," + base64.b64encode(jpeg_bytes).decode('utf-8')
                except Exception:
                    pass
        
        items.append({
            "message_id": msg.id,
            "media_type": m_type,
            "media_filename": m_filename,
            "file_size": file_size,
            "mime_type": mime_type,
            "date": msg.date.isoformat() if msg.date else None,
            "text": msg.text or "",
            "stripped_thumb": stripped_thumb,
        })
        next_offset_id = msg.id
        
    return items, has_more, next_offset_id


async def send_reaction(account: TelegramAccount, chat_id: int, message_id: int, reaction_str: str | None = None) -> None:
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")
    entity = await resolve_chat_entity(client, account.id, chat_id)
    
    from telethon.tl.functions.messages import SendReactionRequest
    from telethon.tl.types import ReactionEmoji, ReactionEmpty
    
    reaction_obj = [ReactionEmoji(emoticon=reaction_str)] if reaction_str else [ReactionEmpty()]
    await client(SendReactionRequest(
        peer=entity,
        msg_id=message_id,
        reaction=reaction_obj
    ))


async def get_reactions(account: TelegramAccount, chat_id: int, message_id: int) -> dict:
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")
    entity = await resolve_chat_entity(client, account.id, chat_id)
    
    from telethon.tl.functions.messages import GetMessageReactionsListRequest
    from telethon.tl.types import ReactionEmoji
    
    res = await client(GetMessageReactionsListRequest(
        peer=entity,
        id=message_id,
        limit=100
    ))
    
    users_map = {u.id: u for u in getattr(res, "users", [])}
    chats_map = {c.id: c for c in getattr(res, "chats", [])}
    
    reactions_list = []
    for r in getattr(res, "reactions", []):
        r_str = None
        if hasattr(r, "reaction") and isinstance(r.reaction, ReactionEmoji):
            r_str = r.reaction.emoticon
            
        peer_id = None
        peer_name = "Unknown"
        if hasattr(r, "peer_id"):
            from telethon.utils import get_peer_id
            peer_id = get_peer_id(r.peer_id)
            if peer_id in users_map:
                u = users_map[peer_id]
                peer_name = f"{getattr(u, 'first_name', '') or ''} {getattr(u, 'last_name', '') or ''}".strip() or str(peer_id)
            elif peer_id in chats_map:
                peer_name = getattr(chats_map[peer_id], "title", "Group") or "Group"
        
        reactions_list.append({
            "peer_id": peer_id,
            "peer_name": peer_name,
            "reaction": r_str,
            "date": r.date.isoformat() if hasattr(r, "date") and r.date else None,
        })
        
    return {
        "count": getattr(res, "count", 0),
        "reactions": reactions_list,
    }


async def pin_message(account: TelegramAccount, chat_id: int, message_id: int, silent: bool = False, pm_oneside: bool = False) -> None:
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")
    entity = await resolve_chat_entity(client, account.id, chat_id)
    await client.pin_message(entity, message_id, silent=silent, pm_oneside=pm_oneside)


async def unpin_message(account: TelegramAccount, chat_id: int, message_id: int) -> None:
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")
    entity = await resolve_chat_entity(client, account.id, chat_id)
    await client.unpin_message(entity, message_id)


async def get_pinned_messages(account: TelegramAccount, chat_id: int, limit: int = 50) -> list:
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")
    entity = await resolve_chat_entity(client, account.id, chat_id)
    
    from telethon.tl.types import InputMessagesFilterPinned
    messages = await client.get_messages(entity, filter=InputMessagesFilterPinned(), limit=limit)
    
    me = await client.get_me()
    my_id = me.id
    
    result = []
    for msg in messages:
        sender_name = None
        sender_id = None
        if msg.sender:
            sender_id = msg.sender_id
            if hasattr(msg.sender, "first_name"):
                first = msg.sender.first_name or ""
                last = getattr(msg.sender, "last_name", "") or ""
                sender_name = f"{first} {last}".strip() or str(sender_id)
            elif hasattr(msg.sender, "title"):
                sender_name = msg.sender.title
                
        result.append({
            "id": msg.id,
            "sender_id": sender_id,
            "sender_name": sender_name,
            "text": msg.text or "",
            "date": msg.date.isoformat() if msg.date else None,
            "is_outgoing": sender_id == my_id if sender_id else msg.out,
        })
    return result


async def search_global(db: AsyncSession, account: TelegramAccount, query: str, limit: int = 50, offset_id: int = 0) -> dict:
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")
        
    stmt = select(TelegramChat).where(
        TelegramChat.account_id == account.id,
        TelegramChat.is_active == True,
        (TelegramChat.title.ilike(f"%{query}%") | TelegramChat.username.ilike(f"%{query}%"))
    ).limit(20)
    res = await db.execute(stmt)
    local_chats = res.scalars().all()
    
    chats_list = []
    for c in local_chats:
        chats_list.append({
            "chat_id": c.chat_id,
            "title": c.title,
            "username": c.username,
            "chat_type": c.type,
            "last_message": c.last_message,
            "last_message_time": c.last_message_date.isoformat() if c.last_message_date else None,
            "unread_count": c.unread_count,
            "is_muted": c.is_muted,
            "is_pinned": c.is_pinned,
            "is_archived": c.is_archived,
        })
        
    messages = await client.get_messages(None, search=query, limit=limit, offset_id=offset_id)
    
    me = await client.get_me()
    my_id = me.id
    
    messages_list = []
    for msg in messages:
        sender_name = None
        sender_id = None
        if msg.sender:
            sender_id = msg.sender_id
            if hasattr(msg.sender, "first_name"):
                first = msg.sender.first_name or ""
                last = getattr(msg.sender, "last_name", "") or ""
                sender_name = f"{first} {last}".strip() or str(sender_id)
                
        messages_list.append({
            "id": msg.id,
            "sender_id": sender_id,
            "sender_name": sender_name,
            "text": msg.text or "",
            "date": msg.date.isoformat() if msg.date else None,
            "is_outgoing": sender_id == my_id if sender_id else msg.out,
        })
        
    return {
        "chats": chats_list,
        "messages": messages_list,
    }


async def search_in_chat(
    account: TelegramAccount, chat_id: int, query: str | None = None, media_type: str | None = None,
    from_user_id: int | None = None, limit: int = 50, offset_id: int = 0
) -> list:
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")
    entity = await resolve_chat_entity(client, account.id, chat_id)
    
    flt = None
    if media_type:
        from telethon.tl import types as tl_types
        mt = media_type.lower().strip()
        if mt in ("photo", "photos"):
            flt = tl_types.InputMessagesFilterPhotos()
        elif mt in ("video", "videos"):
            flt = tl_types.InputMessagesFilterVideo()
        elif mt in ("document", "documents", "file", "files"):
            flt = tl_types.InputMessagesFilterDocument()
        elif mt in ("url", "urls", "link", "links"):
            flt = tl_types.InputMessagesFilterUrl()
        elif mt in ("music", "audio"):
            flt = tl_types.InputMessagesFilterMusic()
        elif mt in ("voice", "voices"):
            flt = tl_types.InputMessagesFilterVoice()
            
    from_entity = None
    if from_user_id:
        from_entity = await client.get_input_entity(from_user_id)
        
    messages = await client.get_messages(
        entity, search=query, filter=flt, from_user=from_entity, limit=limit, offset_id=offset_id
    )
    
    me = await client.get_me()
    my_id = me.id
    
    result = []
    for msg in messages:
        sender_name = None
        sender_id = None
        if msg.sender:
            sender_id = msg.sender_id
            if hasattr(msg.sender, "first_name"):
                first = msg.sender.first_name or ""
                last = getattr(msg.sender, "last_name", "") or ""
                sender_name = f"{first} {last}".strip() or str(sender_id)
                
        result.append({
            "id": msg.id,
            "sender_id": sender_id,
            "sender_name": sender_name,
            "text": msg.text or "",
            "date": msg.date.isoformat() if msg.date else None,
            "is_outgoing": sender_id == my_id if sender_id else msg.out,
        })
    return result


async def get_group_members(account: TelegramAccount, chat_id: int, query: str | None = None, page: int = 1, page_size: int = 50) -> tuple[list, int]:
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")
    entity = await resolve_chat_entity(client, account.id, chat_id)
    
    offset = (page - 1) * page_size
    participants = await client.get_participants(entity, search=query or "", offset=offset, limit=page_size)
    total = getattr(participants, "total", len(participants))
    
    members_list = []
    for p in participants:
        is_admin = False
        is_creator = False
        rank = None
        
        p_type = type(p.participant).__name__ if hasattr(p, "participant") else ""
        if "Admin" in p_type or "Creator" in p_type:
            is_admin = True
            if "Creator" in p_type:
                is_creator = True
            rank = getattr(p.participant, "rank", None)
            
        members_list.append({
            "user_id": p.id,
            "first_name": getattr(p, "first_name", None),
            "last_name": getattr(p, "last_name", None),
            "username": getattr(p, "username", None),
            "phone": getattr(p, "phone", None),
            "is_bot": getattr(p, "bot", False),
            "is_admin": is_admin,
            "is_creator": is_creator,
            "rank": rank,
        })
    return members_list, total


async def promote_member(account: TelegramAccount, chat_id: int, user_id: int, rights_dict: dict, rank: str | None = None) -> None:
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")
    
    entity = await resolve_chat_entity(client, account.id, chat_id)
    user_entity = await client.get_input_entity(user_id)
    
    from telethon.tl.types import Channel
    is_channel_or_supergroup = isinstance(entity, Channel) or (hasattr(entity, "megagroup") and entity.megagroup)
    
    if is_channel_or_supergroup:
        from telethon.tl.functions.channels import EditAdminRequest
        from telethon.tl.types import ChatAdminRights
        
        admin_rights = ChatAdminRights(
            change_info=rights_dict.get("change_info", False),
            post_messages=rights_dict.get("post_messages", False),
            edit_messages=rights_dict.get("edit_messages", False),
            delete_messages=rights_dict.get("delete_messages", False),
            ban_users=rights_dict.get("ban_users", False),
            invite_users=rights_dict.get("invite_users", False),
            pin_messages=rights_dict.get("pin_messages", False),
            add_admins=rights_dict.get("add_admins", False),
            anonymous=rights_dict.get("anonymous", False),
            manage_call=rights_dict.get("manage_call", False),
            manage_topics=rights_dict.get("manage_topics", False),
        )
        await client(EditAdminRequest(channel=entity, user_id=user_entity, admin_rights=admin_rights, rank=rank or ""))
    else:
        from telethon.tl.functions.messages import EditChatAdminRequest
        is_admin = any(rights_dict.values())
        await client(EditChatAdminRequest(chat_id=chat_id, user_id=user_entity, is_admin=is_admin))


async def kick_member(account: TelegramAccount, chat_id: int, user_id: int) -> None:
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")
    entity = await resolve_chat_entity(client, account.id, chat_id)
    await client.kick_participant(entity, user_id)


async def mute_chat(db: AsyncSession, account: TelegramAccount, chat_id: int, duration_seconds: int | None = None) -> None:
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")
    entity = await resolve_chat_entity(client, account.id, chat_id)
    
    import datetime
    from datetime import timezone, timedelta
    if duration_seconds:
        mute_until = datetime.datetime.now(timezone.utc) + timedelta(seconds=duration_seconds)
    else:
        mute_until = datetime.datetime.now(timezone.utc) + timedelta(days=365)
        
    from telethon.tl.functions.account import UpdateNotifySettingsRequest
    from telethon.tl.types import InputNotifyPeer, InputPeerNotifySettings
    await client(UpdateNotifySettingsRequest(
        peer=InputNotifyPeer(peer=entity),
        settings=InputPeerNotifySettings(mute_until=mute_until, silent=True)
    ))
    
    await db.execute(
        update(TelegramChat)
        .where(TelegramChat.account_id == account.id)
        .where(TelegramChat.chat_id == chat_id)
        .values(is_muted=True, updated_at=func.now())
    )
    await db.commit()


async def unmute_chat(db: AsyncSession, account: TelegramAccount, chat_id: int) -> None:
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")
    entity = await resolve_chat_entity(client, account.id, chat_id)
    
    import datetime
    from datetime import timezone
    from telethon.tl.functions.account import UpdateNotifySettingsRequest
    from telethon.tl.types import InputNotifyPeer, InputPeerNotifySettings
    await client(UpdateNotifySettingsRequest(
        peer=InputNotifyPeer(peer=entity),
        settings=InputPeerNotifySettings(mute_until=datetime.datetime.fromtimestamp(0, timezone.utc), silent=False)
    ))
    
    await db.execute(
        update(TelegramChat)
        .where(TelegramChat.account_id == account.id)
        .where(TelegramChat.chat_id == chat_id)
        .values(is_muted=False, updated_at=func.now())
    )
    await db.commit()


async def pin_chat(db: AsyncSession, account: TelegramAccount, chat_id: int, pinned: bool = True) -> None:
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")
    entity = await resolve_chat_entity(client, account.id, chat_id)
    
    from telethon.tl.functions.messages import ToggleDialogPinRequest
    from telethon.tl.types import InputDialogPeer
    await client(ToggleDialogPinRequest(peer=InputDialogPeer(peer=entity), pinned=pinned))
    
    await db.execute(
        update(TelegramChat)
        .where(TelegramChat.account_id == account.id)
        .where(TelegramChat.chat_id == chat_id)
        .values(is_pinned=pinned, updated_at=func.now())
    )
    await db.commit()


async def edit_chat_info(account: TelegramAccount, chat_id: int, title: str | None = None, about: str | None = None) -> None:
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")
    entity = await resolve_chat_entity(client, account.id, chat_id)
    
    if title:
        from telethon.tl.types import Channel
        is_channel_or_supergroup = isinstance(entity, Channel) or (hasattr(entity, "megagroup") and entity.megagroup)
        if is_channel_or_supergroup:
            from telethon.tl.functions.channels import EditTitleRequest
            await client(EditTitleRequest(channel=entity, title=title))
        else:
            from telethon.tl.functions.messages import EditChatTitleRequest
            await client(EditChatTitleRequest(chat_id=chat_id, title=title))
            
    if about is not None:
        from telethon.tl.functions.messages import EditChatAboutRequest
        await client(EditChatAboutRequest(peer=entity, about=about))


async def get_group_permissions(account: TelegramAccount, chat_id: int) -> dict:
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")
    entity = await resolve_chat_entity(client, account.id, chat_id)
    
    from telethon.tl.types import Channel
    is_channel_or_supergroup = isinstance(entity, Channel) or (hasattr(entity, "megagroup") and entity.megagroup)
    
    default_banned_rights = None
    if is_channel_or_supergroup:
        from telethon.tl.functions.channels import GetFullChannelRequest
        full_info = await client(GetFullChannelRequest(channel=entity))
        default_banned_rights = getattr(full_info.full_chat, "default_banned_rights", None)
    else:
        from telethon.tl.functions.messages import GetFullChatRequest
        full_info = await client(GetFullChatRequest(chat_id=chat_id))
        default_banned_rights = getattr(full_info.full_chat, "default_banned_rights", None)
        
    fields = [
        "view_messages", "send_messages", "send_media", "send_stickers", "send_gifs",
        "send_games", "send_inline", "embed_links", "send_polls", "change_info",
        "invite_users", "pin_messages", "manage_topics", "send_photos", "send_videos",
        "send_roundvideos", "send_audios", "send_voices", "send_docs", "send_plain"
    ]
    
    res = {}
    for f in fields:
        val = False
        if default_banned_rights:
            val = getattr(default_banned_rights, f, False)
        res[f] = val
        
    return res


async def update_group_permissions(account: TelegramAccount, chat_id: int, permissions_dict: dict) -> None:
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")
    entity = await resolve_chat_entity(client, account.id, chat_id)
    
    from telethon.tl.types import ChatBannedRights
    banned_rights = ChatBannedRights(
        until_date=None,
        view_messages=permissions_dict.get("view_messages", False),
        send_messages=permissions_dict.get("send_messages", False),
        send_media=permissions_dict.get("send_media", False),
        send_stickers=permissions_dict.get("send_stickers", False),
        send_gifs=permissions_dict.get("send_gifs", False),
        send_games=permissions_dict.get("send_games", False),
        send_inline=permissions_dict.get("send_inline", False),
        embed_links=permissions_dict.get("embed_links", False),
        send_polls=permissions_dict.get("send_polls", False),
        change_info=permissions_dict.get("change_info", False),
        invite_users=permissions_dict.get("invite_users", False),
        pin_messages=permissions_dict.get("pin_messages", False),
        manage_topics=permissions_dict.get("manage_topics", False),
        send_photos=permissions_dict.get("send_photos", False),
        send_videos=permissions_dict.get("send_videos", False),
        send_roundvideos=permissions_dict.get("send_roundvideos", False),
        send_audios=permissions_dict.get("send_audios", False),
        send_voices=permissions_dict.get("send_voices", False),
        send_docs=permissions_dict.get("send_docs", False),
        send_plain=permissions_dict.get("send_plain", False),
    )
    
    from telethon.tl.functions.messages import EditChatDefaultBannedRightsRequest
    await client(EditChatDefaultBannedRightsRequest(peer=entity, banned_rights=banned_rights))


async def get_installed_sticker_packs(account: TelegramAccount) -> list:
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")
        
    from telethon.tl.functions.messages import GetAllStickersRequest
    res = await client(GetAllStickersRequest(hash=0))
    
    packs = []
    for s in getattr(res, "sets", []):
        packs.append({
            "id": s.id,
            "title": getattr(s, "title", "Stickers") or "Stickers",
            "short_name": getattr(s, "short_name", "") or "",
            "count": getattr(s, "count", 0) or 0,
            "archived": bool(getattr(s, "archived", False)),
            "official": bool(getattr(s, "official", False)),
        })
    return packs


async def get_invite_links(account: TelegramAccount, chat_id: int) -> list:
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")
    entity = await resolve_chat_entity(client, account.id, chat_id)
    
    from telethon.tl.functions.messages import GetExportedChatInvitesRequest
    from telethon.tl.types import InputUserSelf
    
    try:
        res = await client(GetExportedChatInvitesRequest(
            peer=entity,
            admin_id=InputUserSelf(),
            limit=100
        ))
        
        links = []
        for inv in getattr(res, "invites", []):
            links.append({
                "link": inv.link,
                "title": getattr(inv, "title", None),
                "creator_id": getattr(inv, "admin_id", None),
                "date": inv.date,
                "expire_date": getattr(inv, "expire_date", None),
                "usage_limit": getattr(inv, "usage_limit", None),
                "usage": getattr(inv, "usage", None),
                "request_needed": bool(getattr(inv, "request_needed", False)),
                "revoked": bool(getattr(inv, "revoked", False)),
                "permanent": bool(getattr(inv, "permanent", False)),
            })
        return links
    except Exception as e:
        # Fallback or empty if not supported
        return []


async def create_invite_link(
    account: TelegramAccount,
    chat_id: int,
    title: str | None = None,
    expire_date: int | None = None,
    usage_limit: int | None = None
) -> dict:
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")
    entity = await resolve_chat_entity(client, account.id, chat_id)
    
    from telethon.tl.functions.messages import ExportChatInviteRequest
    import datetime
    
    expire_dt = None
    if expire_date:
        expire_dt = datetime.datetime.fromtimestamp(expire_date, tz=datetime.timezone.utc)
        
    res = await client(ExportChatInviteRequest(
        peer=entity,
        title=title,
        expire_date=expire_dt,
        usage_limit=usage_limit,
        request_needed=False
    ))
    
    inv = getattr(res, "invite", res)
    return {
        "link": inv.link,
        "title": getattr(inv, "title", None),
        "creator_id": getattr(inv, "admin_id", None),
        "date": inv.date,
        "expire_date": getattr(inv, "expire_date", None),
        "usage_limit": getattr(inv, "usage_limit", None),
        "usage": getattr(inv, "usage", None),
        "request_needed": bool(getattr(inv, "request_needed", False)),
        "revoked": bool(getattr(inv, "revoked", False)),
        "permanent": bool(getattr(inv, "permanent", False)),
    }


async def get_sticker_set(account: TelegramAccount, short_name: str) -> dict:
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")
    from telethon.tl.functions.messages import GetStickerSetRequest
    from telethon.tl.types import InputStickerSetShortName, DocumentAttributeImageSize, DocumentAttributeVideo
    
    res = await client(GetStickerSetRequest(
        stickerset=InputStickerSetShortName(short_name=short_name),
        hash=0
    ))
    
    stickers = []
    for doc in getattr(res, "documents", []):
        w, h = 512, 512
        for attr in getattr(doc, "attributes", []):
            if isinstance(attr, DocumentAttributeImageSize):
                w, h = attr.w, attr.h
            elif isinstance(attr, DocumentAttributeVideo):
                w, h = attr.w, attr.h
        stickers.append({
            "id": doc.id,
            "access_hash": doc.access_hash,
            "width": w,
            "height": h,
            "mime_type": doc.mime_type,
            "file_size": doc.size,
        })
        
    s_set = getattr(res, "set", None)
    return {
        "set_id": getattr(s_set, "id", 0) if s_set else 0,
        "access_hash": getattr(s_set, "access_hash", 0) if s_set else 0,
        "title": getattr(s_set, "title", "") if s_set else "",
        "short_name": getattr(s_set, "short_name", "") if s_set else "",
        "stickers": stickers
    }


async def download_sticker(account: TelegramAccount, document_id: int, access_hash: int) -> bytes:
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")
    from telethon.tl.types import InputDocument
    doc = InputDocument(id=document_id, access_hash=access_hash, file_reference=b'')
    file_bytes = await client.download_media(doc, bytes)
    if not file_bytes:
        raise RuntimeError("Failed to download sticker media.")
    return file_bytes


async def send_poll(
    account: TelegramAccount,
    chat_id: int,
    question: str,
    options: list[str],
    is_anonymous: bool = True,
    is_quiz: bool = False,
    correct_option_idx: int | None = None
) -> dict:
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")
    entity = await resolve_chat_entity(client, account.id, chat_id)
    
    import random
    from telethon.tl.types import InputMediaPoll, Poll, PollAnswer
    
    answers = [PollAnswer(text=opt, option=bytes([i])) for i, opt in enumerate(options)]
    poll = Poll(
        id=random.randint(1, 100000000),
        question=question,
        answers=answers,
        closed=False,
        public_voters=not is_anonymous,
        multiple_choice=False,
        quiz=is_quiz
    )
    
    correct_answers = None
    if is_quiz and correct_option_idx is not None:
        correct_answers = [bytes([correct_option_idx])]
        
    media = InputMediaPoll(poll=poll, correct_answers=correct_answers)
    res = await client.send_message(entity, file=media)
    
    return {
        "id": res.id,
        "text": res.message or "",
        "date": res.date.isoformat() if res.date else None,
    }


async def vote_poll(account: TelegramAccount, chat_id: int, msg_id: int, options: list[str]) -> None:
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")
    entity = await resolve_chat_entity(client, account.id, chat_id)
    
    from telethon.tl.functions.messages import SendVoteRequest
    opt_bytes = [opt.encode("utf-8") if isinstance(opt, str) else opt for opt in options]
    await client(SendVoteRequest(peer=entity, msg_id=msg_id, options=opt_bytes))


async def send_voice_note(account: TelegramAccount, chat_id: int, file_path: str) -> dict:
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")
    entity = await resolve_chat_entity(client, account.id, chat_id)
    
    res = await client.send_file(entity, file_path, voice_note=True)
    return {
        "id": res.id,
        "text": res.message or "",
        "date": res.date.isoformat() if res.date else None,
    }


async def send_sticker(account: TelegramAccount, chat_id: int, document_id: int, access_hash: int) -> dict:
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")
    entity = await resolve_chat_entity(client, account.id, chat_id)
    
    from telethon.tl.types import InputDocument
    doc = InputDocument(id=document_id, access_hash=access_hash, file_reference=b'')
    res = await client.send_file(entity, doc)
    return {
        "id": res.id,
        "text": res.message or "",
        "date": res.date.isoformat() if res.date else None,
    }


async def _format_telethon_messages(client, messages, my_id) -> list:
    import base64
    from telethon.tl.types import (
        MessageMediaPhoto,
        MessageMediaDocument,
        MessageMediaPoll,
        MessageMediaWebPage,
        PeerUser,
        PeerChat,
        PeerChannel
    )
    from telethon.utils import decode_waveform, stripped_photo_to_jpg
    
    result = []
    for msg in messages:
        if not hasattr(msg, "id"):
            continue
            
        sender_name = "Unknown"
        sender_id = None
        if msg.sender_id:
            sender_id = msg.sender_id
            try:
                sender_entity = await client.get_entity(msg.sender_id)
                sender_name = getattr(sender_entity, "first_name", "") or ""
                if getattr(sender_entity, "last_name", None):
                    sender_name += " " + sender_entity.last_name
                if not sender_name:
                    sender_name = getattr(sender_entity, "title", "Unknown")
            except Exception:
                sender_name = f"User {msg.sender_id}"

        media_type = _classify_media(msg.media) if msg.media else None
        
        media_filename = None
        if msg.media and hasattr(msg.media, "document") and msg.media.document:
            for attr in getattr(msg.media.document, "attributes", []):
                if type(attr).__name__ == "DocumentAttributeFilename":
                    media_filename = attr.file_name
                    break
            if not media_filename:
                media_filename = f"file_{msg.media.document.id}"
                
        stripped_thumb_base64 = None
        if msg.media:
            stripped_bytes = None
            if isinstance(msg.media, MessageMediaPhoto) and msg.media.photo:
                for size in getattr(msg.media.photo, "sizes", []):
                    if type(size).__name__ == "PhotoStrippedSize":
                        stripped_bytes = size.bytes
                        break
            elif isinstance(msg.media, MessageMediaDocument) and msg.media.document:
                for size in getattr(msg.media.document, "thumbs", []):
                    if type(size).__name__ == "PhotoStrippedSize":
                        stripped_bytes = size.bytes
                        break
            if stripped_bytes:
                try:
                    jpeg_bytes = stripped_photo_to_jpg(stripped_bytes)
                    stripped_thumb_base64 = "data:image/jpeg;base64," + base64.b64encode(jpeg_bytes).decode('utf-8')
                except Exception:
                    pass

        waveform_levels = []
        if media_type == "voice" and msg.media and hasattr(msg.media, "document") and msg.media.document:
            for attr in getattr(msg.media.document, "attributes", []):
                if type(attr).__name__ == "DocumentAttributeAudio" and getattr(attr, "voice", False):
                    raw_wave = getattr(attr, "waveform", None)
                    if raw_wave:
                        try:
                            waveform_levels = list(decode_waveform(raw_wave))
                        except Exception:
                            pass
                    break

        file_size = None
        mime_type = None
        if msg.media and hasattr(msg.media, "document") and msg.media.document:
            file_size = msg.media.document.size
            mime_type = msg.media.document.mime_type
        elif msg.media and hasattr(msg.media, "photo") and msg.media.photo:
            sizes = getattr(msg.media.photo, "sizes", [])
            if sizes:
                file_size = getattr(sizes[-1], "size", None)
            mime_type = "image/jpeg"

        poll_info = None
        if media_type == "poll" and msg.media:
            poll_obj = getattr(msg.media, "poll", None)
            results_obj = getattr(msg.media, "results", None)
            if poll_obj:
                voters_map = {}
                if results_obj and getattr(results_obj, "results", []):
                    for v in results_obj.results:
                        opt_id = v.option.decode("utf-8") if isinstance(v.option, bytes) else str(v.option)
                        voters_map[opt_id] = v.voters
                chosen_options = []
                if results_obj and getattr(results_obj, "results", []):
                    for v in results_obj.results:
                        if getattr(v, "chosen", False):
                            chosen_options.append(v.option.decode("utf-8") if isinstance(v.option, bytes) else str(v.option))
                correct_answers = getattr(results_obj, "correct_answers", []) or []
                correct_options = [c.decode("utf-8") if isinstance(c, bytes) else str(c) for c in correct_answers]
                options = []
                for i, ans in enumerate(getattr(poll_obj, "answers", [])):
                    opt_id = ans.option.decode("utf-8") if isinstance(ans.option, bytes) else str(ans.option)
                    options.append({
                        "text": ans.text,
                        "voters": voters_map.get(opt_id, 0),
                        "chosen": opt_id in chosen_options or str(i) in chosen_options,
                        "correct": opt_id in correct_options or str(i) in correct_options,
                    })
                poll_info = {
                    "question": poll_obj.question,
                    "options": options,
                    "total_voters": getattr(results_obj, "total_voters", 0) if results_obj else 0,
                    "closed": bool(poll_obj.closed),
                    "is_quiz": bool(poll_obj.quiz),
                }

        # Service message detection
        is_service = False
        service_text = None
        if type(msg).__name__ == "MessageService" or getattr(msg, "action", None):
            is_service = True
            action_name = type(msg.action).__name__ if getattr(msg, "action", None) else "MessageAction"
            subj = sender_name or "Someone"
            if action_name == "MessageActionChatCreate":
                service_text = f"Group '{msg.action.title}' was created"
            elif action_name == "MessageActionChatAddUser":
                service_text = f"{subj} joined the group"
            elif action_name == "MessageActionChatDeleteUser":
                service_text = f"{subj} left the group"
            elif action_name == "MessageActionPinMessage":
                service_text = f"{subj} pinned a message"
            elif action_name == "MessageActionChatEditTitle":
                service_text = f"{subj} changed group name to '{msg.action.title}'"
            elif action_name == "MessageActionChatEditPhoto":
                service_text = f"{subj} changed group photo"
            elif action_name == "MessageActionChatDeletePhoto":
                service_text = f"{subj} removed group photo"
            else:
                service_text = f"Service message"

        result.append({
            "id": msg.id,
            "sender_id": sender_id,
            "sender_name": sender_name,
            "text": msg.text or "",
            "date": msg.date.isoformat() if msg.date else None,
            "is_outgoing": sender_id == my_id if sender_id else msg.out,
            "reply_to_msg_id": getattr(msg, "reply_to_msg_id", None) or (getattr(msg.reply_to, "reply_to_msg_id", None) if getattr(msg, "reply_to", None) else None),
            "reply_preview": None,
            "media_type": media_type,
            "media_filename": media_filename,
            "stripped_thumb": stripped_thumb_base64,
            "waveform_levels": waveform_levels,
            "file_size": file_size,
            "mime_type": mime_type,
            "poll": poll_info,
            "is_service": is_service,
            "service_text": service_text,
        })
    return result


async def search_messages(
    account: TelegramAccount,
    chat_id: int,
    query: str | None = None,
    media_type: str | None = None,
    date_from: int | None = None,
    date_to: int | None = None
) -> list:
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")
    entity = await resolve_chat_entity(client, account.id, chat_id)
    
    from telethon.tl.functions.messages import SearchRequest
    from telethon.tl.types import (
        InputMessagesFilterEmpty,
        InputMessagesFilterPhotos,
        InputMessagesFilterVideo,
        InputMessagesFilterDocument,
        InputMessagesFilterVoice,
        InputMessagesFilterMusic,
        InputMessagesFilterUrl,
        InputMessagesFilterGif
    )
    import datetime
    
    msg_filter = InputMessagesFilterEmpty()
    if media_type == "photo":
        msg_filter = InputMessagesFilterPhotos()
    elif media_type == "video":
        msg_filter = InputMessagesFilterVideo()
    elif media_type == "document":
        msg_filter = InputMessagesFilterDocument()
    elif media_type == "voice":
        msg_filter = InputMessagesFilterVoice()
    elif media_type == "music":
        msg_filter = InputMessagesFilterMusic()
    elif media_type == "url":
        msg_filter = InputMessagesFilterUrl()
    elif media_type == "gif":
        msg_filter = InputMessagesFilterGif()
        
    min_date = None
    if date_from:
        min_date = datetime.datetime.fromtimestamp(date_from, tz=datetime.timezone.utc)
    max_date = None
    if date_to:
        max_date = datetime.datetime.fromtimestamp(date_to, tz=datetime.timezone.utc)
        
    res = await client(SearchRequest(
        peer=entity,
        q=query or "",
        filter=msg_filter,
        min_date=min_date,
        max_date=max_date,
        offset_id=0,
        add_offset=0,
        limit=50,
        max_id=0,
        min_id=0,
        hash=0
    ))
    
    me = await client.get_me()
    my_id = me.id if me else None
    return await _format_telethon_messages(client, getattr(res, "messages", []), my_id)


async def search_global_messages(account: TelegramAccount, query: str) -> list:
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")
        
    from telethon.tl.functions.messages import SearchGlobalRequest
    from telethon.tl.types import InputMessagesFilterEmpty, InputPeerEmpty
    
    res = await client(SearchGlobalRequest(
        q=query,
        filter=InputMessagesFilterEmpty(),
        min_date=None,
        max_date=None,
        offset_rate=0,
        offset_peer=InputPeerEmpty(),
        offset_id=0,
        limit=50
    ))
    
    me = await client.get_me()
    my_id = me.id if me else None
    return await _format_telethon_messages(client, getattr(res, "messages", []), my_id)


async def get_scheduled_messages(account: TelegramAccount, chat_id: int) -> list:
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")
    entity = await resolve_chat_entity(client, account.id, chat_id)
    
    from telethon.tl.functions.messages import GetScheduledHistoryRequest
    res = await client(GetScheduledHistoryRequest(peer=entity, hash=0))
    
    me = await client.get_me()
    my_id = me.id if me else None
    return await _format_telethon_messages(client, getattr(res, "messages", []), my_id)


async def send_scheduled_message(
    account: TelegramAccount,
    chat_id: int,
    text: str,
    schedule_date: int,
    reply_to: int | None = None
) -> dict:
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")
    entity = await resolve_chat_entity(client, account.id, chat_id)
    
    import datetime
    dt = datetime.datetime.fromtimestamp(schedule_date, tz=datetime.timezone.utc)
    res = await client.send_message(entity, text, schedule=dt, reply_to=reply_to)
    
    return {
        "id": res.id,
        "text": res.message or "",
        "date": res.date.isoformat() if res.date else None,
    }


async def delete_scheduled_messages(account: TelegramAccount, chat_id: int, message_ids: list[int]) -> None:
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")
    entity = await resolve_chat_entity(client, account.id, chat_id)
    
    from telethon.tl.functions.messages import DeleteScheduledMessagesRequest
    await client(DeleteScheduledMessagesRequest(peer=entity, id=message_ids))


async def get_active_sessions(account: TelegramAccount) -> list:
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")
        
    from telethon.tl.functions.account import GetAuthorizationsRequest
    res = await client(GetAuthorizationsRequest())
    
    authorizations = []
    for auth in getattr(res, "authorizations", []):
        authorizations.append({
            "hash": auth.hash,
            "device_model": auth.device_model,
            "platform": auth.platform,
            "system_version": auth.system_version,
            "api_id": auth.api_id,
            "app_name": auth.app_name,
            "app_version": auth.app_version,
            "date_created": auth.date_created.isoformat() if auth.date_created else None,
            "date_active": auth.date_active.isoformat() if auth.date_active else None,
            "ip": auth.ip,
            "country": auth.country,
            "region": auth.region,
        })
    return authorizations


async def terminate_other_sessions(account: TelegramAccount) -> None:
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")
        
    from telethon.tl.functions.account import ResetAuthorizationRequest
    await client(ResetAuthorizationRequest())



