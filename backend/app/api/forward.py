"""Forward endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.chat import ForwardMessagesRequest
from app.services import account_service, forward_service
from app.utils.sanitize import sanitize_exception

router = APIRouter(tags=["forward"])


@router.post("/accounts/{account_id}/chats/{chat_id}/messages/forward")
async def forward_multiple_messages(
    account_id: str,
    chat_id: int,
    payload: ForwardMessagesRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        return await forward_service.forward_messages(
            account, chat_id, payload.message_ids, payload.to_chat_ids
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))
