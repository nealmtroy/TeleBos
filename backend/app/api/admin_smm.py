"""Admin SMM endpoints — manage services, view all orders, settings, stats."""

import csv
import io
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import StreamingResponse

from app.database import get_db
from app.dependencies import get_current_user, require_role
from app.models.order import Order
from app.models.user import User
from app.schemas.admin_smm import (
    AdminOrderListResponse,
    AdminOrderResponse,
    BulkServiceUpdate,
    SmmProfileResponse,
    SmmServiceListResponse,
    SmmServiceResponse,
    SmmServiceUpdate,
    SmmSettingsResponse,
    SmmSettingsUpdate,
    SmmStatsResponse,
)
from app.services import admin_smm_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin/smm", tags=["admin-smm"])


# ── Profile ──────────────────────────────────────────────────────────────────


@router.get("/profile", response_model=SmmProfileResponse)
async def get_smm_profile(
    current_user: User = Depends(require_role(["owner"])),
):
    """Get SMM panel profile and balance. Owner only."""
    profile = await admin_smm_service.get_panel_profile()
    return SmmProfileResponse(**profile)


# ── Services ─────────────────────────────────────────────────────────────────


@router.post("/services/sync")
async def sync_services(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """Sync services from SMM panel into smm_services table. Owner only."""
    count = await admin_smm_service.sync_services(db)
    await db.commit()
    return {"synced": count}


@router.get("/services", response_model=SmmServiceListResponse)
async def list_services(
    search: str | None = Query(None),
    category: str | None = Query(None),
    is_active: bool | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """List all SMM services with filters. Owner only."""
    services, total = await admin_smm_service.get_services(
        db, search=search, category=category, is_active=is_active,
        limit=limit, offset=offset,
    )

    settings = await admin_smm_service.get_global_settings(db)
    global_markup = settings.get("global_markup_percent", 0)

    response_services = []
    for svc in services:
        effective_price = admin_smm_service._calculate_effective_price(svc, global_markup)
        sr = SmmServiceResponse(
            id=svc.id,
            service_id=svc.service_id,
            service_name=svc.service_name,
            category=svc.category,
            original_price=svc.original_price,
            selling_price=svc.selling_price,
            effective_price=effective_price,
            min_qty=svc.min_qty,
            max_qty=svc.max_qty,
            note=svc.note,
            speed=svc.speed,
            is_active=svc.is_active,
            is_visible=svc.is_visible,
            markup_percent=svc.markup_percent,
            created_at=svc.created_at,
            updated_at=svc.updated_at,
        )
        response_services.append(sr)

    return SmmServiceListResponse(services=response_services, total=total)


@router.put("/services/{service_id}", response_model=SmmServiceResponse)
async def update_service(
    service_id: int,
    payload: SmmServiceUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """Update a single service's admin config. Owner only."""
    updates = payload.model_dump(exclude_unset=True)
    service = await admin_smm_service.update_service(db, service_id, updates)
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")

    await db.commit()

    settings = await admin_smm_service.get_global_settings(db)
    global_markup = settings.get("global_markup_percent", 0)
    effective_price = admin_smm_service._calculate_effective_price(service, global_markup)

    return SmmServiceResponse(
        id=service.id,
        service_id=service.service_id,
        service_name=service.service_name,
        category=service.category,
        original_price=service.original_price,
        selling_price=service.selling_price,
        effective_price=effective_price,
        min_qty=service.min_qty,
        max_qty=service.max_qty,
        note=service.note,
        speed=service.speed,
        is_active=service.is_active,
        is_visible=service.is_visible,
        markup_percent=service.markup_percent,
        created_at=service.created_at,
        updated_at=service.updated_at,
    )


@router.put("/services/bulk/update")
async def bulk_update_services(
    payload: BulkServiceUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """Bulk update services (e.g., set markup for a category). Owner only."""
    updates = payload.model_dump(exclude_unset=True)
    count = await admin_smm_service.bulk_update_services(db, updates)
    await db.commit()
    return {"updated": count}


# ── Orders ───────────────────────────────────────────────────────────────────


@router.get("/orders", response_model=AdminOrderListResponse)
async def list_all_orders(
    search: str | None = Query(None, description="Search by target or user email"),
    status: str | None = Query(None, description="Filter by status"),
    service_id: int | None = Query(None, description="Filter by service ID"),
    user_id: str | None = Query(None, description="Filter by user UUID"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """List all orders across all users. Owner only."""
    orders, total = await admin_smm_service.get_all_orders(
        db, search=search, status=status, service_id=service_id,
        user_id=user_id, limit=limit, offset=offset,
    )

    response_orders = [AdminOrderResponse(**o) for o in orders]
    return AdminOrderListResponse(orders=response_orders, total=total)


@router.get("/orders/{order_id}", response_model=AdminOrderResponse)
async def get_order_detail(
    order_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """Get a single order detail with user info. Owner only."""
    order = await admin_smm_service.get_order_detail(db, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return AdminOrderResponse(**order)


@router.post("/orders/{order_id}/refresh", response_model=AdminOrderResponse)
async def refresh_order(
    order_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """Refresh a single order's status from the SMM panel. Owner only."""
    try:
        result = await db.execute(
            select(Order).where(Order.id == UUID(order_id))
        )
    except ValueError:
        raise HTTPException(status_code=404, detail="Invalid order ID")
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    await admin_smm_service.refresh_order_status(db, order)
    await db.commit()

    detail = await admin_smm_service.get_order_detail(db, order_id)
    return AdminOrderResponse(**detail)


@router.post("/orders/refresh-all")
async def refresh_all_orders(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """Refresh all pending/processing orders across all users. Owner only."""
    count = await admin_smm_service.refresh_all_pending(db)
    await db.commit()
    return {"refreshed": count}


@router.get("/orders/export")
async def export_orders_csv(
    status: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """Export all orders as CSV. Owner only."""
    orders, _ = await admin_smm_service.get_all_orders(
        db, status=status, limit=10000, offset=0,
    )

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Order ID", "User Email", "SMM Order ID", "Service", "Category",
        "Target", "Quantity", "Price", "Total Price", "Status",
        "Start Count", "Remains", "Created At",
    ])

    # Prefix formula characters to prevent CSV injection
    def _safe_csv(val: str) -> str:
        if val and val[0] in ("=", "+", "-", "@", "\t", "\r"):
            return "'" + val
        return val

    for o in orders:
        writer.writerow([
            str(o["id"]), _safe_csv(o["user_email"]), o["smm_order_id"],
            _safe_csv(o["service_name"]), _safe_csv(o["category"]),
            _safe_csv(o["data_target"]), o["quantity"], o["price"],
            o["total_price"], o["status"], o["start_count"], o["remains"],
            o["created_at"].isoformat() if o.get("created_at") else "",
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=smm_orders.csv"},
    )


# ── Stats ────────────────────────────────────────────────────────────────────


@router.get("/stats", response_model=SmmStatsResponse)
async def get_smm_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """Get SMM aggregate stats for the admin dashboard. Owner only."""
    stats = await admin_smm_service.get_smm_stats(db)
    return SmmStatsResponse(**stats)


# ── Settings ─────────────────────────────────────────────────────────────────


@router.get("/settings", response_model=SmmSettingsResponse)
async def get_smm_settings(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """Get global SMM settings. Owner only."""
    settings = await admin_smm_service.get_global_settings(db)
    return SmmSettingsResponse(**settings)


@router.put("/settings", response_model=SmmSettingsResponse)
async def update_smm_settings(
    payload: SmmSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """Update global SMM settings. Owner only."""
    updates = payload.model_dump(exclude_unset=True)
    settings = await admin_smm_service.update_global_settings(db, updates)
    await db.commit()
    return SmmSettingsResponse(**settings)
