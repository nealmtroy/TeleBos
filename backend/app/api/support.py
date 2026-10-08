"""Support endpoints — AI chat assistance, ticket escalation, and admin ticket management."""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, get_optional_user, require_role
from app.models.user import User
from app.schemas.support import (
    SupportChatRequest,
    SupportChatResponse,
    SupportEscalateRequest,
    SupportTicketResponse,
    SupportTicketUpdate,
)
from app.services import ai_support_service, support_ticket_service
from app.utils.rate_limiter import rate_limiter
from app.utils.sanitize import sanitize_exception

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/support", tags=["support"])


@router.post("/chat", response_model=SupportChatResponse)
async def chat_with_support_ai(
    request: Request,
    payload: SupportChatRequest,
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    """Interact with TeleBos AI Support Assistant with order context and security guardrails."""
    ip = request.client.host if request.client else "unknown"

    # Rate limiting: 10 msg/min for IP, 20 msg/min for authenticated user
    rate_key = f"support:chat:user:{user.id}" if user else f"support:chat:ip:{ip}"
    if not await rate_limiter.check(rate_key):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Terlalu banyak permintaan pesan. Silakan tunggu 1 menit sebelum mengirim pesan lagi.",
        )

    try:
        response = await ai_support_service.handle_support_chat(
            db=db,
            user=user,
            message=payload.message,
            history=payload.history,
            context_page=payload.context_page,
        )
        return response
    except Exception as exc:
        logger.error("Error in AI support chat handler: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Terjadi kendala saat memproses pesan bantuan. Silakan coba kembali.",
        )


@router.post("/escalate", response_model=SupportTicketResponse, status_code=status.HTTP_201_CREATED)
async def escalate_to_admin(
    request: Request,
    payload: SupportEscalateRequest,
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    """Escalate unresolved issue to human admin support as a ticket."""
    ip = request.client.host if request.client else "unknown"

    # Rate limiting: max 3 escalations per 5 mins per IP/user
    rate_key = f"support:esc:user:{user.id}" if user else f"support:esc:ip:{ip}"
    if not await rate_limiter.check(rate_key):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Anda telah membuat tiket bantuan baru-baru ini. Mohon tunggu konfirmasi admin.",
        )

    # Guest validation: must supply at least one contact channel
    if not user and not (payload.guest_contact or payload.guest_name):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Sebagai tamu, harap isi nama atau kontak (email / akun Telegram) agar admin dapat menghubungi Anda.",
        )

    try:
        ticket = await support_ticket_service.create_escalation_ticket(
            db=db,
            user=user,
            req=payload,
        )
        return ticket
    except Exception as exc:
        logger.error("Failed to create escalation ticket: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=sanitize_exception(exc),
        )


@router.get("/tickets/my", response_model=list[SupportTicketResponse])
async def get_my_tickets(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get support tickets belonging to the authenticated user."""
    return await support_ticket_service.get_my_tickets(
        db=db, user_id=user.id, limit=limit, offset=offset
    )


# ── Admin Ticket Endpoints ───────────────────────────────────────────────────


@router.get("/admin/tickets", response_model=list[SupportTicketResponse])
async def admin_list_tickets(
    status_filter: str | None = Query(None, alias="status"),
    category_filter: str | None = Query(None, alias="category"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_role(["owner"])),
):
    """Owner admin endpoint to list and filter all support tickets."""
    return await support_ticket_service.admin_list_tickets(
        db=db,
        status_filter=status_filter,
        category_filter=category_filter,
        limit=limit,
        offset=offset,
    )


@router.patch("/admin/tickets/{ticket_id}", response_model=SupportTicketResponse)
async def admin_update_ticket(
    ticket_id: UUID,
    payload: SupportTicketUpdate,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_role(["owner"])),
):
    """Owner admin endpoint to update ticket status or add admin notes."""
    updated = await support_ticket_service.admin_update_ticket(
        db=db, ticket_id=ticket_id, payload=payload
    )
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tiket tidak ditemukan",
        )
    return updated
