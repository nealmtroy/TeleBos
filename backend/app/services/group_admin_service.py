import logging
import uuid
from typing import Any
from datetime import datetime, timezone
import datetime as dt_module

from sqlalchemy import select, func, update, delete
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.telegram_account import TelegramAccount
from app.models.chat_folder import ChatFolder
from app.models.telegram_chat import TelegramChat
from app.services.telegram_client import client_pool
from app.utils.encryption import decrypt
from app.services.chat_service import resolve_chat_entity

logger = logging.getLogger(__name__)

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
    fetch_limit = max(page_size * page, 100)
    participants = await client.get_participants(entity, search=query or "", limit=fetch_limit)
    total = getattr(participants, "total", len(participants))
    
    members_list = []
    page_participants = participants[offset : offset + page_size] if offset < len(participants) else participants
    for p in page_participants:
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



