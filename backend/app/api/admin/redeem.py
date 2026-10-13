"""Admin redeem code creation, listing, deactivation, and log review endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_role
from app.models.user import User
from app.schemas.redeem import (
    RedeemCodeCreate as RedeemCodeCreateSchema,
    RedeemCodeListResponse,
    RedeemCodeResponse,
    RedeemLogListResponse,
    RedeemLogResponse,
)
from app.utils.sanitize import sanitize_exception

router = APIRouter()


@router.get("/redeem-codes", response_model=RedeemCodeListResponse)
async def list_redeem_codes(
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """List all redeem codes with search and pagination. Owner only."""
    from app.services.redeem_service import list_redeem_codes as svc_list_codes

    codes, total = await svc_list_codes(db, search, page, limit)

    # Attach creator email
    response_codes = []
    for c in codes:
        rc = RedeemCodeResponse.model_validate(c)
        if c.creator:
            rc.created_by_email = c.creator.email
        response_codes.append(rc)

    return RedeemCodeListResponse(codes=response_codes, total=total)


@router.post("/redeem-codes", response_model=RedeemCodeResponse)
async def create_redeem_code(
    payload: RedeemCodeCreateSchema,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """Create a new redeem code. Owner only."""
    from app.services.redeem_service import create_redeem_code as svc_create

    try:
        code = await svc_create(db, current_user, payload)
        try:
            from app.services.security_audit_service import (
                record_security_audit_event,
            )

            await record_security_audit_event(
                db=db,
                action="admin.redeem_code_created",
                actor=current_user,
                target_type="redeem_code",
                target_id=str(code.id) if hasattr(code, "id") else None,
                target_label=code.code if hasattr(code, "code") else None,
                outcome="success",
                severity="info",
                metadata={"plan_id": getattr(code, "plan_id", None)},
            )
        except Exception:
            pass
        resp = RedeemCodeResponse.model_validate(code)
        resp.created_by_email = current_user.email
        return resp
    except ValueError as e:
        raise HTTPException(status_code=400, detail=sanitize_exception(e))


@router.delete("/redeem-codes/{code_id}")
async def delete_redeem_code(
    code_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """Soft-delete (deactivate) a redeem code. Owner only."""
    from app.services.redeem_service import delete_redeem_code as svc_delete

    try:
        await svc_delete(db, code_id)
        return {"detail": "Code deactivated"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=sanitize_exception(e))


@router.get("/redeem-logs", response_model=RedeemLogListResponse)
async def list_redeem_logs(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """List all redeem logs with pagination. Owner only."""
    from app.services.redeem_service import list_redeem_logs as svc_list_logs

    logs, total = await svc_list_logs(db, page, limit)

    response_logs = []
    for log_entry in logs:
        rl = RedeemLogResponse.model_validate(log_entry)
        if log_entry.redeem_code:
            rl.code = log_entry.redeem_code.code
        if log_entry.user:
            rl.user_email = log_entry.user.email
        response_logs.append(rl)

    return RedeemLogListResponse(logs=response_logs, total=total)
