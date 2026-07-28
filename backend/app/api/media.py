"""Media endpoints."""

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

router = APIRouter(tags=["media"])

@router.get("/accounts/{account_id}/chats/{chat_id}/photo")
async def get_chat_photo(
    account_id: str,
    chat_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Serve a versioned chat photo from an account-scoped local cache.

    Chat sync persists Telegram's photo ID as ``photo_version``. A missing
    version is a known no-photo state, so the endpoint can return a fallback
    response without opening a Telethon connection or writing sentinel files.
    """
    import os

    from fastapi.responses import FileResponse, Response
    from sqlalchemy import select

    from app.models.telegram_account import TelegramAccount
    from app.models.telegram_chat import TelegramChat
    from app.services.telegram_client import client_pool
    from app.services.chat_service import resolve_chat_entity
    from app.utils.encryption import decrypt

    account_result = await db.execute(
        select(TelegramAccount).where(
            TelegramAccount.id == account_id,
            TelegramAccount.for_sale.is_(False),
        )
    )
    account = account_result.scalar_one_or_none()
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")

    chat_result = await db.execute(
        select(TelegramChat).where(
            TelegramChat.account_id == account.id,
            TelegramChat.chat_id == chat_id,
            TelegramChat.is_active.is_(True),
        )
    )
    chat = chat_result.scalar_one_or_none()
    if chat is None or chat.photo_version is None:
        raise HTTPException(status_code=404, detail="No profile photo")

    photo_version = chat.photo_version
    etag = f'W/"{account.id}-{chat_id}-{photo_version}"'
    headers = {
        "Cache-Control": "public, max-age=31536000, immutable",
        "ETag": etag,
    }
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers=headers)

    chat_photos_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
        "uploads",
        "chat_photos",
        str(account.id),
        str(chat_id),
    )
    os.makedirs(chat_photos_dir, exist_ok=True)
    cached_path = os.path.join(chat_photos_dir, f"{photo_version}.jpg")

    if os.path.exists(cached_path) and os.path.getsize(cached_path) > 0:
        return FileResponse(cached_path, media_type="image/jpeg", headers=headers)

    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise HTTPException(status_code=400, detail="Account is disconnected")

    try:
        entity = await resolve_chat_entity(client, account.id, chat_id)
        photo_result = await client.download_profile_photo(
            entity, file=cached_path, download_big=False
        )
        if not photo_result or not os.path.exists(cached_path) or os.path.getsize(cached_path) == 0:
            if os.path.exists(cached_path):
                os.remove(cached_path)
            # Telegram can remove a photo between dialog sync and the cache miss.
            # Clear the stale metadata so subsequent UI refreshes render locally.
            chat.photo_version = None
            await db.flush()
            raise HTTPException(status_code=404, detail="No profile photo")
        return FileResponse(cached_path, media_type="image/jpeg", headers=headers)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=404, detail="No profile photo") from exc


@router.get("/accounts/{account_id}/chats/{chat_id}/messages/{message_id}/media")
async def get_message_media_endpoint(
    account_id: str,
    chat_id: int,
    message_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user_from_token_or_header),
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

        # Check if media is empty/expired (e.g. view-once media that has expired/been viewed)
        from telethon.tl.types import PhotoEmpty, DocumentEmpty
        if hasattr(msg.media, "photo") and (msg.media.photo is None or isinstance(msg.media.photo, PhotoEmpty)):
            raise HTTPException(status_code=404, detail="Media is unavailable or has expired")
        if hasattr(msg.media, "document") and (msg.media.document is None or isinstance(msg.media.document, DocumentEmpty)):
            raise HTTPException(status_code=404, detail="Media is unavailable or has expired")

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

    except HTTPException as http_exc:
        raise http_exc
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
    user: User = Depends(get_current_user_from_token_or_header),
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

            # Check if video document is empty/expired
            from telethon.tl.types import DocumentEmpty
            if hasattr(msg.media, "document") and (msg.media.document is None or isinstance(msg.media.document, DocumentEmpty)):
                raise HTTPException(status_code=404, detail="Video media is unavailable or has expired")

            file_size = 0
            mime = "video/mp4"
            if hasattr(msg.media, "document") and msg.media.document:
                file_size = msg.media.document.size
                mime = msg.media.document.mime_type or "video/mp4"
            else:
                raise HTTPException(status_code=400, detail="Media is not a document/video")

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

            headers = {
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Accept-Ranges": "bytes",
                "Content-Length": str(end - start + 1),
            }

            async def telethon_stream_generator():
                try:
                    bytes_to_read = end - start + 1
                    async for chunk in client.iter_download(msg.media, offset=start, request_size=128 * 1024):
                        if not chunk:
                            break
                        
                        if isinstance(chunk, memoryview):
                            chunk = chunk.tobytes()
                        elif not isinstance(chunk, bytes):
                            chunk = bytes(chunk)

                        if len(chunk) > bytes_to_read:
                            yield chunk[:bytes_to_read]
                            break
                        yield chunk
                        bytes_to_read -= len(chunk)
                        if bytes_to_read <= 0:
                            break
                except Exception as e:
                    import logging
                    logging.getLogger(__name__).error("Error during streaming chunks: %s", e)

            return StreamingResponse(
                telethon_stream_generator(),
                status_code=206,
                headers=headers,
                media_type=mime
            )
        except HTTPException as http_exc:
            raise http_exc
        except Exception as exc:
            import logging
            logging.getLogger(__name__).error("Failed to stream video: %s", exc)
            raise HTTPException(status_code=400, detail=str(exc))
    else:
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


# ── Delete message ────────────────────────────────────────────────────────────

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



@router.get("/accounts/{account_id}/chats/{chat_id}/shared-media", response_model=SharedMediaResponse)
async def get_chat_shared_media(
    account_id: str,
    chat_id: int,
    media_type: str | None = Query(None),
    limit: int = Query(50, ge=1, le=100),
    offset_id: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        items, has_more, next_offset_id = await chat_service.get_shared_media(
            account, chat_id, media_type, limit=limit, offset_id=offset_id
        )
        return SharedMediaResponse(items=items, has_more=has_more, next_offset_id=next_offset_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))


# ── Reactions ─────────────────────────────────────────────────────────────────

@router.post("/accounts/{account_id}/chats/{chat_id}/voice")
async def upload_and_send_voice(
    account_id: str,
    chat_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        content = await file.read()
        suffix = os.path.splitext(file.filename or "")[1] or ".ogg"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(content)
            tmp_path = tmp.name
        try:
            res = await chat_service.send_voice_note(account, chat_id, tmp_path)
            return res
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))


