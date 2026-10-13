"""Reactions API router for managing Telegram message emoji reactions."""

import logging
from fastapi import APIRouter, Depends, HTTPException, Path, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.chat import (
    MessageReactionsResponse,
    SendReactionRequestSchema,
)
from app.services import account_service, reaction_service
from app.utils.sanitize import sanitize_exception

logger = logging.getLogger(__name__)

router = APIRouter(tags=["reactions"])


@router.post(
    "/accounts/{account_id}/chats/{chat_id}/messages/{msg_id}/reaction",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Send or retract emoji reaction on a message",
    description=(
        "Submits an emoji reaction (e.g. 👍, ❤️, 🔥) or retracts an existing reaction "
        "on a Telegram message via the account's MTProto session. "
        "Pass reaction=null in payload to remove an existing reaction."
    ),
    responses={
        204: {"description": "Reaction successfully applied or removed"},
        400: {"description": "Telegram RPC failure or invalid chat/message context"},
        404: {"description": "Account not found or not owned by the current user"},
    },
)
async def send_message_reaction(
    account_id: str = Path(..., description="UUID of the connected Telegram account"),
    chat_id: int = Path(..., description="Target Telegram chat / channel / user ID"),
    msg_id: int = Path(..., description="Target Telegram message ID"),
    payload: SendReactionRequestSchema = ...,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Submit an emoji reaction or remove reaction from a specified Telegram message."""
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        await reaction_service.send_reaction(account, chat_id, msg_id, payload.reaction)
    except Exception as exc:
        logger.warning(
            "Failed to send reaction to message %s in chat %s for account %s: %s",
            msg_id,
            chat_id,
            account_id,
            exc,
        )
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))


@router.get(
    "/accounts/{account_id}/chats/{chat_id}/messages/{msg_id}/reactions",
    response_model=MessageReactionsResponse,
    status_code=status.HTTP_200_OK,
    summary="Get recent reactions and reactors for a message",
    description=(
        "Fetches the list of active emoji reactions, counts, and reactor details "
        "for a specific Telegram message via MTProto GetMessageReactionsList."
    ),
    responses={
        200: {
            "description": "List of message reactions and reactors",
            "model": MessageReactionsResponse,
        },
        400: {"description": "Telegram RPC failure or inaccessible chat/message"},
        404: {"description": "Account not found or not owned by the current user"},
    },
)
async def get_message_reactions(
    account_id: str = Path(..., description="UUID of the connected Telegram account"),
    chat_id: int = Path(..., description="Target Telegram chat / channel / user ID"),
    msg_id: int = Path(..., description="Target Telegram message ID"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Retrieve message emoji reactions and reactors."""
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        data = await reaction_service.get_reactions(account, chat_id, msg_id)
        return data
    except Exception as exc:
        logger.warning(
            "Failed to get reactions for message %s in chat %s for account %s: %s",
            msg_id,
            chat_id,
            account_id,
            exc,
        )
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))
