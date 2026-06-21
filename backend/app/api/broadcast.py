"""Broadcast endpoints — group lists, text lists, jobs, logs."""

from fastapi import APIRouter, Depends, HTTPException, Query, status, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.broadcast import (
    GroupListCreate,
    GroupListUpdate,
    GroupListResponse,
    TextListCreate,
    TextListUpdate,
    TextListResponse,
    BroadcastStartRequest,
    BroadcastJobResponse,
    BroadcastLogResponse,
)
from app.services import broadcast_service
from app.utils.rate_limiter import rate_limiter

router = APIRouter(tags=["broadcast"])


# ── Group Lists ──────────────────────────────────────────────────────────────


@router.get("/group-lists", response_model=list[GroupListResponse])
async def list_group_lists(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    lists = await broadcast_service.get_group_lists(db, user)
    return lists


@router.post("/group-lists", response_model=GroupListResponse, status_code=status.HTTP_201_CREATED)
async def create_group_list(
    payload: GroupListCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    items = [i.model_dump() for i in payload.items]
    return await broadcast_service.create_group_list(db, user, payload.name, items)


@router.put("/group-lists/{gl_id}", response_model=GroupListResponse)
async def update_group_list(
    gl_id: str,
    payload: GroupListUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        items = [i.model_dump() for i in payload.items] if payload.items else None
        return await broadcast_service.update_group_list(
            db, gl_id, str(user.id), payload.name, items
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.delete("/group-lists/{gl_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_group_list(
    gl_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        await broadcast_service.delete_group_list(db, gl_id, str(user.id))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


# ── Text Lists ───────────────────────────────────────────────────────────────


@router.get("/text-lists", response_model=list[TextListResponse])
async def list_text_lists(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    lists = await broadcast_service.get_text_lists(db, user)
    return lists


@router.post("/text-lists", response_model=TextListResponse, status_code=status.HTTP_201_CREATED)
async def create_text_list(
    payload: TextListCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await broadcast_service.create_text_list(db, user, payload.name, payload.texts)


@router.put("/text-lists/{tl_id}", response_model=TextListResponse)
async def update_text_list(
    tl_id: str,
    payload: TextListUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        return await broadcast_service.update_text_list(
            db, tl_id, str(user.id), payload.name, payload.texts
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.delete("/text-lists/{tl_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_text_list(
    tl_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        await broadcast_service.delete_text_list(db, tl_id, str(user.id))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


# ── Broadcast Jobs ───────────────────────────────────────────────────────────


@router.post("/broadcast/start", response_model=BroadcastJobResponse, status_code=status.HTTP_201_CREATED)
async def start_broadcast(
    request: Request,
    payload: BroadcastStartRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ip = request.client.host
    if not await rate_limiter.check(f"broadcast:ip:{ip}"):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many broadcast requests. Please try again later.",
        )
    # Also limit per-user to prevent abuse
    if not await rate_limiter.check(f"broadcast:user:{user.id}"):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many broadcast requests for this user. Please wait.",
        )
    try:
        job = await broadcast_service.start_broadcast(
            db=db,
            user=user,
            account_ids=[str(aid) for aid in payload.account_ids],
            group_list_id=str(payload.group_list_id),
            text_list_id=str(payload.text_list_id) if payload.text_list_id else None,
            mode=payload.mode,
            custom_text=payload.custom_text,
            delay_per_group=payload.delay_per_group,
            delay_after_all=payload.delay_after_all,
            loop_enabled=payload.loop_enabled,
            delay_randomized=payload.delay_randomized,
            log_destination=payload.log_destination,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return job


@router.get("/broadcast/history", response_model=list[BroadcastJobResponse])
async def job_history(
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    jobs = await broadcast_service.get_jobs_for_user(db, str(user.id), limit=limit)
    return jobs


@router.get("/broadcast/{job_id}", response_model=BroadcastJobResponse)
async def get_job(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    job = await broadcast_service.get_job(db, job_id, str(user.id))
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.post("/broadcast/{job_id}/pause")
async def pause_job(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    job = await broadcast_service.get_job(db, job_id, str(user.id))
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status != "running":
        raise HTTPException(status_code=400, detail="Job is not running")
    await broadcast_service.update_job_status(db, job, "paused")
    return {"message": "Paused"}


@router.post("/broadcast/{job_id}/resume")
async def resume_job(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    job = await broadcast_service.get_job(db, job_id, str(user.id))
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status != "paused":
        raise HTTPException(status_code=400, detail="Job is not paused")
    await broadcast_service.update_job_status(db, job, "running")
    return {"message": "Resumed"}


@router.post("/broadcast/{job_id}/stop")
async def stop_job(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    job = await broadcast_service.get_job(db, job_id, str(user.id))
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status not in ("running", "paused", "pending"):
        raise HTTPException(status_code=400, detail="Job cannot be stopped")
    await broadcast_service.update_job_status(db, job, "cancelled")
    return {"message": "Stopped"}


@router.delete("/broadcast/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_job(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Delete a broadcast job from history. Only terminal-status jobs can be deleted."""
    try:
        await broadcast_service.delete_job(db, job_id, str(user.id))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/broadcast/{job_id}/retry", response_model=BroadcastJobResponse)
async def retry_job(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Reset and re-queue a completed, cancelled, or failed broadcast job."""
    try:
        job = await broadcast_service.retry_job(db, job_id, str(user.id))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return job


# ── Broadcast Logs ───────────────────────────────────────────────────────────


@router.get("/broadcast/{job_id}/logs", response_model=list[BroadcastLogResponse])
async def get_logs(
    job_id: str,
    status_filter: str | None = Query(None, alias="status"),
    error_type: str | None = Query(None),
    search: str | None = Query(None),
    cycle: int | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    job = await broadcast_service.get_job(db, job_id, str(user.id))
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")

    filters = {}
    if status_filter:
        filters["status"] = status_filter
    if error_type:
        filters["error_type"] = error_type
    if search:
        filters["search"] = search
    if cycle:
        filters["cycle"] = cycle

    return await broadcast_service.get_job_logs(db, job_id, filters, limit, offset)


@router.get("/broadcast/{job_id}/logs/export")
async def export_logs(
    job_id: str,
    format: str = Query("csv", regex="^(csv|json)$"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Export broadcast logs as CSV or JSON."""
    import io
    import csv
    import json
    from fastapi.responses import StreamingResponse

    job = await broadcast_service.get_job(db, job_id, str(user.id))
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")

    logs = await broadcast_service.get_job_logs(db, job_id, limit=10000)

    if format == "json":
        data = [
            {
                "id": str(l.id),
                "cycle": l.cycle_number,
                "group": l.group_identifier,
                "status": l.status,
                "error_type": l.error_type,
                "error_message": l.error_message,
                "text": l.sent_text,
                "sent_at": l.sent_at.isoformat() if l.sent_at else None,
            }
            for l in logs
        ]
        output = json.dumps(data, indent=2, ensure_ascii=False)
        return StreamingResponse(
            io.StringIO(output),
            media_type="application/json",
            headers={"Content-Disposition": f"attachment; filename=broadcast_logs_{job_id}.json"},
        )

    # CSV — prefix formula characters to prevent CSV injection
    def _safe_csv(val: str) -> str:
        if val and val[0] in ("=", "+", "-", "@", "\t", "\r"):
            return "'" + val
        return val

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["id", "cycle", "group", "status", "error_type", "error_message", "text", "sent_at"])
    for l in logs:
        writer.writerow([
            str(l.id), l.cycle_number,
            _safe_csv(l.group_identifier or ""), l.status,
            _safe_csv(l.error_type or ""), _safe_csv(l.error_message or ""),
            _safe_csv((l.sent_text or "")[:200]),
            l.sent_at.isoformat() if l.sent_at else "",
        ])
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=broadcast_logs_{job_id}.csv"},
    )
