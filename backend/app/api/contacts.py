"""Contact management API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, require_role
from app.models.user import User
from app.schemas.contact import (
    ContactItem,
    ContactListResponse,
    ContactDetail,
    ContactImportRequest,
    ContactImportResponse,
)
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


@router.post(
    "/accounts/{account_id}/contacts/import",
    response_model=ContactImportResponse,
)
async def import_contacts(
    account_id: str,
    payload: ContactImportRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(["pro", "premium", "owner"])),
):
    """Import phone contacts into the Telegram address book."""
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")

    if not payload.contacts:
        raise HTTPException(status_code=400, detail="No contacts provided to import.")

    contact_dicts = [item.model_dump() for item in payload.contacts]
    try:
        imported_count, imported_users = await contact_service.import_contacts(
            db, account, contact_dicts
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))

    return ContactImportResponse(
        total_submitted=len(payload.contacts),
        imported_count=imported_count,
        imported_users=imported_users,
    )


@router.get("/accounts/{account_id}/contacts/export")
async def export_contacts(
    account_id: str,
    format: str = Query("csv", pattern="^(csv|vcf|json)$"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(["pro", "premium", "owner"])),
):
    """Export all Telegram contacts in CSV, VCF, or JSON format."""
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")

    try:
        contacts = await contact_service.get_all_contacts(account)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))

    phone_clean = (account.phone or "account").replace("+", "").strip()
    filename_base = f"contacts_{phone_clean}"

    if format == "csv":
        import io
        import csv
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Phone", "First Name", "Last Name", "Username", "Telegram ID", "Mutual"])
        for c in contacts:
            writer.writerow([
                c.get("phone") or "",
                c.get("first_name") or "",
                c.get("last_name") or "",
                c.get("username") or "",
                c.get("contact_id") or "",
                "Yes" if c.get("mutual") else "No",
            ])
        return Response(
            content=output.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename_base}.csv"'},
        )
    elif format == "vcf":
        lines = []
        for c in contacts:
            lines.append("BEGIN:VCARD")
            lines.append("VERSION:3.0")
            full_name = f"{c.get('first_name') or ''} {c.get('last_name') or ''}".strip() or "Contact"
            lines.append(f"FN:{full_name}")
            lines.append(f"N:{c.get('last_name') or ''};{c.get('first_name') or ''};;;")
            if c.get("phone"):
                lines.append(f"TEL;TYPE=CELL:{c.get('phone')}")
            note_parts = []
            if c.get("contact_id"):
                note_parts.append(f"Telegram ID: {c['contact_id']}")
            if c.get("username"):
                note_parts.append(f"Username: @{c['username']}")
            if note_parts:
                lines.append(f"NOTE:{', '.join(note_parts)}")
            lines.append("END:VCARD")
        vcf_content = "\r\n".join(lines) + "\r\n"
        return Response(
            content=vcf_content,
            media_type="text/vcard",
            headers={"Content-Disposition": f'attachment; filename="{filename_base}.vcf"'},
        )
    else:  # json
        import json
        return Response(
            content=json.dumps(contacts, indent=2),
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="{filename_base}.json"'},
        )
