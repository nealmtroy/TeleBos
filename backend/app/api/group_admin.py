"""Group_admin endpoints."""

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
from app.services import account_service, group_admin_service as chat_service
from app.utils.rate_limiter import rate_limiter
from app.utils.sanitize import sanitize_exception

router = APIRouter(tags=["group_admin"])

@router.get("/accounts/{account_id}/chats/{chat_id}/members", response_model=GroupMemberListResponse)
async def get_chat_members_list(
    account_id: str,
    chat_id: int,
    q: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        members, total = await chat_service.get_group_members(
            account, chat_id, query=q, page=page, page_size=page_size
        )
        return GroupMemberListResponse(members=members, total=total)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))


@router.post("/accounts/{account_id}/chats/{chat_id}/members/{user_id}/promote", status_code=status.HTTP_204_NO_CONTENT)
async def promote_chat_member(
    account_id: str,
    chat_id: int,
    user_id: int,
    payload: PromoteMemberRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        rights_dict = payload.model_dump(exclude_none=True, exclude={"rank"})
        await chat_service.promote_member(account, chat_id, user_id, rights_dict, payload.rank)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))


@router.post("/accounts/{account_id}/chats/{chat_id}/members/{user_id}/kick", status_code=status.HTTP_204_NO_CONTENT)
async def kick_chat_member(
    account_id: str,
    chat_id: int,
    user_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        await chat_service.kick_member(account, chat_id, user_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))


# ── Mute / Unmute ─────────────────────────────────────────────────────────────
@router.post("/accounts/{account_id}/chats/{chat_id}/mute", status_code=status.HTTP_204_NO_CONTENT)
async def mute_chat_notifications(
    account_id: str,
    chat_id: int,
    payload: MuteChatRequest = MuteChatRequest(),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        await chat_service.mute_chat(db, account, chat_id, payload.duration)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))


@router.post("/accounts/{account_id}/chats/{chat_id}/unmute", status_code=status.HTTP_204_NO_CONTENT)
async def unmute_chat_notifications(
    account_id: str,
    chat_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        await chat_service.unmute_chat(db, account, chat_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))


# ── Edit Chat Info ────────────────────────────────────────────────────────────
@router.put("/accounts/{account_id}/chats/{chat_id}/info", status_code=status.HTTP_204_NO_CONTENT)
async def edit_group_info(
    account_id: str,
    chat_id: int,
    payload: EditChatInfoRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        await chat_service.edit_chat_info(account, chat_id, payload.title, payload.about)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))


# ── Group Permissions ─────────────────────────────────────────────────────────
@router.get("/accounts/{account_id}/chats/{chat_id}/permissions", response_model=GroupPermissionsResponse)
async def get_default_group_permissions(
    account_id: str,
    chat_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        return await chat_service.get_group_permissions(account, chat_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))


@router.put("/accounts/{account_id}/chats/{chat_id}/permissions", status_code=status.HTTP_204_NO_CONTENT)
async def update_default_group_permissions(
    account_id: str,
    chat_id: int,
    payload: UpdateGroupPermissionsRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        await chat_service.update_group_permissions(account, chat_id, payload.model_dump(exclude_none=True))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))


# ── Stickers ──────────────────────────────────────────────────────────────────

@router.get("/accounts/{account_id}/chats/{chat_id}/invite-links", response_model=InviteLinkListResponse)
async def list_exported_invite_links(
    account_id: str,
    chat_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        links = await chat_service.get_invite_links(account, chat_id)
        return InviteLinkListResponse(links=links)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))


@router.post("/accounts/{account_id}/chats/{chat_id}/invite-links", response_model=InviteLinkItem)
async def create_chat_invite_link(
    account_id: str,
    chat_id: int,
    payload: CreateInviteLinkRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        link = await chat_service.create_invite_link(
            account,
            chat_id,
            title=payload.title,
            expire_date=payload.expire_date,
            usage_limit=payload.usage_limit
        )
        return InviteLinkItem(**link)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))


# ── Sticker Sets & Downloads ──────────────────────────────────────────────────
