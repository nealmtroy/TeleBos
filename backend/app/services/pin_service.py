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


