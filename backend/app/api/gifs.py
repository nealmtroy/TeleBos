"""GIFs endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi.responses import StreamingResponse
import io

from app.database import get_db
from app.dependencies import get_current_user, get_current_user_from_token_or_header
from app.models.user import User
from app.schemas.chat import (
    GifItem,
    GifListResponse,
    SaveGifRequest,
    SendGifRequest,
)
from app.services import account_service, gif_service
from app.utils.sanitize import sanitize_exception

router = APIRouter(tags=["gifs"])

@router.get("/accounts/{account_id}/gifs/saved", response_model=GifListResponse)
async def get_saved_gifs_endpoint(
    account_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        gifs = await gif_service.get_saved_gifs(account)
        return GifListResponse(gifs=gifs)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))


@router.get("/accounts/{account_id}/gifs/search", response_model=GifListResponse)
async def search_gifs_endpoint(
    account_id: str,
    q: str = Query(...),
    offset: str = Query(""),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        res = await gif_service.search_gifs(account, q, offset)
        return GifListResponse(**res)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))


@router.post("/accounts/{account_id}/gifs/save", status_code=status.HTTP_204_NO_CONTENT)
async def save_gif_endpoint(
    account_id: str,
    payload: SaveGifRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        await gif_service.save_gif(account, payload.document_id, payload.access_hash, payload.unsave)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))


@router.get("/accounts/{account_id}/gifs/documents/{document_id}/{access_hash}/download")
async def download_gif_endpoint(
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
        file_bytes, media_type = await gif_service.download_gif(account, document_id, access_hash, file_reference)
        return StreamingResponse(io.BytesIO(file_bytes), media_type=media_type)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))


@router.post("/accounts/{account_id}/chats/{chat_id}/gifs")
async def send_gif_to_chat(
    account_id: str,
    chat_id: int,
    payload: SendGifRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        res = await gif_service.send_gif(account, chat_id, payload.document_id, payload.access_hash, payload.file_reference)
        return res
    except Exception as exc:
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))
