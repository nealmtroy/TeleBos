"""Invite endpoints — start invite jobs, manage, view logs."""

from fastapi import APIRouter, Depends, HTTPException, Query, status, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, require_role
from app.models.user import User
from app.schemas.invite import (
    InviteJobCreate,
    InviteJobResponse,
    InviteLogResponse,
)
from app.services import invite_service
from app.utils.rate_limiter import rate_limiter

router = APIRouter(tags=["invite"])

# All invite endpoints require at least "pro" role
INVITE_ALLOWED_ROLES = Depends(require_role(["pro", "premium", "owner"]))


# ── Invite Jobs ──────────────────────────────────────────────────────────────


@router.post(
    "/invite/start",
    response_model=InviteJobResponse,
    status_code=status.HTTP_201_CREATED,
)
async def start_invite(
    request: Request,
    payload: InviteJobCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(["pro", "premium", "owner"])),
):
    ip = request.client.host
    if not await rate_limiter.check(f"invite:ip:{ip}"):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many invite requests. Please try again later.",
        )
    if not await rate_limiter.check(f"invite:user:{user.id}"):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many invite requests for this user. Please wait.",
        )
    try:
        source_groups = [sg.model_dump() for sg in payload.source_groups]
        job = await invite_service.start_invite(
            db,
            user,
            [str(aid) for aid in payload.account_ids],
            payload.destination_group,
            payload.destination_type,
            source_groups,
            payload.delay_per_invite,
            payload.delay_per_batch,
            payload.batch_size,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return job


@router.get("/invite/history", response_model=list[InviteJobResponse])
async def invite_history(
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(["pro", "premium", "owner"])),
):
    jobs = await invite_service.get_invite_jobs(db, str(user.id), limit=limit)
    return jobs


@router.get("/invite/{job_id}", response_model=InviteJobResponse)
async def get_invite_job(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(["pro", "premium", "owner"])),
):
    job = await invite_service.get_invite_job(db, job_id, str(user.id))
    if job is None:
        raise HTTPException(status_code=404, detail="Invite job not found")
    return job


@router.post("/invite/{job_id}/pause")
async def pause_invite_job(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(["pro", "premium", "owner"])),
):
    job = await invite_service.get_invite_job(db, job_id, str(user.id))
    if job is None:
        raise HTTPException(status_code=404, detail="Invite job not found")
    if job.status != "running":
        raise HTTPException(status_code=400, detail="Job is not running")
    await invite_service.update_invite_job_status(db, job, "paused")
    return {"message": "Paused"}


@router.post("/invite/{job_id}/resume")
async def resume_invite_job(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(["pro", "premium", "owner"])),
):
    job = await invite_service.get_invite_job(db, job_id, str(user.id))
    if job is None:
        raise HTTPException(status_code=404, detail="Invite job not found")
    if job.status != "paused":
        raise HTTPException(status_code=400, detail="Job is not paused")
    await invite_service.update_invite_job_status(db, job, "running")
    return {"message": "Resumed"}


@router.post("/invite/{job_id}/stop")
async def stop_invite_job(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(["pro", "premium", "owner"])),
):
    job = await invite_service.get_invite_job(db, job_id, str(user.id))
    if job is None:
        raise HTTPException(status_code=404, detail="Invite job not found")
    if job.status not in ("running", "paused", "pending"):
        raise HTTPException(status_code=400, detail="Job cannot be stopped")
    await invite_service.update_invite_job_status(db, job, "cancelled")
    return {"message": "Stopped"}


@router.delete("/invite/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_invite_job(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(["pro", "premium", "owner"])),
):
    try:
        await invite_service.delete_invite_job(db, job_id, str(user.id))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/invite/{job_id}/retry", response_model=InviteJobResponse)
async def retry_invite_job(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(["pro", "premium", "owner"])),
):
    try:
        job = await invite_service.retry_invite_job(db, job_id, str(user.id))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return job


# ── Invite Logs ──────────────────────────────────────────────────────────────


@router.get("/invite/{job_id}/logs", response_model=list[InviteLogResponse])
async def get_invite_logs(
    job_id: str,
    status_filter: str | None = Query(None, alias="status"),
    error_type: str | None = Query(None),
    search: str | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(["pro", "premium", "owner"])),
):
    job = await invite_service.get_invite_job(db, job_id, str(user.id))
    if job is None:
        raise HTTPException(status_code=404, detail="Invite job not found")

    filters = {}
    if status_filter:
        filters["status"] = status_filter
    if error_type:
        filters["error_type"] = error_type
    if search:
        filters["search"] = search

    return await invite_service.get_invite_logs(db, job_id, filters, limit, offset)
