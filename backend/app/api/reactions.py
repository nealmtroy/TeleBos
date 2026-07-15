"""Reactions endpoints."""

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
from app.services import account_service, reaction_service as chat_service
from app.utils.rate_limiter import rate_limiter
from app.utils.sanitize import sanitize_exception

router = APIRouter(tags=["reactions"])

@router.post("/accounts/{account_id}/chats/{chat_id}/messages/{msg_id}/reaction", status_code=status.HTTP_204_NO_CONTENT)
async def send_message_reaction(
    account_id: str,
    chat_id: int,
    msg_id: int,
    payload: SendReactionRequestSchema,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        await chat_service.send_reaction(account, chat_id, msg_id, payload.reaction)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))


@router.get("/accounts/{account_id}/chats/{chat_id}/messages/{msg_id}/reactions")
async def get_message_reactions(
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
        return await chat_service.get_reactions(account, chat_id, msg_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))


# ── Message Pinning ───────────────────────────────────────────────────────────
