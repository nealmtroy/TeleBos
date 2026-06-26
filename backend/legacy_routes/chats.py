"""Chat (dialog) routes with real-time updates."""

import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from telethon.tl.types import (
    Chat as TGChat,
    Channel as TGChannel,
    User as TGUser,
)

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.redis import redis_client
from app.models.user import User
from app.schemas.chat import ChatResponse
from app.api.routes.accounts import _get_account, _get_client

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/accounts/{account_id}/chats", tags=["chats"])


def _chat_type(entity) -> str:
    """Determine chat type string from Telethon entity."""
    if isinstance(entity, TGUser):
        if entity.bot:
            return "bot"
        return "user"
    if isinstance(entity, TGChannel):
        if entity.broadcast:
            return "channel"
        if entity.megagroup:
            return "supergroup"
        return "group"
    if isinstance(entity, TGChat):
        return "group"
    return "unknown"


@router.get("", response_model=list[ChatResponse])
async def list_chats(
    account_id: str,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    search: str = Query("", max_length=200),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    account = await _get_account(account_id, user, db)
    client = await _get_client(account)

    # Try cache first (skip if searching)
    cache_key = f"chats:{account_id}:{offset}:{limit}"
    if not search:
        cached = await redis_client.cache_get(cache_key)
        if cached:
            return [ChatResponse(**c) for c in cached]

    try:
        dialogs = await client.get_dialogs(
            limit=limit,
            offset_date=None if offset == 0 else None,
        )
        chats = []
        for dialog in dialogs:
            entity = dialog.entity
            msg_text = None
            if dialog.message and dialog.message.message:
                msg_text = dialog.message.message[:200]

            chats.append(
                ChatResponse(
                    id=str(dialog.id),
                    title=dialog.name or entity.first_name or "Unknown",
                    type=_chat_type(entity),
                    unread_count=dialog.unread_count,
                    last_message=msg_text,
                    last_message_date=dialog.message.date if dialog.message else None,
                    photo_url=None,
                )
            )

        if not search:
            # Cache the result
            await redis_client.cache_set(
                cache_key,
                [c.model_dump(mode="json") for c in chats],
                ttl=60,  # 1 minute cache
            )

        # Filter by search if provided
        if search:
            search_lower = search.lower()
            chats = [c for c in chats if search_lower in c.title.lower()]

        return chats[offset:offset + limit]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{chat_id}", response_model=ChatResponse)
async def get_chat(
    account_id: str,
    chat_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    account = await _get_account(account_id, user, db)
    client = await _get_client(account)
    try:
        entity = await client.get_entity(int(chat_id))
        return ChatResponse(
            id=str(chat_id),
            title=getattr(entity, "title", None) or getattr(entity, "first_name", "Unknown"),
            type=_chat_type(entity),
            unread_count=0,
            last_message=None,
            last_message_date=None,
            photo_url=None,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
