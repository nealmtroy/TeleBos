"""Contact management API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, require_role
from app.models.user import User
from app.schemas.contact import ContactItem, ContactListResponse, ContactDetail
from app.services import account_service, contact_service
from app.utils.sanitize import sanitize_exception

router = APIRouter(tags=["contacts"])


@router.get(
    "/accounts/{account_id}/contacts",
    response_model=ContactListResponse,
)
async def list_contacts(
    account_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    search: str | None = Query(None, max_length=100),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(["pro", "premium", "owner"])),
):
    """List Telegram contacts for an account, with optional search & pagination."""
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")

    try:
        contacts, total = await contact_service.get_contacts(
            account, page=page, page_size=page_size, search=search
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))

    return ContactListResponse(
        contacts=contacts, total=total, page=page, page_size=page_size
    )


@router.get(
    "/accounts/{account_id}/contacts/{contact_id}",
    response_model=ContactDetail,
)
async def get_contact_detail(
    account_id: str,
    contact_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(["pro", "premium", "owner"])),
):
    """Get full contact detail including bio and common chats count."""
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")

    try:
        detail = await contact_service.get_contact_detail(account, contact_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))

    return detail


@router.delete(
    "/accounts/{account_id}/contacts/{contact_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_contact(
    account_id: str,
    contact_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(["pro", "premium", "owner"])),
):
    """Delete a contact from the Telegram address book."""
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")

    try:
        await contact_service.delete_contact(account, contact_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))
