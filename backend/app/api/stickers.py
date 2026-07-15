"""Stickers endpoints."""

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
from app.services import account_service, sticker_service as chat_service
from app.utils.rate_limiter import rate_limiter
from app.utils.sanitize import sanitize_exception

router = APIRouter(tags=["stickers"])

@router.get("/accounts/{account_id}/stickers", response_model=StickerPacksResponse)
async def get_installed_stickers(
    account_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        packs = await chat_service.get_installed_sticker_packs(account)
        return StickerPacksResponse(packs=packs)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))


# ── Invite Links ──────────────────────────────────────────────────────────────

@router.get("/accounts/{account_id}/stickers/sets/{set_name}", response_model=StickerSetResponse)
async def get_sticker_set_details(
    account_id: str,
    set_name: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        data = await chat_service.get_sticker_set(account, set_name)
        return StickerSetResponse(**data)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))


from fastapi.responses import StreamingResponse
import io

@router.get("/accounts/{account_id}/stickers/documents/{document_id}/{access_hash}/download")
async def download_sticker_file(
    account_id: str,
    document_id: str,
    access_hash: str,
    file_reference: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user_from_token_or_header),
):
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        file_bytes = await chat_service.download_sticker(account, document_id, access_hash, file_reference)
        return StreamingResponse(io.BytesIO(file_bytes), media_type="image/webp")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))


# ── Polls ─────────────────────────────────────────────────────────────────────

@router.post("/accounts/{account_id}/chats/{chat_id}/stickers")
async def send_sticker_to_chat(
    account_id: str,
    chat_id: int,
    payload: SendStickerRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        res = await chat_service.send_sticker(account, chat_id, payload.document_id, payload.access_hash, payload.file_reference)
        return res
    except Exception as exc:
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))


