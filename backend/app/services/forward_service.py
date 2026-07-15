"""Forward service module."""

import logging
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.telegram_account import TelegramAccount
from app.services.telegram_client import client_pool
from app.utils.encryption import decrypt
from app.services.chat_service import resolve_chat_entity

logger = logging.getLogger(__name__)


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
