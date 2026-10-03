"""Order endpoints — services list, place orders, history, status."""

import logging

from uuid import UUID
from fastapi import APIRouter, Depends, Header, HTTPException, Query, status, Request
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
# Imported rather than redeclared: the allowlist lives in app/smm_service_ids.py
# so this layer and app/services/order_service.py can never disagree about which
# services are sellable.
from app.smm_service_ids import ALLOWED_SMM_SERVICE_IDS  # noqa: F401
from app.services import order_service, smm_service
from app.utils.rate_limiter import rate_limiter
from app.utils.sanitize import sanitize_exception

import logging
from datetime import datetime, timezone, timedelta
from sqlalchemy import select, func
from app.services import admin_smm_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["orders"])


@router.get("/orders/services")
async def list_telegram_services(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List only allowed Telegram and Telegram Reactions services from local cache (auto-synced)."""
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

    return {"services": formatted}


@router.get("/orders/services/all")
async def list_all_services(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List all allowed SMM panel services from local cache (auto-synced)."""
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

    return {"services": formatted}




@router.post("/orders", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
async def place_single_order(
    request: Request,
    payload: OrderCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    x_idempotency_key: str | None = Header(None, alias="X-Idempotency-Key"),
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

    # Enforce allowed Telegram service IDs
    if payload.service_id not in ALLOWED_SMM_SERVICE_IDS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Service ID {payload.service_id} is not supported or unavailable.",
        )

    # Idempotency check
    from app.utils.redis import redis_client
    cache_key = None
    if x_idempotency_key and x_idempotency_key.strip():
        cache_key = f"idempotency:order:{user.id}:{x_idempotency_key.strip()}"
        cached_order_id = await redis_client.get(cache_key)
        if cached_order_id:
            existing_order = await order_service.get_order_by_id(db, cached_order_id, str(user.id))
            if existing_order:
                return existing_order

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
        if cache_key:
            await redis_client.setex(cache_key, 120, str(order.id))
        return order
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))


@router.post("/orders/mass", response_model=list[OrderResponse], status_code=status.HTTP_201_CREATED)
async def place_mass_order(
    request: Request,
    payload: MassOrderCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    x_idempotency_key: str | None = Header(None, alias="X-Idempotency-Key"),
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

    # Enforce allowed Telegram service IDs for all items in mass order
    for item in payload.orders:
        if item.service_id not in ALLOWED_SMM_SERVICE_IDS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Service ID {item.service_id} is not supported or unavailable.",
            )

    # Idempotency check for mass orders
    import json
    from app.utils.redis import redis_client
    cache_key = None
    if x_idempotency_key and x_idempotency_key.strip():
        cache_key = f"idempotency:order_mass:{user.id}:{x_idempotency_key.strip()}"
        cached_data = await redis_client.get(cache_key)
        if cached_data:
            try:
                order_ids = json.loads(cached_data)
                existing_orders = []
                for oid in order_ids:
                    ord_rec = await order_service.get_order_by_id(db, oid, str(user.id))
                    if ord_rec:
                        existing_orders.append(ord_rec)
                if existing_orders:
                    return existing_orders
            except Exception as cache_exc:
                # Idempotency is best-effort. Falling through would let a retry
                # create duplicate orders, so make the miss visible in logs.
                logger.warning(
                    "Idempotency cache lookup failed (key=%s); proceeding "
                    "without deduplication: %s",
                    cache_key,
                    cache_exc,
                )

    orders_data = [o.model_dump() for o in payload.orders]
    try:
        orders = await order_service.place_mass_orders(db, user, orders_data)
        await db.commit()
        if cache_key:
            await redis_client.setex(cache_key, 120, json.dumps([str(o.id) for o in orders]))
        return orders
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))


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
    try:
        UUID(order_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=404, detail="Order not found")

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
    try:
        UUID(order_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=404, detail="Order not found")

    order = await order_service.get_order_by_id(db, order_id, str(user.id))
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    try:
        updated = await order_service.refresh_order_status(db, order)
        await db.commit()
        return updated
    except Exception as exc:
        raise HTTPException(status_code=500, detail=sanitize_exception(exc))


@router.post("/orders/refresh-all")
async def refresh_all_orders(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Refresh status of all pending/processing orders."""
    count = await order_service.refresh_all_pending_orders(db, str(user.id))
    await db.commit()
    return {"refreshed": count}
