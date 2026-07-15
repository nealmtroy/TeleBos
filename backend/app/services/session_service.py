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



