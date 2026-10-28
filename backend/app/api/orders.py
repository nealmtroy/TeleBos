import json
import logging
from uuid import UUID
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status, Request
from sqlalchemy import select, func
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
    ActivityHistoryResponse,
)
from app.smm_service_ids import ALLOWED_SMM_SERVICE_IDS  # noqa: F401
from app.services import order_service, smm_service, admin_smm_service, activity_history_service
from app.utils.rate_limiter import rate_limiter
from app.utils.redis import redis_client
from app.utils.sanitize import sanitize_exception

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

    # SEC-09 Idempotency check with fail-closed semantics and concurrent in-flight lock
    cache_key = None
    lock_acquired = False
    if isinstance(x_idempotency_key, str) and x_idempotency_key.strip():
        clean_key = x_idempotency_key.strip()
        cache_key = f"idempotency:order:{user.id}:{clean_key}"
        try:
            # 1. Atomic SET NX with 60s TTL acting as in-flight processing mutex
            lock_acquired = await redis_client.set(cache_key, "PROCESSING", ex=60, nx=True)
            if not lock_acquired:
                # Key already exists: check if currently in-flight or completed
                cached_order_id = await redis_client.get(cache_key)
                if cached_order_id == "PROCESSING":
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="Permintaan pesanan dengan idempotency key ini sedang diproses. Mohon tunggu.",
                    )
                elif cached_order_id:
                    existing_order = await order_service.get_order_by_id(db, cached_order_id, str(user.id))
                    if existing_order:
                        return existing_order
                    logger.warning("Cached order ID %s not found in DB for user %s", cached_order_id, user.id)
        except HTTPException:
            raise
        except Exception as redis_exc:
            logger.error("Redis idempotency failure on single order (key=%s): %s", cache_key, redis_exc)
            # SEC-09: Fail-closed to prevent double deduction when client requested deduplication
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Layanan verifikasi idempotency sedang tidak tersedia. Silakan coba beberapa saat lagi.",
                headers={"Retry-After": "5"},
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
            payment_method=payload.payment_method,
        )
        await db.commit()
        if cache_key and lock_acquired:
            try:
                # Store successful order ID with 24 hours TTL
                await redis_client.setex(cache_key, 86400, str(order.id))
            except Exception as store_exc:
                logger.warning("Failed to store idempotency result in Redis: %s", store_exc)
        return order
    except HTTPException:
        raise
    except ValueError as exc:
        if cache_key and lock_acquired:
            try:
                await redis_client.delete(cache_key)
            except Exception:
                pass
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))
    except RuntimeError as exc:
        if cache_key and lock_acquired:
            try:
                await redis_client.delete(cache_key)
            except Exception:
                pass
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=sanitize_exception(exc),
        )
    except Exception:
        if cache_key and lock_acquired:
            try:
                await redis_client.delete(cache_key)
            except Exception:
                pass
        raise


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

    # SEC-09 Idempotency check with fail-closed semantics and concurrent in-flight lock
    cache_key = None
    lock_acquired = False
    if isinstance(x_idempotency_key, str) and x_idempotency_key.strip():
        clean_key = x_idempotency_key.strip()
        cache_key = f"idempotency:order_mass:{user.id}:{clean_key}"
        try:
            # 1. Atomic SET NX with 60s TTL acting as in-flight processing mutex
            lock_acquired = await redis_client.set(cache_key, "PROCESSING", ex=60, nx=True)
            if not lock_acquired:
                cached_data = await redis_client.get(cache_key)
                if cached_data == "PROCESSING":
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="Permintaan mass order dengan idempotency key ini sedang diproses. Mohon tunggu.",
                    )
                elif cached_data:
                    try:
                        order_ids = json.loads(cached_data)
                        existing_orders = []
                        for oid in order_ids:
                            ord_rec = await order_service.get_order_by_id(db, oid, str(user.id))
                            if ord_rec:
                                existing_orders.append(ord_rec)
                        if existing_orders:
                            return existing_orders
                    except Exception as parse_exc:
                        logger.error("Failed to parse cached mass orders: %s", parse_exc)
                        raise HTTPException(
                            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                            detail="Gagal membaca riwayat idempotency pesanan massal.",
                        )
        except HTTPException:
            raise
        except Exception as redis_exc:
            logger.error("Redis idempotency failure on mass order (key=%s): %s", cache_key, redis_exc)
            # SEC-09: Fail-closed to prevent double deduction when client requested deduplication
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Layanan verifikasi idempotency sedang tidak tersedia. Silakan coba beberapa saat lagi.",
                headers={"Retry-After": "5"},
            )

    orders_data = [o.model_dump() for o in payload.orders]
    try:
        orders = await order_service.place_mass_orders(
            db, user, orders_data, payment_method=payload.payment_method
        )
        await db.commit()
        if cache_key and lock_acquired:
            try:
                # Store successful mass order IDs with 24 hours TTL
                await redis_client.setex(cache_key, 86400, json.dumps([str(o.id) for o in orders]))
            except Exception as store_exc:
                logger.warning("Failed to store mass order idempotency result: %s", store_exc)
        return orders
    except HTTPException:
        raise
    except ValueError as exc:
        if cache_key and lock_acquired:
            try:
                await redis_client.delete(cache_key)
            except Exception:
                pass
        raise HTTPException(status_code=400, detail=sanitize_exception(exc))
    except RuntimeError as exc:
        if cache_key and lock_acquired:
            try:
                await redis_client.delete(cache_key)
            except Exception:
                pass
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=sanitize_exception(exc),
        )
    except Exception:
        if cache_key and lock_acquired:
            try:
                await redis_client.delete(cache_key)
            except Exception:
                pass
        raise


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


@router.get("/orders/activity-history", response_model=ActivityHistoryResponse)
@router.get("/user/activity-history", response_model=ActivityHistoryResponse)
async def get_activity_history(
    tab: str = Query("all", pattern="^(all|smm|accounts|deposits|withdrawals|balance)$"),
    search: str | None = Query(None),
    status: str = Query("all"),
    start_date: datetime | None = Query(None),
    end_date: datetime | None = Query(None),
    sort_by: str = Query("date", pattern="^(date|price|status)$"),
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    locale: str = Query("id", pattern="^(id|en)$"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Retrieve unified activity history across SMM, accounts, and wallet with server-side pagination and metrics."""
    return await activity_history_service.get_user_activity_history(
        db,
        user,
        tab=tab,
        search=search,
        status=status,
        start_date=start_date,
        end_date=end_date,
        sort_by=sort_by,
        sort_order=sort_order,
        page=page,
        page_size=page_size,
        locale=locale,
    )


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
