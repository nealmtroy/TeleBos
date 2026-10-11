"""Telegram Bot integration endpoints for settings dashboard."""

import logging
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.services import telegram_bot_service
from app.utils.sanitize import sanitize_exception

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/telegram-bot", tags=["telegram-bot"])


class TelegramStatusResponse(BaseModel):
    is_connected: bool
    telegram_chat_id: int | None = None
    bot_username: str
    has_active_token: bool = False
    active_token: str | None = None
    token_ttl: int = 0


class TelegramTokenResponse(BaseModel):
    token: str
    expires_in: int
    bot_username: str
    deep_link: str | None = None


class TelegramUnlinkResponse(BaseModel):
    success: bool
    message: str


@router.get("/status", response_model=TelegramStatusResponse)
async def get_status(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get current user's Telegram connection status and bot details."""
    try:
        status_data = await telegram_bot_service.get_telegram_status(db, current_user)
        return TelegramStatusResponse(**status_data)
    except Exception as exc:
        logger.error("Error retrieving Telegram status for user %s: %s", current_user.id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Gagal memuat status integrasi Telegram.",
        )


@router.post("/token", response_model=TelegramTokenResponse)
async def generate_token(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate a single-use authenticator-style token to connect Telegram bot."""
    try:
        token_data = await telegram_bot_service.generate_linking_token(db, current_user)
        return TelegramTokenResponse(**token_data)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS if "permintaan" in str(exc) else status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )
    except Exception as exc:
        logger.error("Error generating Telegram token for user %s: %s", current_user.id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Gagal membuat token penghubung Telegram.",
        )


@router.post("/unlink", response_model=TelegramUnlinkResponse)
async def unlink(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Unlink the user's Telegram chat ID from their TeleBos account."""
    try:
        success = await telegram_bot_service.unlink_telegram(db, current_user)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Gagal memutuskan hubungan Telegram.",
            )
        return TelegramUnlinkResponse(
            success=True,
            message="Akun Telegram berhasil diputuskan.",
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error unlinking Telegram for user %s: %s", current_user.id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=sanitize_exception(exc),
        )
