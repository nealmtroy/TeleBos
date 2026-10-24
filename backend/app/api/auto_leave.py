"""Auto-leave endpoints — scan accounts, start bulk leave jobs, pause/resume, view logs."""

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_role, UuidPath
from app.models.user import User
from app.schemas.auto_leave import (
    AutoLeaveJobCreate,
    AutoLeaveJobResponse,
    AutoLeaveLogResponse,
    AutoLeaveScanRequest,
    AutoLeaveScanResponse,
)
from app.services import auto_leave_service
from app.utils.rate_limiter import rate_limiter
from app.utils.sanitize import sanitize_exception

router = APIRouter(tags=["autoleave"])


@router.post(
    "/auto-leave/scan",
    response_model=AutoLeaveScanResponse,
)
async def scan_auto_leave(
    request: Request,
    payload: AutoLeaveScanRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(["freetrial", "basic", "pro", "premium", "owner"])),
):
    ip = request.client.host
    if not await rate_limiter.check(f"autoleave_scan:ip:{ip}"):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many scan requests. Please try again later.",
        )
    try:
        return await auto_leave_service.scan_account_dialogs(
            db, str(user.id), [str(a) for a in payload.account_ids]
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))


@router.post(
    "/auto-leave/start",
    response_model=AutoLeaveJobResponse,
    status_code=status.HTTP_201_CREATED,
)
async def start_auto_leave(
    request: Request,
    payload: AutoLeaveJobCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(["freetrial", "basic", "pro", "premium", "owner"])),
):
    ip = request.client.host
    if not await rate_limiter.check(f"autoleave:ip:{ip}"):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many auto-leave requests. Please try again later.",
        )
    if not await rate_limiter.check(f"autoleave:user:{user.id}"):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many auto-leave requests for this user. Please wait.",
        )
    try:
        primary_job, all_job_ids = await auto_leave_service.start_auto_leave(
            db,
            user_id=user.id,
            account_ids=[str(a) for a in payload.account_ids],
            leave_type=payload.leave_type,
            skip_creator=payload.skip_creator,
            delay_per_chat=payload.delay_per_chat,
            delay_randomized=payload.delay_randomized,
        )
        resp = AutoLeaveJobResponse.model_validate(primary_job)
        if len(all_job_ids) > 1:
            resp.related_job_ids = all_job_ids
        return resp
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))


@router.get("/auto-leave/history", response_model=list[AutoLeaveJobResponse])
async def auto_leave_history(
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(["freetrial", "basic", "pro", "premium", "owner"])),
):
    return await auto_leave_service.get_auto_leave_jobs(db, str(user.id), limit)


@router.get("/auto-leave/{job_id}", response_model=AutoLeaveJobResponse)
async def get_auto_leave(
    job_id: UuidPath,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(["freetrial", "basic", "pro", "premium", "owner"])),
):
    job = await auto_leave_service.get_auto_leave_job(db, job_id, str(user.id))
    if job is None:
        raise HTTPException(status_code=404, detail="Auto-leave job not found")
    return job


@router.post("/auto-leave/{job_id}/pause")
async def pause_auto_leave(
    job_id: UuidPath,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(["freetrial", "basic", "pro", "premium", "owner"])),
):
    job = await auto_leave_service.get_auto_leave_job(db, job_id, str(user.id))
    if job is None:
        raise HTTPException(status_code=404, detail="Auto-leave job not found")
    if job.status != "running":
        raise HTTPException(status_code=400, detail="Job is not running")

    await auto_leave_service.update_auto_leave_job_status(db, job, "paused")
    await db.commit()
    from app.utils.redis_dispatcher import publish_job_control

    await publish_job_control("autoleave", job.id, "pause")
    return {"message": "Paused"}


@router.post("/auto-leave/{job_id}/resume")
async def resume_auto_leave(
    job_id: UuidPath,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(["freetrial", "basic", "pro", "premium", "owner"])),
):
    job = await auto_leave_service.get_auto_leave_job(db, job_id, str(user.id))
    if job is None:
        raise HTTPException(status_code=404, detail="Auto-leave job not found")
    if job.status != "paused":
        raise HTTPException(status_code=400, detail="Job is not paused")

    await auto_leave_service.update_auto_leave_job_status(db, job, "running")
    await db.commit()
    from app.utils.redis_dispatcher import publish_job_control

    await publish_job_control("autoleave", job.id, "resume")
    return {"message": "Resumed"}


@router.post("/auto-leave/{job_id}/stop")
async def stop_auto_leave(
    job_id: UuidPath,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(["freetrial", "basic", "pro", "premium", "owner"])),
):
    job = await auto_leave_service.get_auto_leave_job(db, job_id, str(user.id))
    if job is None:
        raise HTTPException(status_code=404, detail="Auto-leave job not found")
    if job.status not in ("running", "paused"):
        raise HTTPException(status_code=400, detail="Job is not active")

    await auto_leave_service.update_auto_leave_job_status(db, job, "cancelled")
    await db.commit()
    from app.utils.redis_dispatcher import publish_job_control

    await publish_job_control("autoleave", job.id, "stop")
    return {"message": "Stopped"}


@router.delete("/auto-leave/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_auto_leave(
    job_id: UuidPath,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(["freetrial", "basic", "pro", "premium", "owner"])),
):
    deleted = await auto_leave_service.delete_auto_leave_job(db, job_id, str(user.id))
    if not deleted:
        raise HTTPException(status_code=404, detail="Auto-leave job not found")


@router.get("/auto-leave/{job_id}/logs", response_model=list[AutoLeaveLogResponse])
async def auto_leave_logs(
    job_id: UuidPath,
    limit: int = Query(200, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(["freetrial", "basic", "pro", "premium", "owner"])),
):
    job = await auto_leave_service.get_auto_leave_job(db, job_id, str(user.id))
    if job is None:
        raise HTTPException(status_code=404, detail="Auto-leave job not found")
    return await auto_leave_service.get_auto_leave_logs(db, job_id, limit)
