"""Order endpoints — services list, place orders, history, status."""

from fastapi import APIRouter, Depends, HTTPException, Query, status, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.smm_service import SmmService
from app.models.smm_setting import SmmSetting
from app.models.user import User
from app.schemas.order import (
    OrderCreate,
    OrderResponse,
    OrderStatusResponse,
    MassOrderCreate,
    MassOrderItem as MassOrderItemSchema,
)
from app.services import order_service, smm_service
from app.utils.rate_limiter import rate_limiter

import logging
from datetime import datetime, timezone, timedelta
from sqlalchemy import select, func
from app.services import admin_smm_service

logger = logging.getLogger(__name__)

ALLOWED_SMM_SERVICE_IDS = {
    # Telegram Members/Subscribers
    34794, 55678, 34795, 34519, 65572, 65497, 50131, 67394, 57127, 34134,
    67393, 33857, 34048, 34291, 34329, 34213, 34214, 34327, 34328, 55679,
    34049, 34050, 55680, 33689, 34216, 67392, 36222, 67391, 24568, 24569,
    24570,
    # Telegram Auto Reactions
    48899, 48900, 48901, 48903, 48907,
    # Telegram Reactions
    36431, 36432, 36433, 36439, 36441, 36442, 36445, 36447, 36453, 36459,
    47285, 47287, 47288, 47291, 47292, 47295, 47300, 47302, 47319, 47320,
    47327, 47328, 47329, 47331, 32321, 35034,
    # Telegram Post Views
    7836, 7837, 7838, 7839, 7840, 7841, 7842
}

async def ensure_services_synced(db: AsyncSession):
    """Ensure SMM services are synced from API to DB if cache is empty or older than 12 hours."""
    try:
        result = await db.execute(select(func.max(SmmService.updated_at)))
        last_sync = result.scalar()

        should_sync = False
        if last_sync is None:
            should_sync = True
        else:
            if last_sync.tzinfo is not None:
                last_sync = last_sync.astimezone(timezone.utc).replace(tzinfo=None)
            now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
            should_sync = (now_utc - last_sync) > timedelta(hours=12)

        if should_sync:
            logger.info("SMM services local cache is empty or older than 12 hours. Auto-syncing from panel API...")
            await admin_smm_service.sync_services(db)
            await db.flush()
    except Exception as e:
        logger.error("Failed to auto-sync SMM services: %s", e)

router = APIRouter(tags=["orders"])


@router.get("/orders/services")
async def list_telegram_services(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List only allowed Telegram and Telegram Reactions services from local cache (auto-synced)."""
    await ensure_services_synced(db)

    # Get active + visible + allowed services from local table
    result = await db.execute(
        select(SmmService).where(
            SmmService.is_active.is_(True),
            SmmService.is_visible.is_(True),
            SmmService.id.in_(list(ALLOWED_SMM_SERVICE_IDS)),
        ).order_by(SmmService.id)
    )
    services = list(result.scalars().all())

    # Get global markup
    global_result = await db.execute(
        select(SmmSetting.value).where(SmmSetting.key == "global_markup_percent")
    )
    global_markup = int(global_result.scalar() or "0")

    formatted = []
    for svc in services:
        # Calculate effective selling price
        if svc.selling_price is not None:
            effective_price = svc.selling_price
        else:
            markup = svc.markup_percent if svc.markup_percent else global_markup
            if markup > 0:
                effective_price = max(1, (svc.original_price * (100 + markup)) // 100)
            else:
                effective_price = svc.original_price

        formatted.append({
            "id": svc.service_id,
            "name": svc.service_name,
            "category": svc.category,
            "price": effective_price,
            "min": svc.min_qty,
            "max": svc.max_qty,
            "note": svc.note,
            "speed": svc.speed,
        })

    # Fallback to SMM API if no local data
    if not formatted:
        services_api = await smm_service.get_telegram_services()
        # Filter fallback services
        formatted = [
            s for s in services_api
            if int(s.get("id", 0)) in ALLOWED_SMM_SERVICE_IDS
        ]
        return {"services": formatted}

    return {"services": formatted}


@router.get("/orders/services/all")
async def list_all_services(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List all allowed SMM panel services from local cache (auto-synced)."""
    await ensure_services_synced(db)

    result = await db.execute(
        select(SmmService).where(
            SmmService.is_active.is_(True),
            SmmService.is_visible.is_(True),
            SmmService.id.in_(list(ALLOWED_SMM_SERVICE_IDS)),
        ).order_by(SmmService.id)
    )
    services = list(result.scalars().all())

    global_result = await db.execute(
        select(SmmSetting.value).where(SmmSetting.key == "global_markup_percent")
    )
    global_markup = int(global_result.scalar() or "0")

    formatted = []
    for svc in services:
        if svc.selling_price is not None:
            effective_price = svc.selling_price
        else:
            markup = svc.markup_percent if svc.markup_percent else global_markup
            if markup > 0:
                effective_price = max(1, (svc.original_price * (100 + markup)) // 100)
            else:
                effective_price = svc.original_price

        formatted.append({
            "id": svc.service_id,
            "name": svc.service_name,
            "category": svc.category,
            "price": effective_price,
            "min": svc.min_qty,
            "max": svc.max_qty,
            "note": svc.note,
            "speed": svc.speed,
        })

    if not formatted:
        services_api = await smm_service.get_services()
        # Filter fallback services
        formatted = [
            s for s in services_api
            if int(s.get("id", 0)) in ALLOWED_SMM_SERVICE_IDS
        ]
        return {"services": formatted}

    return {"services": formatted}



@router.post("/orders", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
async def place_single_order(
    request: Request,
    payload: OrderCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Place a single order."""
    ip = request.client.host
    if not await rate_limiter.check(f"order:ip:{ip}"):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many order requests. Please try again later.",
        )
    if not await rate_limiter.check(f"order:user:{user.id}"):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many order requests for this user. Please wait.",
        )
    try:
        order = await order_service.place_order(
            db,
            user,
            payload.service_id,
            payload.data_target,
            payload.quantity,
            payload.comments,
            payload.usernames,
        )
        await db.commit()
        return order
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/orders/mass", response_model=list[OrderResponse], status_code=status.HTTP_201_CREATED)
async def place_mass_order(
    request: Request,
    payload: MassOrderCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Place multiple orders at once (mass order)."""
    ip = request.client.host
    if not await rate_limiter.check(f"order_mass:ip:{ip}"):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many mass order requests. Please try again later.",
        )
    if not await rate_limiter.check(f"order_mass:user:{user.id}"):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many order requests for this user. Please wait.",
        )
    orders_data = [o.model_dump() for o in payload.orders]
    try:
        orders = await order_service.place_mass_orders(db, user, orders_data)
        await db.commit()
        return orders
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/orders", response_model=list[OrderResponse])
async def get_order_history(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    category: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """View order history for the current user."""
    orders = await order_service.get_order_history(
        db, str(user.id), limit=limit, offset=offset, category=category
    )
    return orders


@router.get("/orders/{order_id}", response_model=OrderResponse)
async def get_order_detail(
    order_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get a single order detail."""
    order = await order_service.get_order_by_id(db, order_id, str(user.id))
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


@router.post("/orders/{order_id}/refresh", response_model=OrderResponse)
async def refresh_order_status(
    order_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Refresh order status from SMM panel."""
    order = await order_service.get_order_by_id(db, order_id, str(user.id))
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    try:
        updated = await order_service.refresh_order_status(db, order)
        await db.commit()
        return updated
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/orders/refresh-all")
async def refresh_all_orders(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Refresh status of all pending/processing orders."""
    count = await order_service.refresh_all_pending_orders(db, str(user.id))
    await db.commit()
    return {"refreshed": count}
