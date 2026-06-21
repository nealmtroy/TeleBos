"""Chat folder routes — create/edit/delete Telegram folders."""

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from telethon.tl.functions.messages import (
    GetDialogFiltersRequest,
    UpdateDialogFilterRequest,
)
from telethon.tl.types import DialogFilter, DialogFilterDefault

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.schemas.chat import ChatFolderCreate, ChatFolderUpdate, ChatFolderResponse
from app.api.routes.accounts import _get_account, _get_client

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/accounts/{account_id}/folders", tags=["folders"])


@router.get("", response_model=list[ChatFolderResponse])
async def list_folders(
    account_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    account = await _get_account(account_id, user, db)
    client = await _get_client(account)
    try:
        result = await client(GetDialogFiltersRequest())
        folders = []
        for f in result:
            if isinstance(f, DialogFilter):
                folders.append(
                    ChatFolderResponse(
                        id=f.id,
                        title=f.title or "",
                        included_chats=[str(c) for c in (f.include_peers or [])],
                        excluded_chats=[str(c) for c in (f.exclude_peers or [])],
                    )
                )
        return folders
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("", response_model=ChatFolderResponse, status_code=201)
async def create_folder(
    account_id: str,
    body: ChatFolderCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    account = await _get_account(account_id, user, db)
    client = await _get_client(account)
    try:
        # Create filter with a new ID
        result = await client(GetDialogFiltersRequest())
        max_id = max([f.id for f in result if isinstance(f, DialogFilter)], default=1) + 1

        dfilter = DialogFilter(
            id=max_id,
            title=body.title,
            include_peers=[int(c) if c.lstrip("-").isdigit() else c for c in body.included_chats],
            exclude_peers=[int(c) if c.lstrip("-").isdigit() else c for c in body.excluded_chats],
        )
        await client(UpdateDialogFilterRequest(id=max_id, filter=dfilter))
        return ChatFolderResponse(
            id=max_id,
            title=body.title,
            included_chats=body.included_chats,
            excluded_chats=body.excluded_chats,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{folder_id}", response_model=ChatFolderResponse)
async def update_folder(
    account_id: str,
    folder_id: int,
    body: ChatFolderUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    account = await _get_account(account_id, user, db)
    client = await _get_client(account)
    try:
        # Fetch current filter state
        result = await client(GetDialogFiltersRequest())
        current = next(
            (f for f in result if isinstance(f, DialogFilter) and f.id == folder_id),
            None,
        )
        if not current:
            raise HTTPException(status_code=404, detail="Folder not found")

        title = body.title or current.title
        included = (
            [int(c) if c.lstrip("-").isdigit() else c for c in body.included_chats]
            if body.included_chats is not None
            else list(current.include_peers or [])
        )
        excluded = (
            [int(c) if c.lstrip("-").isdigit() else c for c in body.excluded_chats]
            if body.excluded_chats is not None
            else list(current.exclude_peers or [])
        )

        dfilter = DialogFilter(
            id=folder_id,
            title=title,
            include_peers=included,
            exclude_peers=excluded,
        )
        await client(UpdateDialogFilterRequest(id=folder_id, filter=dfilter))
        return ChatFolderResponse(
            id=folder_id,
            title=title,
            included_chats=[str(c) for c in included],
            excluded_chats=[str(c) for c in excluded],
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{folder_id}", status_code=204)
async def delete_folder(
    account_id: str,
    folder_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    account = await _get_account(account_id, user, db)
    client = await _get_client(account)
    try:
        await client(UpdateDialogFilterRequest(id=folder_id))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
