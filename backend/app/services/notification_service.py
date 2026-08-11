"""Persistent notification creation and user-scoped mutations."""

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification


def create_notification(
    db: AsyncSession,
    user_id: UUID,
    event: str,
    *,
    kind: str = "info",
    data: dict[str, Any] | None = None,
    href: str | None = None,
) -> Notification:
    notification = Notification(
        user_id=user_id,
        event=event,
        kind=kind,
        data=data or {},
        href=href,
    )
    db.add(notification)
    return notification


async def list_notifications(
    db: AsyncSession, user_id: UUID, limit: int
) -> tuple[list[Notification], int]:
    result = await db.execute(
        select(Notification)
        .where(Notification.user_id == user_id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
    )
    unread = await db.scalar(
        select(func.count(Notification.id)).where(
            Notification.user_id == user_id,
            Notification.read_at.is_(None),
        )
    )
    return list(result.scalars().all()), int(unread or 0)


async def mark_read(db: AsyncSession, user_id: UUID, notification_id: UUID) -> None:
    await db.execute(
        update(Notification)
        .where(
            Notification.id == notification_id,
            Notification.user_id == user_id,
            Notification.read_at.is_(None),
        )
        .values(read_at=datetime.now(timezone.utc))
    )


async def mark_all_read(db: AsyncSession, user_id: UUID) -> None:
    await db.execute(
        update(Notification)
        .where(Notification.user_id == user_id, Notification.read_at.is_(None))
        .values(read_at=datetime.now(timezone.utc))
    )


async def remove_notification(
    db: AsyncSession, user_id: UUID, notification_id: UUID
) -> None:
    await db.execute(
        delete(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == user_id,
        )
    )


async def clear_notifications(db: AsyncSession, user_id: UUID) -> None:
    await db.execute(delete(Notification).where(Notification.user_id == user_id))
