"""Messages endpoints."""

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
from app.services import account_service, message_service as chat_service
from app.utils.rate_limiter import rate_limiter
from app.utils.sanitize import sanitize_exception

router = APIRouter(tags=["messages"])

@router.get("/accounts/{account_id}/chats/{chat_id}/messages", response_model=MessageListResponse)
async def get_messages(
    account_id: str,
    chat_id: int,
    limit: int = Query(50, ge=1, le=100),
    offset_id: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get message history for a specific chat."""
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        messages, has_more = await chat_service.get_messages(
            account, chat_id, limit=limit, offset_id=offset_id
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))
    return MessageListResponse(messages=messages, chat_id=chat_id, has_more=has_more)


@router.post("/accounts/{account_id}/chats/{chat_id}/messages", response_model=SendMessageResponse)
async def send_message(
    request: Request,
    account_id: str,
    chat_id: int,
    payload: SendMessageRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Send a message to a chat."""
    ip = request.client.host
    if not await rate_limiter.check(f"chat_send:ip:{ip}"):
        raise HTTPException(status_code=429, detail="Too many messages. Try later.")
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        result = await chat_service.send_message(
            account, chat_id, payload.text, reply_to=payload.reply_to
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))
    return result



@router.post("/accounts/{account_id}/chats/{chat_id}/messages/{msg_id}/delete", status_code=status.HTTP_204_NO_CONTENT)
@router.delete("/accounts/{account_id}/chats/{chat_id}/messages/{msg_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_single_message(
    account_id: str,
    chat_id: int,
    msg_id: int,
    payload: DeleteMessageRequest = DeleteMessageRequest(),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        await chat_service.delete_messages(account, chat_id, [msg_id], revoke=payload.revoke)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))


@router.post("/accounts/{account_id}/chats/{chat_id}/messages/batch-delete", status_code=status.HTTP_204_NO_CONTENT)
async def delete_multiple_messages(
    account_id: str,
    chat_id: int,
    payload: BatchDeleteMessagesRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        await chat_service.delete_messages(account, chat_id, payload.message_ids, revoke=payload.revoke)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))



# ── Edit message ──────────────────────────────────────────────────────────────
@router.put("/accounts/{account_id}/chats/{chat_id}/messages/{msg_id}")
async def edit_single_message(
    account_id: str,
    chat_id: int,
    msg_id: int,
    payload: EditMessageRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        return await chat_service.edit_message(account, chat_id, msg_id, payload.text)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))



# ── Shared media ──────────────────────────────────────────────────────────────

@router.get("/accounts/{account_id}/chats/{chat_id}/messages/scheduled")
async def list_scheduled_messages(
    account_id: str,
    chat_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        return await chat_service.get_scheduled_messages(account, chat_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))


@router.post("/accounts/{account_id}/chats/{chat_id}/messages/scheduled")
async def send_scheduled_msg(
    account_id: str,
    chat_id: int,
    payload: SendScheduledMessageRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        return await chat_service.send_scheduled_message(account, chat_id, payload.text, payload.schedule_date, payload.reply_to)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))


@router.delete("/accounts/{account_id}/chats/{chat_id}/messages/scheduled")
async def delete_scheduled_msgs(
    account_id: str,
    chat_id: int,
    message_ids: list[int] = Query(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        await chat_service.delete_scheduled_messages(account, chat_id, message_ids)
        return {"status": "success"}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))








@router.get("/accounts/{account_id}/chats/search", response_model=ChatSearchResponse)
async def search_all_chats(
    account_id: str,
    q: str = Query(..., min_length=1),
    limit: int = 50,
    offset_id: int = 0,
    global_messages: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        from app.services.group_admin_service import search_global
        from app.services.message_service import search_global_messages
        if global_messages:
            return await search_global_messages(account, q)
        return await search_global(db, account, q, limit=limit, offset_id=offset_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))


@router.get("/accounts/{account_id}/chats/{chat_id}/messages/search")
async def search_messages_in_chat(
    account_id: str,
    chat_id: int,
    q: str | None = Query(None),
    media_type: str | None = Query(None),
    from_user_id: int | None = Query(None),
    date_from: int | None = Query(None),
    date_to: int | None = Query(None),
    limit: int = Query(50, ge=1, le=100),
    offset_id: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        from app.services.message_service import search_messages
        from app.services.group_admin_service import search_in_chat
        if date_from is not None or date_to is not None:
            return await search_messages(account, chat_id, q, media_type, date_from, date_to)
        return await search_in_chat(
            account, chat_id, query=q, media_type=media_type, from_user_id=from_user_id, limit=limit, offset_id=offset_id
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))
