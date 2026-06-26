"""Broadcast log routes — filter, export, stats."""

import csv
import io
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func as sa_func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.broadcast_job import BroadcastJob
from app.models.broadcast_log import BroadcastLog
from app.models.user import User
from app.schemas.log import BroadcastLogResponse

router = APIRouter(prefix="/api/broadcast", tags=["logs"])


@router.get("/{job_id}/logs", response_model=dict)
async def get_broadcast_logs(
    job_id: str,
    status: Optional[str] = Query(None, description="Filter by status: success, banned, etc."),
    search: Optional[str] = Query(None, max_length=200, description="Search in group identifier/name"),
    date_from: Optional[str] = Query(None, description="ISO date (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(None, description="ISO date (YYYY-MM-DD)"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Fetch paginated broadcast logs with filters."""
    # Verify job ownership
    result = await db.execute(
        select(BroadcastJob).where(BroadcastJob.id == job_id, BroadcastJob.user_id == user.id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Build query
    query = select(BroadcastLog).where(BroadcastLog.job_id == job_id)

    if status:
        query = query.where(BroadcastLog.status == status)
    if search:
        like_pattern = f"%{search}%"
        query = query.where(
            sa_func.lower(BroadcastLog.group_identifier).like(sa_func.lower(like_pattern))
            | sa_func.lower(BroadcastLog.group_name).like(sa_func.lower(like_pattern))
        )
    if date_from:
        try:
            dt_from = datetime.fromisoformat(date_from).replace(tzinfo=timezone.utc)
            query = query.where(BroadcastLog.sent_at >= dt_from)
        except ValueError:
            pass
    if date_to:
        try:
            dt_to = datetime.fromisoformat(date_to).replace(tzinfo=timezone.utc)
            query = query.where(BroadcastLog.sent_at <= dt_to)
        except ValueError:
            pass

    # Paginate
    count_query = select(sa_func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    offset = (page - 1) * page_size
    query = query.order_by(BroadcastLog.sent_at.desc()).offset(offset).limit(page_size)
    result = await db.execute(query)
    logs = result.scalars().all()

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
        "items": [BroadcastLogResponse.model_validate(log) for log in logs],
    }


@router.get("/{job_id}/logs/export")
async def export_logs_csv(
    job_id: str,
    status: Optional[str] = Query(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Export logs as CSV."""
    # Verify ownership
    result = await db.execute(
        select(BroadcastJob).where(BroadcastJob.id == job_id, BroadcastJob.user_id == user.id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    query = select(BroadcastLog).where(BroadcastLog.job_id == job_id)
    if status:
        query = query.where(BroadcastLog.status == status)
    query = query.order_by(BroadcastLog.sent_at.desc())

    result = await db.execute(query)
    logs = result.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Group ID", "Group Name", "Status", "Error", "Sent Text", "Sent At"])
    for log in logs:
        writer.writerow([
            log.group_identifier,
            log.group_name or "",
            log.status,
            log.error_message or "",
            log.sent_text or "",
            log.sent_at.isoformat() if log.sent_at else "",
        ])

    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=broadcast_{job_id[:8]}.csv"},
    )
