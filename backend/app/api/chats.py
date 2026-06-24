"""Chat and folder endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query, status, Request, UploadFile, File, Form
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, get_current_user_from_token_or_header, optional_security_scheme
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
)
from app.services import account_service, chat_service

router = APIRouter(tags=["chats"])


@router.get("/accounts/{account_id}/chats", response_model=ChatListResponse)
async def list_chats(
    account_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    chat_type: str | None = Query(None, description="Filter by type: user, group, supergroup, channel. Comma-separated for multiple."),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        chats, total = await chat_service.get_dialogs(
            account, db, page=page, page_size=page_size, chat_type=chat_type,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return ChatListResponse(chats=chats, total=total, page=page, page_size=page_size)


# ── Messages ─────────────────────────────────────────────────────────────────


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
        raise HTTPException(status_code=400, detail=str(exc))
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
        raise HTTPException(status_code=400, detail=str(exc))
    return result


@router.post("/accounts/{account_id}/chats/{chat_id}/media", response_model=SendMessageResponse)
async def send_media(
    request: Request,
    account_id: str,
    chat_id: int,
    file: UploadFile = File(...),
    caption: str | None = Form(None),
    reply_to: int | None = Form(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Send a media file to a chat."""
    ip = request.client.host
    if not await rate_limiter.check(f"chat_send:ip:{ip}"):
        raise HTTPException(status_code=429, detail="Too many messages. Try later.")
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")

    import os
    # 1. Enforce file size limit (20MB)
    MAX_FILE_SIZE = 20 * 1024 * 1024
    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 20MB)")

    # 2. Sanitize filename & validate dangerous extensions
    filename = os.path.basename(file.filename or "file")
    _, ext = os.path.splitext(filename.lower())
    BLOCKED_EXTENSIONS = {'.exe', '.dll', '.bat', '.cmd', '.sh', '.msi', '.com', '.vbs', '.scr', '.pif'}
    if ext in BLOCKED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Forbidden file type")

    try:
        result = await chat_service.send_media(
            account,
            chat_id,
            file_bytes,
            filename,
            caption=caption,
            reply_to=reply_to,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return result


@router.post("/accounts/{account_id}/chats/{chat_id}/read", status_code=status.HTTP_204_NO_CONTENT)
async def mark_read(
    account_id: str,
    chat_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Mark all messages in a chat as read."""
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        await chat_service.mark_read(account, chat_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


# ── Join Group / Channel ────────────────────────────────────────────────────────


@router.post("/accounts/{account_id}/chats/join", response_model=JoinChatResponse, status_code=status.HTTP_200_OK)
async def join_chat(
    account_id: str,
    payload: JoinChatRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Join a Telegram group or channel via username or invite link."""
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        result = await chat_service.join_chat(account, payload.identifier)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return result


# ── Archive / Unarchive / Delete ───────────────────────────────────────────────


@router.post("/accounts/{account_id}/chats/{chat_id}/archive", status_code=status.HTTP_204_NO_CONTENT)
async def archive_chat(
    account_id: str,
    chat_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Move a Telegram chat to the Archived folder."""
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        await chat_service.archive_chat(account, chat_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/accounts/{account_id}/chats/{chat_id}/unarchive", status_code=status.HTTP_204_NO_CONTENT)
async def unarchive_chat(
    account_id: str,
    chat_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Move a Telegram chat out of the Archived folder back to Main."""
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        await chat_service.unarchive_chat(account, chat_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.delete("/accounts/{account_id}/chats/{chat_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_chat(
    account_id: str,
    chat_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Delete a Telegram chat / conversation completely."""
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        await chat_service.delete_chat(account, chat_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


# ── Batch actions ──────────────────────────────────────────────────────────────


@router.post("/accounts/{account_id}/chats/batch/archive", status_code=status.HTTP_204_NO_CONTENT)
async def batch_archive(
    account_id: str,
    payload: BatchChatActionRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Archive multiple chats at once."""
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        await chat_service.batch_archive_chats(account, payload.chat_ids)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/accounts/{account_id}/chats/batch/delete", status_code=status.HTTP_204_NO_CONTENT)
async def batch_delete(
    account_id: str,
    payload: BatchChatActionRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Delete multiple chats at once."""
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        await chat_service.batch_delete_chats(account, payload.chat_ids)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))



@router.get("/accounts/{account_id}/folders", response_model=FolderListResponse)
async def list_folders(
    account_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    folders = await chat_service.get_folders(account_id, db)
    return FolderListResponse(folders=folders)


@router.post("/accounts/{account_id}/folders/sync", response_model=FolderListResponse)
async def sync_folders(
    account_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        await chat_service.sync_folders_from_telegram(account, db)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    folders = await chat_service.get_folders(account_id, db)
    return FolderListResponse(folders=folders)


@router.post("/accounts/{account_id}/folders", response_model=FolderResponse, status_code=status.HTTP_201_CREATED)
async def create_folder(
    account_id: str,
    payload: FolderCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    session_str = account.session_string  # decrypted
    from app.utils.encryption import decrypt
    from app.services.telegram_client import client_pool
    import telethon.tl.types as types
    from telethon.tl.functions.messages import UpdateDialogFilterRequest

    client = await client_pool.get(str(account.id), decrypt(session_str))
    if client is None:
        raise HTTPException(status_code=400, detail="Account disconnected")

    filter_obj = types.DialogFilter(
        id=0,
        title=payload.title,
        include_peers=[types.InputPeerChat(id=c) for c in payload.included_chat_ids],
        exclude_peers=[types.InputPeerChat(id=c) for c in payload.excluded_chat_ids],
        pinned_peers=[types.InputPeerChat(id=c) for c in payload.pinned_chat_ids],
    )
    result = await client(UpdateDialogFilterRequest(id=0, filter=filter_obj))
    # Save to DB
    from app.models.chat_folder import ChatFolder
    cf = ChatFolder(
        account_id=account.id,
        folder_id=result.filter.id,
        title=payload.title,
        emoji=payload.emoji,
        color=payload.color,
        included_chat_ids=payload.included_chat_ids,
        excluded_chat_ids=payload.excluded_chat_ids,
        pinned_chat_ids=payload.pinned_chat_ids,
    )
    db.add(cf)
    await db.flush()
    return cf


@router.put("/accounts/{account_id}/folders/{folder_id}", response_model=FolderResponse)
async def update_folder(
    account_id: str,
    folder_id: str,
    payload: FolderUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from app.services import account_service
    # Verify account ownership
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")

    from sqlalchemy import select as _sel
    from app.models.chat_folder import ChatFolder
    result = await db.execute(
        _sel(ChatFolder).where(ChatFolder.id == folder_id, ChatFolder.account_id == account.id)
    )
    folder = result.scalar_one_or_none()
    if folder is None:
        raise HTTPException(status_code=404, detail="Folder not found")

    update_data = payload.model_dump(exclude_none=True)
    for key, val in update_data.items():
        setattr(folder, key, val)
    await db.flush()
    return folder


@router.delete("/accounts/{account_id}/folders/{folder_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_folder(
    account_id: str,
    folder_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from app.services import account_service
    # Verify account ownership
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")

    from sqlalchemy import select as _sel
    from app.models.chat_folder import ChatFolder
    result = await db.execute(
        _sel(ChatFolder).where(ChatFolder.id == folder_id, ChatFolder.account_id == account.id)
    )
    folder = result.scalar_one_or_none()
    if folder is None:
        raise HTTPException(status_code=404, detail="Folder not found")
    await db.delete(folder)


@router.get("/accounts/{account_id}/chats/{chat_id}/photo")
async def get_chat_photo(
    account_id: str,
    chat_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Get a chat's profile photo.

    Public endpoint — chat photos are cached/retrieved from Telegram.
    The account_id is used to identify which Telethon client to use
    for downloading (no user auth required).
    """
    from fastapi import Response
    from app.utils.encryption import decrypt
    from app.services.telegram_client import client_pool
    from app.models.telegram_account import TelegramAccount
    from sqlalchemy import select
    import io

    # Just need any account that has this ID to get its session string
    result = await db.execute(select(TelegramAccount).where(TelegramAccount.id == account_id))
    account = result.scalar_one_or_none()
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")

    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise HTTPException(status_code=400, detail="Account is disconnected")

    try:
        entity = await client.get_input_entity(chat_id)
        bio = io.BytesIO()
        photo_result = await client.download_profile_photo(entity, file=bio)
        if not photo_result:
            raise HTTPException(status_code=404, detail="No photo")
        bio.seek(0)
        return Response(content=bio.read(), media_type="image/jpeg")
    except Exception as exc:
        raise HTTPException(status_code=404, detail=str(exc))

