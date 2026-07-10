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
            "is_muted": False,
            "is_pinned": False,
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
        from telethon.tl.functions.messages import GetAllChatsRequest
        result = await client(GetAllChatsRequest(except_ids=[]))
        chats_list = getattr(result, "chats", [])

        for c in chats_list:
            chat_type_val = _classify_chat(c)
            if chat_type_val not in ("group", "supergroup", "channel"):
                continue

            left = getattr(c, "left", False)
            deactivated = getattr(c, "deactivated", False)
            is_active = not (left or deactivated)
            is_creator = getattr(c, "creator", False)
            access_hash = getattr(c, "access_hash", None)

            values.append({
                "id": uuid.uuid4(),
                "account_id": account.id,
                "chat_id": c.id,
                "title": getattr(c, "title", "Unknown") or "Unknown",
                "username": getattr(c, "username", None),
                "type": chat_type_val,
                "unread_count": 0,
                "last_message": None,
                "last_message_date": None,
                "access_hash": access_hash,
                "is_active": is_active,
                "is_creator": is_creator,
                "is_archived": False,
            })
            if is_active:
                synced_group_channel_ids.add(c.id)
    except Exception as exc:
        logger.error("Error during GetAllChatsRequest for account %s: %s", account.id, exc)
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
