"""Broadcast job routes — start, pause, resume, stop, status."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func as sa_func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.broadcast_job import BroadcastJob
from app.models.user import User
from app.schemas.broadcast import BroadcastStartRequest, BroadcastStatusResponse
from app.services.broadcast_worker import broadcast_manager

router = APIRouter(prefix="/api/broadcast", tags=["broadcast"])


@router.post("/start", response_model=BroadcastStatusResponse, status_code=201)
async def start_broadcast(
    body: BroadcastStartRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Start a new broadcast job."""
    job = BroadcastJob(
        user_id=user.id,
        account_id=body.account_id,
        group_list_id=body.group_list_id,
        text_list_id=body.text_list_id,
        single_text=body.single_text,
        mode=body.mode,
        delay_between_groups=body.delay_between_groups,
        delay_after_all=body.delay_after_all,
        status="pending",
    )
    db.add(job)
    await db.flush()
    job_id = job.id

    # Start the background worker
    await broadcast_manager.start(job_id)

    await db.refresh(job)
    return job


@router.post("/{job_id}/pause")
async def pause_broadcast(job_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # Verify ownership
    result = await db.execute(
        select(BroadcastJob).where(BroadcastJob.id == job_id, BroadcastJob.user_id == user.id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    success = await broadcast_manager.pause(job_id)
    if not success:
        raise HTTPException(status_code=400, detail="Job is not running")
    return {"message": "Broadcast paused"}


@router.post("/{job_id}/resume")
async def resume_broadcast(job_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(BroadcastJob).where(BroadcastJob.id == job_id, BroadcastJob.user_id == user.id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    success = await broadcast_manager.resume(job_id)
    if not success:
        raise HTTPException(status_code=400, detail="Job is not paused")
    return {"message": "Broadcast resumed"}


@router.post("/{job_id}/stop")
async def stop_broadcast(job_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(BroadcastJob).where(BroadcastJob.id == job_id, BroadcastJob.user_id == user.id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    success = await broadcast_manager.stop(job_id)
    if not success:
        raise HTTPException(status_code=400, detail="Job is not running")
    return {"message": "Broadcast stopped"}


@router.get("/{job_id}/status", response_model=BroadcastStatusResponse)
async def get_broadcast_status(job_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(BroadcastJob).where(BroadcastJob.id == job_id, BroadcastJob.user_id == user.id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.get("", response_model=list[BroadcastStatusResponse])
async def list_broadcasts(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(BroadcastJob)
        .where(BroadcastJob.user_id == user.id)
        .order_by(BroadcastJob.created_at.desc())
        .limit(50)
    )
    return result.scalars().all()
