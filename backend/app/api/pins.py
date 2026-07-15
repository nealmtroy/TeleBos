"""Pins endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query, status, Request, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, get_current_user_from_token_or_header
from app.models.user import User
from app.schemas.chat import (
    ChatListResponse,
    MessageListResponse,
    SendMessageRequest,
    SendMessageResponse,
    FolderCreate,
    FolderUpdate,
    FolderResponse,
    FolderListResponse,
    BatchChatActionRequest,
    JoinChatRequest,
    JoinChatResponse,
    DeleteMessageRequest,
    BatchDeleteMessagesRequest,
    EditMessageRequest,
    ForwardMessagesRequest,
    SendReactionRequestSchema,
    PinMessageRequest,
    PromoteMemberRequest,
    UpdateGroupPermissionsRequest,
    MuteChatRequest,
    EditChatInfoRequest,
    SharedMediaResponse,
    ChatSearchResponse,
    GroupMemberListResponse,
    GroupPermissionsResponse,
    StickerPacksResponse,
    InviteLinkListResponse,
    CreateInviteLinkRequest,
    CreatePollRequest,
    VotePollRequest,
    StickerSetResponse,
    SendStickerRequest,
    SendScheduledMessageRequest,
    InviteLinkItem,
)
from app.services import account_service, pin_service as chat_service
from app.utils.rate_limiter import rate_limiter
from app.utils.sanitize import sanitize_exception

router = APIRouter(tags=["pins"])

@router.post("/accounts/{account_id}/chats/{chat_id}/messages/{msg_id}/pin", status_code=status.HTTP_204_NO_CONTENT)
async def pin_chat_message(
    account_id: str,
    chat_id: int,
    msg_id: int,
    payload: PinMessageRequest = PinMessageRequest(),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        await chat_service.pin_message(account, chat_id, msg_id, silent=payload.silent, pm_oneside=payload.pm_oneside)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))


@router.post("/accounts/{account_id}/chats/{chat_id}/messages/{msg_id}/unpin", status_code=status.HTTP_204_NO_CONTENT)
async def unpin_chat_message(
    account_id: str,
    chat_id: int,
    msg_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        await chat_service.unpin_message(account, chat_id, msg_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))


@router.get("/accounts/{account_id}/chats/{chat_id}/pinned")
async def get_pinned_chat_messages(
    account_id: str,
    chat_id: int,
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        return await chat_service.get_pinned_messages(account, chat_id, limit=limit)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))


# ── Chat Pinning (dialogs) ────────────────────────────────────────────────────
@router.post("/accounts/{account_id}/chats/{chat_id}/pin", status_code=status.HTTP_204_NO_CONTENT)
async def pin_chat_dialog(
    account_id: str,
    chat_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        await chat_service.pin_chat(db, account, chat_id, pinned=True)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))


@router.post("/accounts/{account_id}/chats/{chat_id}/unpin", status_code=status.HTTP_204_NO_CONTENT)
async def unpin_chat_dialog(
    account_id: str,
    chat_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        await chat_service.pin_chat(db, account, chat_id, pinned=False)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))


# ── Searching ─────────────────────────────────────────────────────────────────
