"""Statistics routes for broadcast dashboard."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func as sa_func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.broadcast_job import BroadcastJob
from app.models.broadcast_log import BroadcastLog
from app.models.telegram_account import TelegramAccount
from app.models.user import User

router = APIRouter(prefix="/api/stats", tags=["stats"])


@router.get("/broadcast")
async def broadcast_stats(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Aggregate broadcast statistics for the current user."""
    # Total jobs
    total_jobs_result = await db.execute(
        select(sa_func.count(BroadcastJob.id)).where(BroadcastJob.user_id == user.id)
    )
    total_jobs = total_jobs_result.scalar() or 0

    # Jobs by status
    jobs_by_status_result = await db.execute(
        select(BroadcastJob.status, sa_func.count(BroadcastJob.id))
        .where(BroadcastJob.user_id == user.id)
        .group_by(BroadcastJob.status)
    )
    jobs_by_status = dict(jobs_by_status_result.all())

    # Total logs across all jobs (via join)
    total_logs_result = await db.execute(
        select(sa_func.count(BroadcastLog.id))
        .join(BroadcastJob, BroadcastLog.job_id == BroadcastJob.id)
        .where(BroadcastJob.user_id == user.id)
    )
    total_logs = total_logs_result.scalar() or 0

    # Logs by status (error breakdown)
    logs_by_status_result = await db.execute(
        select(BroadcastLog.status, sa_func.count(BroadcastLog.id))
        .join(BroadcastJob, BroadcastLog.job_id == BroadcastJob.id)
        .where(BroadcastJob.user_id == user.id)
        .group_by(BroadcastLog.status)
    )
    logs_by_status = dict(logs_by_status_result.all())

    # Account stats
    accounts_result = await db.execute(
        select(sa_func.count(TelegramAccount.id)).where(TelegramAccount.user_id == user.id)
    )
    total_accounts = accounts_result.scalar() or 0

    # Success rate
    total = sum(logs_by_status.values())
    success_count = logs_by_status.get("success", 0)
    success_rate = round((success_count / total * 100), 2) if total > 0 else 0

    return {
        "total_jobs": total_jobs,
        "jobs_by_status": jobs_by_status,
        "total_logs": total_logs,
        "logs_by_status": logs_by_status,
        "total_accounts": total_accounts,
        "success_rate": success_rate,
    }
