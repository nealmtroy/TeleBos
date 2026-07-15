"""Polls endpoints."""

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
from app.services import account_service, poll_service as chat_service
from app.utils.rate_limiter import rate_limiter
from app.utils.sanitize import sanitize_exception

router = APIRouter(tags=["polls"])

@router.post("/accounts/{account_id}/chats/{chat_id}/polls")
async def send_chat_poll(
    account_id: str,
    chat_id: int,
    payload: CreatePollRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        res = await chat_service.send_poll(
            account,
            chat_id,
            payload.question,
            payload.options,
            payload.is_anonymous,
            payload.is_quiz,
            payload.correct_option_idx
        )
        return res
    except Exception as exc:
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))


@router.post("/accounts/{account_id}/chats/{chat_id}/messages/{message_id}/votes", status_code=status.HTTP_204_NO_CONTENT)
async def vote_in_poll(
    account_id: str,
    chat_id: int,
    message_id: int,
    payload: VotePollRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        await chat_service.vote_poll(account, chat_id, message_id, payload.options)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))


# ── Voice Notes ───────────────────────────────────────────────────────────────
import os
import tempfile

