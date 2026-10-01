"""Auto-join endpoints — start bulk group-join jobs, manage, view logs."""

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_role
from app.models.user import User
from app.schemas.auto_join import (
    AutoJoinJobCreate,
    AutoJoinJobResponse,
    AutoJoinLogResponse,
)
from app.services import auto_join_service
from app.utils.rate_limiter import rate_limiter
from app.utils.sanitize import sanitize_exception

router = APIRouter(tags=["autojoin"])


@router.post(
    "/auto-join/start",
    response_model=AutoJoinJobResponse,
    status_code=status.HTTP_201_CREATED,
)
async def start_auto_join(
    request: Request,
    payload: AutoJoinJobCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(["pro", "premium", "owner"])),
):
    ip = request.client.host
    if not await rate_limiter.check(f"autojoin:ip:{ip}"):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many auto-join requests. Please try again later.",
        )
    if not await rate_limiter.check(f"autojoin:user:{user.id}"):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many auto-join requests for this user. Please wait.",
        )
    try:
        targets = [t.model_dump() for t in payload.targets]
        job = await auto_join_service.start_auto_join(
            db,
            user_id=user.id,
            account_ids=[str(a) for a in payload.account_ids],
            targets=targets,
            distribution_mode=payload.distribution_mode,
            delay_per_group=payload.delay_per_group,
            delay_randomized=payload.delay_randomized,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))
    return job


@router.get("/auto-join/history", response_model=list[AutoJoinJobResponse])
async def auto_join_history(
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(["pro", "premium", "owner"])),
):
    return await auto_join_service.get_auto_join_jobs(db, str(user.id), limit)


@router.get("/auto-join/{job_id}", response_model=AutoJoinJobResponse)
async def get_auto_join(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(["pro", "premium", "owner"])),
):
    job = await auto_join_service.get_auto_join_job(db, job_id, str(user.id))
    if job is None:
        raise HTTPException(status_code=404, detail="Auto-join job not found")
    return job


@router.post("/auto-join/{job_id}/pause")
async def pause_auto_join(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(["pro", "premium", "owner"])),
):
    job = await auto_join_service.get_auto_join_job(db, job_id, str(user.id))
    if job is None:
        raise HTTPException(status_code=404, detail="Auto-join job not found")
    if job.status != "running":
        raise HTTPException(status_code=400, detail="Job is not running")

    await auto_join_service.update_auto_join_job_status(db, job, "paused")
    from app.utils.redis_dispatcher import publish_job_control

    await publish_job_control("autojoin", job.id, "pause")
    return {"message": "Paused"}


@router.post("/auto-join/{job_id}/resume")
async def resume_auto_join(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(["pro", "premium", "owner"])),
):
    job = await auto_join_service.get_auto_join_job(db, job_id, str(user.id))
    if job is None:
        raise HTTPException(status_code=404, detail="Auto-join job not found")
    if job.status != "paused":
        raise HTTPException(status_code=400, detail="Job is not paused")

    await auto_join_service.update_auto_join_job_status(db, job, "running")
    await db.commit()
    from app.utils.redis_dispatcher import publish_job_control

    await publish_job_control("autojoin", job.id, "resume")
    return {"message": "Resumed"}


@router.post("/auto-join/{job_id}/stop")
async def stop_auto_join(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(["pro", "premium", "owner"])),
):
    job = await auto_join_service.get_auto_join_job(db, job_id, str(user.id))
    if job is None:
        raise HTTPException(status_code=404, detail="Auto-join job not found")
    if job.status not in ("running", "paused"):
        raise HTTPException(status_code=400, detail="Job is not active")

    await auto_join_service.update_auto_join_job_status(db, job, "cancelled")
    from app.utils.redis_dispatcher import publish_job_control

    await publish_job_control("autojoin", job.id, "stop")
    return {"message": "Stopped"}


@router.delete("/auto-join/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_auto_join(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(["pro", "premium", "owner"])),
):
    try:
        await auto_join_service.delete_auto_join_job(db, job_id, str(user.id))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))


@router.get("/auto-join/{job_id}/logs", response_model=list[AutoJoinLogResponse])
async def auto_join_logs(
    job_id: str,
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(["pro", "premium", "owner"])),
):
    job = await auto_join_service.get_auto_join_job(db, job_id, str(user.id))
    if job is None:
        raise HTTPException(status_code=404, detail="Auto-join job not found")
    return await auto_join_service.get_auto_join_logs(db, job_id, limit, offset)
