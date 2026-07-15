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


