"""Chat and folder business logic."""

import logging
from typing import Any

import telethon
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.telegram_account import TelegramAccount
from app.models.chat_folder import ChatFolder
from app.services.telegram_client import client_pool
from app.utils.encryption import decrypt

logger = logging.getLogger(__name__)


async def get_dialogs(
    account: TelegramAccount, *, page: int = 1, page_size: int = 50,
    chat_type: str | None = None,
) -> tuple[list[dict], int]:
    """Fetch dialogs from Telegram API.

    If *chat_type* is provided it may be a comma-separated list of types
    (e.g. ``"group,supergroup"``) — only dialogs whose classified type
    matches one of the values are returned.
    """
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")

    # Parse chat_type filter
    allowed_types: set[str] | None = None
    if chat_type:
        allowed_types = {t.strip() for t in chat_type.split(",")}

    dialogs = await client.get_dialogs(limit=page * page_size)

    result = []
    for d in dialogs:
        chat_type_val = _classify_chat(d.entity)

        # Apply type filter early so pagination is correct
        if allowed_types and chat_type_val not in allowed_types:
            continue

        last_msg = ""
        last_time = None
        if d.message:
            last_msg = d.message.text or "[non-text message]" if d.message.text else ""
            last_time = d.message.date

        is_pinned = getattr(d, "pinned", False)
        is_muted = False
        notify_settings = getattr(d.dialog, "notify_settings", None)
        if notify_settings:
            mute_until = getattr(notify_settings, "mute_until", None)
            if mute_until:
                if hasattr(mute_until, "timestamp"):
                    import datetime
                    is_muted = mute_until.timestamp() > datetime.datetime.now().timestamp()
                elif isinstance(mute_until, (int, float)):
                    import time
                    is_muted = mute_until > time.time()
            elif getattr(notify_settings, "silent", False):
                is_muted = True

        folder_id = getattr(d.dialog, "folder_id", None)
        folder_id = folder_id if folder_id is not None else 0

        result.append({
            "chat_id": d.id,
            "title": d.name or d.title or "",
            "username": getattr(d.entity, "username", None),
            "chat_type": chat_type_val,
            "last_message": last_msg,
            "last_message_time": last_time.isoformat() if last_time else None,
            "unread_count": d.unread_count or 0,
            "is_muted": is_muted,
            "is_pinned": is_pinned,
            "folder_id": folder_id,
            "is_archived": folder_id == 1,
            "is_creator": getattr(d.entity, "creator", False),
        })

    total = len(result)

    # Paginate after filtering
    start = (page - 1) * page_size
    end = start + page_size
    page_dialogs = result[start:end]

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


async def get_dialog_stats(account: "TelegramAccount") -> dict:
    """Fetch aggregate dialog statistics for an account.

    Returns best-effort counts for contacts, groups (total + owned),
    and channels (total + owned).  Contacts count defaults to 0 if
    the underlying RPC fails.
    """
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")

    # ── Fetch all dialogs and classify ──────────────────────────────────
    dialogs = await client.get_dialogs(limit=None)
    total_groups = 0
    owned_groups = 0
    total_channels = 0
    owned_channels = 0

    for d in dialogs:
        chat_type = _classify_chat(d.entity)
        is_creator = getattr(d.entity, "creator", False)
        if chat_type in ("group", "supergroup"):
            total_groups += 1
            if is_creator:
                owned_groups += 1
        elif chat_type == "channel":
            total_channels += 1
            if is_creator:
                owned_channels += 1

    # ── Contacts count (best-effort) ───────────────────────────────────
    contacts_count = 0
    try:
        from telethon.tl.functions.contacts import GetContactsRequest
        result = await client(GetContactsRequest(0))
        if result and result.users:
            contacts_count = len(result.users)
    except Exception:
        logger.warning("Failed to fetch contacts count for account %s", account.id)

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
        folders = await client(telethon.tl.functions.messages.GetDialogFiltersRequest())
    except Exception as exc:
        logger.warning("Cannot fetch folders for %s: %s", account.id, exc)
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

            cf = ChatFolder(
                account_id=account.id,
                folder_id=folder.id,
                title=folder.title,
                emoji=None,
                color=None,
                included_chat_ids=included,
                excluded_chat_ids=excluded,
                pinned_chat_ids=pinned,
            )
            db.add(cf)

    await db.flush()


# ── Message operations ───────────────────────────────────────────────────────


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

    entity = await client.get_entity(chat_id)
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

    entity = await client.get_entity(chat_id)
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

    entity = await client.get_entity(chat_id)
    
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
            if hasattr(info, "chat"):
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


async def mark_read(account: TelegramAccount, chat_id: int) -> None:
    """Mark all messages in a chat as read."""
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")

    entity = await client.get_entity(chat_id)
    await client.send_read_acknowledge(entity)


# ── Archive / Unarchive / Delete ───────────────────────────────────────────────


async def archive_chat(account: TelegramAccount, chat_id: int) -> None:
    """Move a chat to the Archived folder (folder_id=1)."""
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")

    from telethon.tl.functions.messages import EditFolderRequest
    from telethon.tl.types import InputFolderPeer

    peer = await client.get_input_entity(chat_id)
    await client(EditFolderRequest(folder_peers=[InputFolderPeer(peer, folder_id=1)]))


async def unarchive_chat(account: TelegramAccount, chat_id: int) -> None:
    """Move a chat out of the Archived folder back to Main (folder_id=0)."""
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")

    from telethon.tl.functions.messages import EditFolderRequest
    from telethon.tl.types import InputFolderPeer

    peer = await client.get_input_entity(chat_id)
    await client(EditFolderRequest(folder_peers=[InputFolderPeer(peer, folder_id=0)]))


async def delete_chat(account: TelegramAccount, chat_id: int) -> None:
    """Delete a chat / conversation completely."""
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")

    entity = await client.get_input_entity(chat_id)
    await client.delete_dialog(entity, revoke=True)


async def batch_archive_chats(account: TelegramAccount, chat_ids: list[int]) -> None:
    """Archive multiple chats at once."""
    for chat_id in chat_ids:
        try:
            await archive_chat(account, chat_id)
        except Exception as exc:
            logger.warning("Failed to archive chat %s: %s", chat_id, exc)


async def batch_delete_chats(account: TelegramAccount, chat_ids: list[int]) -> None:
    """Delete multiple chats at once."""
    for chat_id in chat_ids:
        try:
            await delete_chat(account, chat_id)
        except Exception as exc:
            logger.warning("Failed to delete chat %s: %s", chat_id, exc)
