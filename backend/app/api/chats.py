"""Chat and folder endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query, status, Request, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
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
from app.utils.rate_limiter import rate_limiter
from app.utils.sanitize import sanitize_exception

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
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))
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
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))
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
        await chat_service.mark_read(db, account, chat_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))


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
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))
    return result


@router.post("/accounts/{account_id}/chats/sync-groups-channels", status_code=status.HTTP_200_OK)
async def sync_groups_channels(
    account_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Sync all groups and channels for the account from Telegram and cache in DB."""
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        await chat_service.sync_groups_channels_to_db(account, db)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))
    return {
        "status": "success",
        "groups_channels_synced_at": account.groups_channels_synced_at.isoformat() if account.groups_channels_synced_at else None
    }


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
        await chat_service.archive_chat(db, account, chat_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))


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
        await chat_service.unarchive_chat(db, account, chat_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))


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
        await chat_service.delete_chat(db, account, chat_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))


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
        await chat_service.batch_archive_chats(db, account, payload.chat_ids)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))


@router.post("/accounts/{account_id}/chats/batch/unarchive", status_code=status.HTTP_204_NO_CONTENT)
async def batch_unarchive(
    account_id: str,
    payload: BatchChatActionRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Unarchive multiple chats at once."""
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        await chat_service.batch_unarchive_chats(db, account, payload.chat_ids)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))


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
        await chat_service.batch_delete_chats(db, account, payload.chat_ids)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))



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
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))
    folders = await chat_service.get_folders(account_id, db)
    return FolderListResponse(folders=folders)


async def resolve_input_peer(client, chat_id: int):
    """Dynamically resolve chat_id into the correct InputPeer (User/Chat/Channel) using Telethon's internal cache or fetching from Telegram."""
    import telethon.tl.types as types
    try:
        # Check cache and return corresponding InputPeer
        return await client.get_input_entity(chat_id)
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("Failed to get input entity from cache for %s: %s. Trying full fetch...", chat_id, e)
        try:
            # Full fetch (performs network call to retrieve the entity details)
            entity = await client.get_entity(chat_id)
            return await client.get_input_entity(entity)
        except Exception as ex:
            logging.getLogger(__name__).error("Failed to resolve entity %s completely: %s", chat_id, ex)
            # Safe fallback for basic groups
            return types.InputPeerChat(id=chat_id)


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
    from telethon.tl.functions.messages import UpdateDialogFilterRequest, GetDialogFiltersRequest

    client = await client_pool.get(str(account.id), decrypt(session_str))
    if client is None:
        raise HTTPException(status_code=400, detail="Account disconnected")

    # Fetch existing filters to find smallest unused folder ID between 2 and 255
    try:
        dialog_filters = await client(GetDialogFiltersRequest())
        if hasattr(dialog_filters, "filters"):
            filters = dialog_filters.filters
        elif isinstance(dialog_filters, list):
            filters = dialog_filters
        else:
            filters = []
        used_ids = {f.id for f in filters if hasattr(f, "id")}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to fetch existing folders from Telegram: {sanitize_exception(exc)}")

    new_id = 2
    while new_id in used_ids:
        new_id += 1

    try:
        # Resolve peers
        include_peers = []
        for cid in payload.included_chat_ids:
            peer = await resolve_input_peer(client, cid)
            include_peers.append(peer)

        exclude_peers = []
        for cid in payload.excluded_chat_ids:
            peer = await resolve_input_peer(client, cid)
            exclude_peers.append(peer)

        pinned_peers = []
        for cid in payload.pinned_chat_ids:
            peer = await resolve_input_peer(client, cid)
            pinned_peers.append(peer)

        filter_obj = types.DialogFilter(
            id=new_id,
            title=payload.title,
            include_peers=include_peers,
            exclude_peers=exclude_peers,
            pinned_peers=pinned_peers,
        )
        await client(UpdateDialogFilterRequest(id=new_id, filter=filter_obj))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to create folder on Telegram: {sanitize_exception(exc)}")

    # Save to DB
    from app.models.chat_folder import ChatFolder
    cf = ChatFolder(
        account_id=account.id,
        folder_id=new_id,
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

    # Get updated values or fallback to existing values
    included_chat_ids = payload.included_chat_ids if payload.included_chat_ids is not None else folder.included_chat_ids
    excluded_chat_ids = payload.excluded_chat_ids if payload.excluded_chat_ids is not None else folder.excluded_chat_ids
    pinned_chat_ids = payload.pinned_chat_ids if payload.pinned_chat_ids is not None else folder.pinned_chat_ids
    title = payload.title if payload.title is not None else folder.title

    # Sync update to Telegram
    from app.utils.encryption import decrypt
    from app.services.telegram_client import client_pool
    from telethon.tl.functions.messages import UpdateDialogFilterRequest
    import telethon.tl.types as types

    session_str = account.session_string
    client = await client_pool.get(str(account.id), decrypt(session_str))
    if client is None:
        raise HTTPException(status_code=400, detail="Account disconnected")

    try:
        # Resolve peers
        include_peers = []
        for cid in included_chat_ids:
            peer = await resolve_input_peer(client, cid)
            include_peers.append(peer)

        exclude_peers = []
        for cid in excluded_chat_ids:
            peer = await resolve_input_peer(client, cid)
            exclude_peers.append(peer)

        pinned_peers = []
        for cid in pinned_chat_ids:
            peer = await resolve_input_peer(client, cid)
            pinned_peers.append(peer)

        filter_obj = types.DialogFilter(
            id=folder.folder_id,
            title=title,
            include_peers=include_peers,
            exclude_peers=exclude_peers,
            pinned_peers=pinned_peers,
        )
        await client(UpdateDialogFilterRequest(id=folder.folder_id, filter=filter_obj))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to sync folder update to Telegram: {sanitize_exception(exc)}")

    # Save to local DB
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

    # Sync deletion to Telegram
    from app.utils.encryption import decrypt
    from app.services.telegram_client import client_pool
    from telethon.tl.functions.messages import UpdateDialogFilterRequest
    
    session_str = account.session_string
    client = await client_pool.get(str(account.id), decrypt(session_str))
    if client is not None:
        try:
            await client(UpdateDialogFilterRequest(id=folder.folder_id, filter=None))
        except Exception as exc:
            import logging
            logging.getLogger(__name__).warning("Failed to sync folder deletion to Telegram for account %s: %s", account.id, exc)

    await db.delete(folder)
    await db.flush()



@router.get("/accounts/{account_id}/chats/{chat_id}/photo")
async def get_chat_photo(
    account_id: str,
    chat_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Get a chat's profile photo.

    Public endpoint — chat photos are cached locally by chat_id to avoid redundant Telegram API downloads.
    The account_id is used to identify which Telethon client to use for downloading.
    """
    import os
    from fastapi.responses import FileResponse
    from fastapi import HTTPException

    # Define chat photos cache directory
    chat_photos_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
        "uploads",
        "chat_photos",
    )
    os.makedirs(chat_photos_dir, exist_ok=True)
    
    cached_path = os.path.join(chat_photos_dir, f"{chat_id}.jpg")

    def get_fallback_svg_response(initials: str = "", is_group: bool = True):
        from fastapi import Response
        from app.utils.avatar_generator import generate_avatar_svg
        svg_data = generate_avatar_svg(str(chat_id), initials=initials, is_group=is_group)
        return Response(
            content=svg_data,
            media_type="image/svg+xml",
            headers={"Cache-Control": "public, max-age=3600"},
        )

    # Serve from cache if it exists
    if os.path.exists(cached_path):
        if os.path.getsize(cached_path) == 0:
            return get_fallback_svg_response(is_group=(chat_id < 0))
        return FileResponse(cached_path, media_type="image/jpeg")

    # If not cached, download using Telethon client
    from app.utils.encryption import decrypt
    from app.services.telegram_client import client_pool
    from app.models.telegram_account import TelegramAccount
    from sqlalchemy import select

    # Just need any account that has this ID to get its session string
    result = await db.execute(
        select(TelegramAccount).where(
            TelegramAccount.id == account_id,
            TelegramAccount.for_sale == False,
        )
    )
    account = result.scalar_one_or_none()
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")

    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise HTTPException(status_code=400, detail="Account is disconnected")

    try:
        from app.services.chat_service import resolve_chat_entity
        entity = await resolve_chat_entity(client, account.id, chat_id)

        # Get initials if available from chat entity
        title = getattr(entity, "title", None)
        first_name = getattr(entity, "first_name", None)
        last_name = getattr(entity, "last_name", None)
        
        initials = ""
        is_group = chat_id < 0
        if title:
            words = title.strip().split()
            initials = "".join(w[0] for w in words if w)[:2].upper()
            is_group = True
        elif first_name or last_name:
            from app.utils.avatar_generator import get_initials
            initials = get_initials(first_name, last_name)
            is_group = False

        # Use download_big=False to fetch small thumbnail (typically 160x160/80x80)
        # to save massive bandwidth and storage.
        photo_result = await client.download_profile_photo(entity, file=cached_path, download_big=False)
        if not photo_result or not os.path.exists(cached_path):
            # Write a 0-byte file to cache the "no photo" state and avoid hitting Telegram again
            with open(cached_path, "wb") as f:
                pass
            return get_fallback_svg_response(initials=initials, is_group=is_group)
        
        return FileResponse(cached_path, media_type="image/jpeg")
    except Exception as exc:
        if isinstance(exc, HTTPException) and exc.status_code != 404:
            raise exc
        return get_fallback_svg_response(is_group=(chat_id < 0))


@router.get("/accounts/{account_id}/chats/{chat_id}/messages/{message_id}/media")
async def get_message_media_endpoint(
    account_id: str,
    chat_id: int,
    message_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Download and cache a message's media (photo, document, voice note, etc.) and return it."""
    import os
    from fastapi.responses import FileResponse
    from app.services import account_service
    from app.services.telegram_client import client_pool
    from app.utils.encryption import decrypt
    from app.services.chat_service import resolve_chat_entity

    # Define a local cache folder for message media files
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
    media_cache_dir = os.path.join(base_dir, "uploads", "message_media", str(chat_id))
    os.makedirs(media_cache_dir, exist_ok=True)

    # Check if we already have it cached.
    cached_file = None
    if os.path.exists(media_cache_dir):
        for f in os.listdir(media_cache_dir):
            if f.startswith(f"{message_id}."):
                cached_file = os.path.join(media_cache_dir, f)
                break

    if cached_file and os.path.exists(cached_file):
        import mimetypes
        mime, _ = mimetypes.guess_type(cached_file)
        return FileResponse(cached_file, media_type=mime or "application/octet-stream")

    # If not cached, download using Telethon client
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")

    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise HTTPException(status_code=400, detail="Account is disconnected")

    try:
        entity = await resolve_chat_entity(client, account.id, chat_id)
        msg = await client.get_messages(entity, ids=message_id)
        if not msg or not msg.media:
            raise HTTPException(status_code=404, detail="Message or media not found")

        # Determine clean filename
        filename = f"{message_id}"
        ext = ""
        if hasattr(msg.media, "document") and msg.media.document:
            for attr in getattr(msg.media.document, "attributes", []):
                if hasattr(attr, "file_name") and attr.file_name:
                    filename = os.path.splitext(attr.file_name)[0]
                    ext = os.path.splitext(attr.file_name)[1]
                    break
            if not ext:
                import mimetypes
                ext = mimetypes.guess_extension(msg.media.document.mime_type or "") or ""
        if not ext:
            ext = ".jpg"

        dest_path = os.path.join(media_cache_dir, f"{message_id}{ext}")
        result_path = await client.download_media(msg, file=dest_path)
        if not result_path or not os.path.exists(dest_path):
            raise HTTPException(status_code=500, detail="Failed to download media from Telegram")

        import mimetypes
        mime, _ = mimetypes.guess_type(dest_path)
        return FileResponse(dest_path, media_type=mime or "application/octet-stream")

    except Exception as exc:
        import logging
        logging.getLogger(__name__).error("Failed to download message media: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/accounts/{account_id}/chats/{chat_id}/messages/{message_id}/video/stream")
async def stream_message_video_endpoint(
    request: Request,
    account_id: str,
    chat_id: int,
    message_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Stream video progressive notes/files using HTTP 206 Partial Content range requests."""
    import os
    from fastapi.responses import StreamingResponse
    from app.services import account_service
    from app.services.telegram_client import client_pool
    from app.utils.encryption import decrypt
    from app.services.chat_service import resolve_chat_entity

    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
    media_cache_dir = os.path.join(base_dir, "uploads", "message_media", str(chat_id))
    os.makedirs(media_cache_dir, exist_ok=True)

    video_path = None
    if os.path.exists(media_cache_dir):
        for f in os.listdir(media_cache_dir):
            if f.startswith(f"{message_id}."):
                video_path = os.path.join(media_cache_dir, f)
                break

    if not video_path or not os.path.exists(video_path):
        account = await account_service.get_account(db, account_id, str(user.id))
        if account is None:
            raise HTTPException(status_code=404, detail="Account not found")

        session_str = decrypt(account.session_string)
        client = await client_pool.get(str(account.id), session_str)
        if client is None:
            raise HTTPException(status_code=400, detail="Account is disconnected")

        try:
            entity = await resolve_chat_entity(client, account.id, chat_id)
            msg = await client.get_messages(entity, ids=message_id)
            if not msg or not msg.media:
                raise HTTPException(status_code=404, detail="Message or video media not found")

            ext = ".mp4"
            if hasattr(msg.media, "document") and msg.media.document:
                import mimetypes
                ext = mimetypes.guess_extension(msg.media.document.mime_type or "") or ".mp4"

            video_path = os.path.join(media_cache_dir, f"{message_id}{ext}")
            result_path = await client.download_media(msg, file=video_path)
            if not result_path or not os.path.exists(video_path):
                raise HTTPException(status_code=500, detail="Failed to download video")
        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc))

    file_size = os.path.getsize(video_path)
    range_header = request.headers.get("range")
    
    start = 0
    end = file_size - 1
    
    if range_header:
        range_val = range_header.replace("bytes=", "")
        parts = range_val.split("-")
        if parts[0]:
            start = int(parts[0])
        if len(parts) > 1 and parts[1]:
            end = int(parts[1])

    if end >= file_size:
        end = file_size - 1

    def range_file_generator(path: str, start_offset: int, end_offset: int, chunk_size: int = 1024 * 1024):
        with open(path, "rb") as f:
            f.seek(start_offset)
            bytes_to_read = end_offset - start_offset + 1
            while bytes_to_read > 0:
                read_len = min(bytes_to_read, chunk_size)
                data = f.read(read_len)
                if not data:
                    break
                bytes_to_read -= len(data)
                yield data

    import mimetypes
    mime, _ = mimetypes.guess_type(video_path)
    
    headers = {
        "Content-Range": f"bytes {start}-{end}/{file_size}",
        "Accept-Ranges": "bytes",
        "Content-Length": str(end - start + 1),
    }
    return StreamingResponse(
        range_file_generator(video_path, start, end),
        status_code=206,
        headers=headers,
        media_type=mime or "video/mp4"
    )



