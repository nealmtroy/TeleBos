"""Support Ticket Service — manages ticket lifecycle, notifications, and Telegram bot alerts."""

import logging
import random
import string
from datetime import datetime, timezone
from uuid import UUID

import httpx
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.notification import Notification
from app.models.support_ticket import SupportTicket
from app.models.user import User
from app.schemas.support import SupportEscalateRequest, SupportTicketUpdate

logger = logging.getLogger(__name__)
settings = get_settings()


def generate_ticket_number() -> str:
    """Generate a clean human-readable ticket number like TB-72941."""
    digits = "".join(random.choices(string.digits, k=5))
    return f"TB-{digits}"


async def send_telegram_admin_alert(
    ticket: SupportTicket, sender_desc: str
) -> None:
    """Send an instant alert to the Telegram admin/log bot if configured."""
    bot_token = getattr(settings, "TELEGRAM_BOT_TOKEN", None)
    if not bot_token:
        return

    dest = getattr(settings, "BROADCAST_LOG_DEFAULT_DEST", "@teleboslogging_bot")
    if not dest:
        return

    text_msg = (
        f"🚨 <b>TIKET BANTUAN BARU DARI AI SUPPORT</b>\n\n"
        f"🎫 <b>No. Tiket:</b> #{ticket.ticket_number}\n"
        f"👤 <b>Pengirim:</b> {sender_desc}\n"
        f"📂 <b>Kategori:</b> {ticket.category}\n"
        f"📝 <b>Subjek:</b> {ticket.subject}\n"
        f"⚠️ <b>Alasan:</b> {ticket.escalation_reason or 'Permintaan bantuan manusia'}\n\n"
        f"Silakan periksa dashboard admin untuk merespons tiket ini."
    )

    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = {
        "chat_id": dest,
        "text": text_msg,
        "parse_mode": "HTML",
    }
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(url, json=payload, timeout=8.0)
            if resp.status_code != 200:
                logger.warning(
                    "Failed to send Telegram admin alert (status %d): %s",
                    resp.status_code,
                    resp.text,
                )
    except Exception as e:
        logger.warning("Error sending Telegram admin alert: %s", e)


async def create_escalation_ticket(
    db: AsyncSession,
    user: User | None,
    req: SupportEscalateRequest,
) -> SupportTicket:
    """Create a new support ticket and notify admins."""
    ticket_num = generate_ticket_number()

    # Convert transcript to JSON list of dicts
    transcript_dicts = [
        {"role": m.role, "content": m.content, "timestamp": datetime.now(timezone.utc).isoformat()}
        for m in req.transcript
    ]

    related_order_uuid: UUID | None = None
    if req.related_order_id:
        try:
            related_order_uuid = UUID(req.related_order_id)
        except Exception:
            pass

    ticket = SupportTicket(
        ticket_number=ticket_num,
        user_id=user.id if user else None,
        guest_name=req.guest_name if not user else None,
        guest_contact=req.guest_contact if not user else None,
        category=req.category or "general",
        status="open",
        priority="normal",
        subject=req.subject,
        summary=req.escalation_reason,
        transcript=transcript_dicts,
        related_order_id=related_order_uuid,
        escalation_reason=req.escalation_reason,
    )
    db.add(ticket)
    await db.flush()

    # 1. Notify admin users in-app
    owners_res = await db.execute(select(User).where(User.role == "owner"))
    owners = list(owners_res.scalars().all())

    sender_label = user.email if user else f"Guest ({req.guest_name or req.guest_contact or 'Anon'})"

    for owner in owners:
        notif = Notification(
            user_id=owner.id,
            event="support_ticket_created",
            kind="warning",
            data={
                "ticket_id": str(ticket.id),
                "ticket_number": ticket.ticket_number,
                "subject": ticket.subject,
                "sender": sender_label,
            },
            href=f"/admin/tickets?id={ticket.id}",
        )
        db.add(notif)

    await db.commit()
    await db.refresh(ticket)

    # 2. Async Telegram notification to admin
    await send_telegram_admin_alert(ticket, sender_label)

    return ticket


async def get_my_tickets(
    db: AsyncSession, user_id: UUID, limit: int = 20, offset: int = 0
) -> list[SupportTicket]:
    """Retrieve tickets created by the authenticated user."""
    res = await db.execute(
        select(SupportTicket)
        .where(SupportTicket.user_id == user_id)
        .order_by(desc(SupportTicket.created_at))
        .limit(limit)
        .offset(offset)
    )
    return list(res.scalars().all())


async def admin_list_tickets(
    db: AsyncSession,
    status_filter: str | None = None,
    category_filter: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[SupportTicket]:
    """Admin endpoint to list all tickets."""
    query = select(SupportTicket).order_by(desc(SupportTicket.created_at))

    if status_filter:
        query = query.where(SupportTicket.status == status_filter)
    if category_filter:
        query = query.where(SupportTicket.category == category_filter)

    query = query.limit(limit).offset(offset)
    res = await db.execute(query)
    return list(res.scalars().all())


async def admin_update_ticket(
    db: AsyncSession,
    ticket_id: UUID,
    payload: SupportTicketUpdate,
) -> SupportTicket | None:
    """Admin updates ticket status, priority, or admin notes."""
    res = await db.execute(select(SupportTicket).where(SupportTicket.id == ticket_id))
    ticket = res.scalar_one_or_none()
    if not ticket:
        return None

    if payload.status is not None:
        ticket.status = payload.status
        if payload.status in ("resolved", "closed"):
            ticket.resolved_at = datetime.now(timezone.utc)
    if payload.priority is not None:
        ticket.priority = payload.priority
    if payload.admin_notes is not None:
        ticket.admin_notes = payload.admin_notes

    await db.commit()
    await db.refresh(ticket)
    return ticket
