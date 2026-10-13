"""Admin broadcast monitoring, inspection, control, and bulk execution endpoints."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_role
from app.models.broadcast_job import BroadcastJob
from app.models.group_list import GroupList
from app.models.telegram_account import TelegramAccount
from app.models.user import User
from app.schemas.admin import (
    BroadcastAccountInfo,
    BroadcastAdminJobResponse,
    BroadcastAdminListResponse,
    BroadcastAdminStatsResponse,
    BroadcastBulkActionRequest,
)
from app.services import broadcast_service

router = APIRouter()


@router.get("/broadcasts", response_model=BroadcastAdminListResponse)
async def list_admin_broadcasts(
    search: str | None = Query(None),
    status: str | None = Query(None),
    loop_enabled: bool | None = Query(None),
    duplicates_only: bool | None = Query(None),
    user_id: str | None = Query(None),
    sort_by: str = Query("updated_at"),
    sort_order: str = Query("desc"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """List all broadcast jobs across all users with filters, sorting, duplicate account detection, and pagination. Owner only."""
    offset = (page - 1) * limit

    # First, detect duplicate account usage across all active/pending/running/paused jobs
    active_jobs_stmt = select(
        BroadcastJob.id, BroadcastJob.account_ids, BroadcastJob.status
    ).where(BroadcastJob.status.in_(["running", "paused", "pending"]))
    active_jobs_res = await db.execute(active_jobs_stmt)
    active_jobs = active_jobs_res.all()

    account_to_active_jobs: dict[str, list[dict]] = {}
    for aj_id, aj_acc_ids, aj_status in active_jobs:
        if isinstance(aj_acc_ids, list):
            for aid in aj_acc_ids:
                aid_str = str(aid)
                if aid_str not in account_to_active_jobs:
                    account_to_active_jobs[aid_str] = []
                account_to_active_jobs[aid_str].append(
                    {"job_id": aj_id, "status": aj_status}
                )

    # Jobs that share at least one account with another active job
    conflicting_job_ids: set[UUID] = set()
    for aid_str, job_list in account_to_active_jobs.items():
        if len(job_list) > 1:
            for j in job_list:
                conflicting_job_ids.add(j["job_id"])

    stmt = (
        select(
            BroadcastJob,
            User.email.label("user_email"),
            User.full_name.label("user_full_name"),
            GroupList.name.label("group_list_name"),
        )
        .outerjoin(User, BroadcastJob.user_id == User.id)
        .outerjoin(GroupList, BroadcastJob.group_list_id == GroupList.id)
    )
    count_stmt = (
        select(func.count(BroadcastJob.id))
        .outerjoin(User, BroadcastJob.user_id == User.id)
        .outerjoin(GroupList, BroadcastJob.group_list_id == GroupList.id)
    )

    if status and status != "all":
        stmt = stmt.where(BroadcastJob.status == status)
        count_stmt = count_stmt.where(BroadcastJob.status == status)

    if loop_enabled is not None:
        stmt = stmt.where(BroadcastJob.loop_enabled == loop_enabled)
        count_stmt = count_stmt.where(BroadcastJob.loop_enabled == loop_enabled)

    if duplicates_only:
        if not conflicting_job_ids:
            return BroadcastAdminListResponse(jobs=[], total=0)
        stmt = stmt.where(BroadcastJob.id.in_(list(conflicting_job_ids)))
        count_stmt = count_stmt.where(
            BroadcastJob.id.in_(list(conflicting_job_ids))
        )

    if user_id:
        try:
            u_uuid = UUID(user_id)
            stmt = stmt.where(BroadcastJob.user_id == u_uuid)
            count_stmt = count_stmt.where(BroadcastJob.user_id == u_uuid)
        except ValueError:
            pass

    if search:
        search_val = search.replace("%", "\\%").replace("_", "\\_").strip()
        search_pattern = f"%{search_val}%"
        try:
            search_uuid = UUID(search.strip())
            stmt = stmt.where(
                (BroadcastJob.id == search_uuid)
                | (User.email.ilike(search_pattern, escape="\\"))
                | (User.full_name.ilike(search_pattern, escape="\\"))
                | (GroupList.name.ilike(search_pattern, escape="\\"))
            )
            count_stmt = count_stmt.where(
                (BroadcastJob.id == search_uuid)
                | (User.email.ilike(search_pattern, escape="\\"))
                | (User.full_name.ilike(search_pattern, escape="\\"))
                | (GroupList.name.ilike(search_pattern, escape="\\"))
            )
        except ValueError:
            stmt = stmt.where(
                (User.email.ilike(search_pattern, escape="\\"))
                | (User.full_name.ilike(search_pattern, escape="\\"))
                | (GroupList.name.ilike(search_pattern, escape="\\"))
            )
            count_stmt = count_stmt.where(
                (User.email.ilike(search_pattern, escape="\\"))
                | (User.full_name.ilike(search_pattern, escape="\\"))
                | (GroupList.name.ilike(search_pattern, escape="\\"))
            )

    total_res = await db.execute(count_stmt)
    total = total_res.scalar() or 0

    # Sorting
    sort_column = BroadcastJob.updated_at
    if sort_by == "sent_count":
        sort_column = BroadcastJob.sent_count
    elif sort_by == "fail_count":
        sort_column = BroadcastJob.fail_count
    elif sort_by == "progress":
        sort_column = BroadcastJob.progress
    elif sort_by == "created_at":
        sort_column = BroadcastJob.created_at
    elif sort_by == "total_groups":
        sort_column = BroadcastJob.total_groups

    if sort_order == "asc":
        stmt = stmt.order_by(sort_column.asc())
    else:
        stmt = stmt.order_by(sort_column.desc())

    stmt = stmt.offset(offset).limit(limit)
    res = await db.execute(stmt)
    rows = res.all()

    # Collect all account UUIDs across the page of jobs to batch resolve names & Telegram IDs
    all_account_uuids = set()
    for row in rows:
        job = row[0]
        if isinstance(job.account_ids, list):
            for aid in job.account_ids:
                try:
                    all_account_uuids.add(UUID(str(aid)))
                except (ValueError, TypeError):
                    pass

    accounts_map: dict[str, BroadcastAccountInfo] = {}
    if all_account_uuids:
        acc_stmt = select(TelegramAccount).where(
            TelegramAccount.id.in_(list(all_account_uuids))
        )
        acc_res = await db.execute(acc_stmt)
        for acc in acc_res.scalars().all():
            full_name = f"{acc.first_name or ''} {acc.last_name or ''}".strip()
            name_display = full_name or acc.username or acc.phone
            accounts_map[str(acc.id)] = BroadcastAccountInfo(
                id=acc.id,
                telegram_id=acc.telegram_id,
                phone=acc.phone,
                name=name_display,
                username=acc.username,
            )

    jobs_response = []
    for row in rows:
        job, u_email, u_name, gl_name = row
        acc_ids = job.account_ids or []
        job_accounts = []
        dup_account_count = 0
        conflicting_other_job_ids = set()

        if isinstance(acc_ids, list):
            for aid in acc_ids:
                aid_str = str(aid)
                acc_info = accounts_map.get(aid_str)

                # Check duplicate active jobs for this specific account
                other_active_jobs = [
                    j["job_id"]
                    for j in account_to_active_jobs.get(aid_str, [])
                    if j["job_id"] != job.id
                ]
                is_dup = len(other_active_jobs) > 0
                if is_dup:
                    dup_account_count += 1
                    for ojid in other_active_jobs:
                        conflicting_other_job_ids.add(ojid)

                if acc_info:
                    job_accounts.append(
                        BroadcastAccountInfo(
                            id=acc_info.id,
                            telegram_id=acc_info.telegram_id,
                            phone=acc_info.phone,
                            name=acc_info.name,
                            username=acc_info.username,
                            is_duplicate=is_dup,
                            conflicting_job_ids=other_active_jobs,
                        )
                    )

        acc_count = len(acc_ids) if isinstance(acc_ids, list) else 0
        has_dup = len(conflicting_other_job_ids) > 0

        jobs_response.append(
            BroadcastAdminJobResponse(
                id=job.id,
                user_id=job.user_id,
                user_email=u_email,
                user_full_name=u_name,
                group_list_id=job.group_list_id,
                group_list_name=gl_name,
                text_list_id=job.text_list_id,
                mode=job.mode,
                custom_text=job.custom_text,
                status=job.status,
                progress=job.progress,
                total_groups=job.total_groups,
                sent_count=job.sent_count,
                fail_count=job.fail_count,
                delay_per_group=job.delay_per_group,
                delay_after_all=job.delay_after_all,
                loop_enabled=job.loop_enabled,
                delay_randomized=job.delay_randomized,
                log_destination=job.log_destination,
                account_count=acc_count,
                accounts=job_accounts,
                has_duplicate_accounts=has_dup,
                duplicate_account_count=dup_account_count,
                duplicate_job_ids=list(conflicting_other_job_ids),
                created_at=job.created_at,
                updated_at=job.updated_at,
                completed_at=job.completed_at,
            )
        )

    return BroadcastAdminListResponse(jobs=jobs_response, total=total)


@router.get("/broadcasts/stats", response_model=BroadcastAdminStatsResponse)
async def get_admin_broadcast_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """Get system-wide aggregate broadcast metrics. Owner only."""
    total_q = await db.execute(select(func.count(BroadcastJob.id)))
    total_jobs = total_q.scalar() or 0

    running_q = await db.execute(
        select(func.count(BroadcastJob.id)).where(BroadcastJob.status == "running")
    )
    running_jobs = running_q.scalar() or 0

    paused_q = await db.execute(
        select(func.count(BroadcastJob.id)).where(BroadcastJob.status == "paused")
    )
    paused_jobs = paused_q.scalar() or 0

    completed_q = await db.execute(
        select(func.count(BroadcastJob.id)).where(
            BroadcastJob.status == "completed"
        )
    )
    completed_jobs = completed_q.scalar() or 0

    failed_q = await db.execute(
        select(func.count(BroadcastJob.id)).where(BroadcastJob.status == "failed")
    )
    failed_jobs = failed_q.scalar() or 0

    cancelled_q = await db.execute(
        select(func.count(BroadcastJob.id)).where(
            BroadcastJob.status == "cancelled"
        )
    )
    cancelled_jobs = cancelled_q.scalar() or 0

    sent_q = await db.execute(
        select(func.coalesce(func.sum(BroadcastJob.sent_count), 0))
    )
    total_sent = int(sent_q.scalar() or 0)

    fail_q = await db.execute(
        select(func.coalesce(func.sum(BroadcastJob.fail_count), 0))
    )
    total_failed = int(fail_q.scalar() or 0)

    looping_q = await db.execute(
        select(func.count(BroadcastJob.id)).where(
            BroadcastJob.status.in_(["running", "paused"]),
            BroadcastJob.loop_enabled.is_(True),
        )
    )
    active_looping_jobs = looping_q.scalar() or 0

    # Calculate duplicate active conflict jobs
    active_jobs_stmt = select(BroadcastJob.id, BroadcastJob.account_ids).where(
        BroadcastJob.status.in_(["running", "paused", "pending"])
    )
    active_jobs_res = await db.execute(active_jobs_stmt)
    active_jobs = active_jobs_res.all()

    account_to_active_jobs: dict[str, list[UUID]] = {}
    for aj_id, aj_acc_ids in active_jobs:
        if isinstance(aj_acc_ids, list):
            for aid in aj_acc_ids:
                aid_str = str(aid)
                if aid_str not in account_to_active_jobs:
                    account_to_active_jobs[aid_str] = []
                account_to_active_jobs[aid_str].append(aj_id)

    conflicting_job_ids: set[UUID] = set()
    for aid_str, job_list in account_to_active_jobs.items():
        if len(job_list) > 1:
            for jid in job_list:
                conflicting_job_ids.add(jid)

    return BroadcastAdminStatsResponse(
        total_jobs=total_jobs,
        running_jobs=running_jobs,
        paused_jobs=paused_jobs,
        completed_jobs=completed_jobs,
        failed_jobs=failed_jobs,
        cancelled_jobs=cancelled_jobs,
        total_sent=total_sent,
        total_failed=total_failed,
        active_looping_jobs=active_looping_jobs,
        duplicate_conflict_jobs=len(conflicting_job_ids),
    )


@router.post("/broadcasts/{job_id}/pause")
async def admin_pause_broadcast(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """Admin pause any running broadcast job."""
    try:
        job_uuid = UUID(job_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid job ID format")

    res = await db.execute(
        select(BroadcastJob).where(BroadcastJob.id == job_uuid)
    )
    job = res.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Broadcast job not found")

    if job.status != "running":
        raise HTTPException(
            status_code=400, detail=f"Cannot pause job with status '{job.status}'"
        )

    await broadcast_service.update_job_status(db, job, "paused")
    await db.commit()
    from app.utils.redis_dispatcher import publish_job_control

    await publish_job_control("broadcast", job.id, "pause")
    return {
        "message": "Job paused successfully",
        "job_id": job_id,
        "status": "paused",
    }


@router.post("/broadcasts/{job_id}/resume")
async def admin_resume_broadcast(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """Admin resume any paused broadcast job."""
    try:
        job_uuid = UUID(job_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid job ID format")

    res = await db.execute(
        select(BroadcastJob).where(BroadcastJob.id == job_uuid)
    )
    job = res.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Broadcast job not found")

    if job.status != "paused":
        raise HTTPException(
            status_code=400, detail=f"Cannot resume job with status '{job.status}'"
        )

    await broadcast_service.update_job_status(db, job, "running")
    await db.commit()

    from app.utils.redis_dispatcher import publish_job_control

    await publish_job_control("broadcast", job.id, "resume")

    return {
        "message": "Job resumed successfully",
        "job_id": job_id,
        "status": "running",
    }


@router.post("/broadcasts/{job_id}/stop")
async def admin_stop_broadcast(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """Admin stop/cancel any active or paused broadcast job."""
    try:
        job_uuid = UUID(job_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid job ID format")

    res = await db.execute(
        select(BroadcastJob).where(BroadcastJob.id == job_uuid)
    )
    job = res.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Broadcast job not found")

    if job.status not in ("running", "paused", "pending"):
        raise HTTPException(
            status_code=400, detail=f"Cannot stop job with status '{job.status}'"
        )

    await broadcast_service.update_job_status(db, job, "cancelled")
    await db.commit()
    from app.utils.redis_dispatcher import publish_job_control

    await publish_job_control("broadcast", job.id, "stop")
    return {
        "message": "Job stopped successfully",
        "job_id": job_id,
        "status": "cancelled",
    }


@router.delete("/broadcasts/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_broadcast(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """Admin delete any broadcast job and cascade logs. Cancels task first if running."""
    try:
        job_uuid = UUID(job_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid job ID format")

    res = await db.execute(
        select(BroadcastJob).where(BroadcastJob.id == job_uuid)
    )
    job = res.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Broadcast job not found")

    if job.status in ("running", "paused", "pending"):
        await broadcast_service.update_job_status(db, job, "cancelled")
        await db.flush()
        # Signal the worker before the row disappears. Without this the worker
        # task keeps sending and later fails flushing its buffered cycle logs
        # into a job that no longer exists (PYTHON-FASTAPI-1M).
        from app.utils.redis_dispatcher import publish_job_control

        await publish_job_control("broadcast", job.id, "stop")

    await db.delete(job)
    await db.commit()


@router.post("/broadcasts/bulk-action")
async def admin_bulk_broadcast_action(
    payload: BroadcastBulkActionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """Admin bulk actions on broadcast jobs: pause_all_running, stop_all_running, delete_completed_failed, delete_selected."""
    action = payload.action

    if action == "pause_all_running":
        res = await db.execute(
            select(BroadcastJob).where(BroadcastJob.status == "running")
        )
        jobs = res.scalars().all()
        for j in jobs:
            await broadcast_service.update_job_status(db, j, "paused")
        await db.commit()
        return {
            "message": f"Paused {len(jobs)} running jobs",
            "count": len(jobs),
        }

    elif action == "stop_all_running":
        res = await db.execute(
            select(BroadcastJob).where(
                BroadcastJob.status.in_(["running", "paused", "pending"])
            )
        )
        jobs = res.scalars().all()
        for j in jobs:
            await broadcast_service.update_job_status(db, j, "cancelled")
        await db.commit()
        return {"message": f"Stopped {len(jobs)} active jobs", "count": len(jobs)}

    elif action == "delete_completed_failed":
        from sqlalchemy import delete

        del_res = await db.execute(
            delete(BroadcastJob).where(
                BroadcastJob.status.in_(["completed", "failed", "cancelled"])
            )
        )
        await db.commit()
        return {
            "message": f"Deleted {del_res.rowcount} finished jobs",
            "count": del_res.rowcount,
        }

    elif action == "delete_selected":
        if not payload.job_ids:
            raise HTTPException(status_code=400, detail="No job IDs specified")

        valid_uuids = []
        for jid in payload.job_ids:
            try:
                valid_uuids.append(UUID(jid))
            except ValueError:
                continue

        res = await db.execute(
            select(BroadcastJob).where(BroadcastJob.id.in_(valid_uuids))
        )
        jobs = res.scalars().all()
        for j in jobs:
            if j.status in ("running", "paused", "pending"):
                await broadcast_service.update_job_status(db, j, "cancelled")
                # Stop the worker task before the row goes away, same reason as
                # admin_delete_broadcast: an orphaned task would keep sending and
                # then fail to flush its buffered cycle logs (PYTHON-FASTAPI-1M).
                from app.utils.redis_dispatcher import publish_job_control

                await publish_job_control("broadcast", j.id, "stop")
            await db.delete(j)
        await db.commit()
        return {
            "message": f"Deleted {len(jobs)} selected jobs",
            "count": len(jobs),
        }

    else:
        raise HTTPException(
            status_code=400, detail=f"Unknown bulk action '{action}'"
        )
