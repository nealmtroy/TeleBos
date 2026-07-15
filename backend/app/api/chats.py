"""Chat and folder endpoints."""

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



