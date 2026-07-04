"""Admin SMM business logic — sync services, manage orders, settings."""

import logging
from uuid import UUID

from sqlalchemy import func, select, desc, asc
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.order import Order
from app.models.smm_service import SmmService
from app.models.smm_setting import SmmSetting
from app.models.user import User
from app.services import smm_service as smm_api

logger = logging.getLogger(__name__)

# ── Setting keys ─────────────────────────────────────────────────────────────

SETTING_GLOBAL_MARKUP = "global_markup_percent"


def _parse_int(value: object, default: int | None = 0) -> int | None:
    """Parse an SMM API value to int, handling scientific notation and strings."""
    if value is None or value == "":
        return default
    try:
        return int(value)
    except (ValueError, TypeError):
        pass
    try:
        return int(float(str(value)))
    except (ValueError, TypeError):
        return default


# ── Profile ──────────────────────────────────────────────────────────────────


async def get_panel_profile() -> dict:
    """Fetch SMM panel profile (balance, name, etc.)."""
    result = await smm_api.get_profile()
    if result.get("status") and isinstance(result.get("data"), dict):
        data = result["data"]
        return {
            "balance": data.get("balance"),
            "name": data.get("name"),
            "sid": data.get("sid"),
            "currency": data.get("currency"),
        }
    logger.warning("Failed to fetch SMM profile: %s", result.get("data", {}).get("msg", "Unknown"))
    return {}


# ── Services ─────────────────────────────────────────────────────────────────


async def sync_services(db: AsyncSession) -> int:
    """Fetch all services from the SMM panel and upsert into smm_services.

    Returns:
        Number of services upserted.
    """
    services = await smm_api.get_services()
    if not services:
        return 0

    # Fetch all existing services from DB in a single query
    result = await db.execute(select(SmmService))
    existing_map = {s.id: s for s in result.scalars().all()}

    count = 0
    for svc in services:
        raw_sid = svc.get("id")
        if raw_sid is None:
            continue

        sid = int(raw_sid)

        # API returns empty strings for nullable fields; normalize to None
        note = svc.get("note") or None
        speed = svc.get("speed") or None

        original_price = _parse_int(svc.get("price"), 0)
        min_qty = _parse_int(svc.get("min"), 1)
        max_qty = _parse_int(svc.get("max"), 999999)
        name = svc.get("name", "")
        category = svc.get("category", "")

        # Check if service already exists
        existing = existing_map.get(sid)
        if existing:
            # Check if any fields changed before updating to prevent dirtying the SQLAlchemy session needlessly
            if (
                existing.service_name != name
                or existing.category != category
                or existing.original_price != original_price
                or existing.min_qty != min_qty
                or existing.max_qty != max_qty
                or existing.note != note
                or existing.speed != speed
            ):
                existing.service_name = name
                existing.category = category
                existing.original_price = original_price
                existing.min_qty = min_qty
                existing.max_qty = max_qty
                existing.note = note
                existing.speed = speed
        else:
            service = SmmService(
                id=sid,
                service_id=sid,
                service_name=name,
                category=category,
                original_price=original_price,
                min_qty=min_qty,
                max_qty=max_qty,
                note=note,
                speed=speed,
                is_active=True,
                is_visible=True,
                markup_percent=0,
            )
            db.add(service)
        count += 1

    await db.flush()
    return count



async def get_services(
    db: AsyncSession,
    search: str | None = None,
    category: str | None = None,
    is_active: bool | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[SmmService], int]:
    """List services with filters. Returns (services, total_count)."""
    query = select(SmmService)
    count_query = select(func.count(SmmService.id))

    if search:
        pattern = f"%{search}%"
        query = query.where(SmmService.service_name.ilike(pattern))
        count_query = count_query.where(SmmService.service_name.ilike(pattern))
    if category:
        query = query.where(SmmService.category.ilike(f"%{category}%"))
        count_query = count_query.where(SmmService.category.ilike(f"%{category}%"))
    if is_active is not None:
        query = query.where(SmmService.is_active == is_active)
        count_query = count_query.where(SmmService.is_active == is_active)

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    query = query.order_by(asc(SmmService.id)).offset(offset).limit(limit)
    result = await db.execute(query)
    services = list(result.scalars().all())

    return services, total


async def update_service(db: AsyncSession, service_id: int, updates: dict) -> SmmService | None:
    """Update a service's admin-configurable fields.

    Allowed fields: is_active, is_visible, selling_price, markup_percent.
    """
    service = await db.get(SmmService, service_id)
    if not service:
        return None

    allowed_keys = {"is_active", "is_visible", "selling_price", "markup_percent"}
    for key, value in updates.items():
        if key in allowed_keys:
            setattr(service, key, value)

    await db.flush()
    return service


async def bulk_update_services(db: AsyncSession, updates: dict) -> int:
    """Bulk update services matching the given criteria.

    Returns:
        Number of services updated.
    """
    query = select(SmmService)

    category = updates.get("category")
    service_ids = updates.get("service_ids")

    if category:
        query = query.where(SmmService.category.ilike(f"%{category}%"))
    if service_ids:
        query = query.where(SmmService.service_id.in_(service_ids))

    result = await db.execute(query)
    services = list(result.scalars().all())

    allowed_keys = {"is_active", "is_visible", "markup_percent"}
    for service in services:
        for key, value in updates.items():
            if key in allowed_keys and value is not None:
                setattr(service, key, value)

    await db.flush()
    return len(services)


def _calculate_effective_price(service: SmmService, global_markup: int) -> int:
    """Calculate the effective selling price for a service."""
    if service.selling_price is not None:
        return service.selling_price
    markup = service.markup_percent if service.markup_percent else global_markup
    if markup > 0:
        return max(1, (service.original_price * (100 + markup)) // 100)
    return service.original_price


# ── Orders ───────────────────────────────────────────────────────────────────


async def get_all_orders(
    db: AsyncSession,
    search: str | None = None,
    status: str | None = None,
    service_id: int | None = None,
    user_id: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[dict], int]:
    """List all orders across users with optional filters.

    Returns (list of order dicts with user_email, total_count).
    """
    query = select(Order)
    count_query = select(func.count(Order.id))

    if status:
        query = query.where(Order.status == status)
        count_query = count_query.where(Order.status == status)
    if service_id is not None:
        query = query.where(Order.service_id == service_id)
        count_query = count_query.where(Order.service_id == service_id)
    if user_id:
        query = query.where(Order.user_id == UUID(user_id))
        count_query = count_query.where(Order.user_id == UUID(user_id))

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    query = query.order_by(desc(Order.created_at)).offset(offset).limit(limit)
    result = await db.execute(query)
    orders = list(result.scalars().all())

    # Enrich with user emails
    user_ids = {o.user_id for o in orders}
    user_map = {}
    if user_ids:
        user_result = await db.execute(
            select(User.id, User.email).where(User.id.in_(list(user_ids)))
        )
        for row in user_result:
            user_map[row[0]] = row[1]

    order_list = []
    for o in orders:
        od = {
            "id": o.id,
            "user_id": o.user_id,
            "user_email": user_map.get(o.user_id, ""),
            "smm_order_id": o.smm_order_id,
            "service_id": o.service_id,
            "service_name": o.service_name,
            "category": o.category,
            "data_target": o.data_target,
            "quantity": o.quantity,
            "price": o.price,
            "total_price": o.total_price,
            "status": o.status,
            "start_count": o.start_count,
            "remains": o.remains,
            "is_mass_order": o.is_mass_order,
            "note": o.note,
            "created_at": o.created_at,
            "updated_at": o.updated_at,
        }
        order_list.append(od)

    return order_list, total


async def get_order_detail(db: AsyncSession, order_id: str) -> dict | None:
    """Get a single order with user email."""
    try:
        result = await db.execute(select(Order).where(Order.id == UUID(order_id)))
    except ValueError:
        return None
    order = result.scalar_one_or_none()
    if not order:
        return None

    # Get user email
    user_result = await db.execute(
        select(User.email).where(User.id == order.user_id)
    )
    user_email = user_result.scalar() or ""

    return {
        "id": order.id,
        "user_id": order.user_id,
        "user_email": user_email,
        "smm_order_id": order.smm_order_id,
        "service_id": order.service_id,
        "service_name": order.service_name,
        "category": order.category,
        "data_target": order.data_target,
        "quantity": order.quantity,
        "price": order.price,
        "total_price": order.total_price,
        "status": order.status,
        "start_count": order.start_count,
        "remains": order.remains,
        "is_mass_order": order.is_mass_order,
        "note": order.note,
        "created_at": order.created_at,
        "updated_at": order.updated_at,
    }


async def refresh_order_status(db: AsyncSession, order: Order) -> Order:
    """Refresh a single order's status from the SMM panel."""
    if not order.smm_order_id:
        return order

    result = await smm_api.check_order_status(order.smm_order_id)
    if result.get("status"):
        data = result.get("data", {})
        new_status = data.get("status", order.status)
        order.status = new_status
        order.start_count = _parse_int(data.get("start_count"), order.start_count)
        order.remains = _parse_int(data.get("remains"), order.remains)

    await db.flush()
    return order


async def refresh_all_pending(db: AsyncSession) -> int:
    """Refresh all pending/processing orders across all users.

    Returns:
        Number of orders refreshed.
    """
    query = select(Order).where(
        Order.status.in_(["Pending", "Processing", "Partial", "In progress"])
    )
    result = await db.execute(query)
    orders = list(result.scalars().all())

    updated = 0
    for order in orders:
        try:
            await refresh_order_status(db, order)
            updated += 1
        except Exception as e:
            logger.error("Failed to refresh order %s: %s", order.id, e)

    if updated:
        await db.flush()
    return updated


async def refresh_all_pending_smart(db: AsyncSession) -> int:
    """Refresh pending/processing orders across all users with adaptive polling intervals.

    This avoids flooding the SMM API by only checking orders based on their age:
    - Age < 15 min: Check every 2 minutes.
    - Age 15 min to 2 hours: Check every 5 minutes.
    - Age > 2 hours: Check every 15 minutes.
    """
    from datetime import datetime, timezone

    query = select(Order).where(
        Order.status.in_(["Pending", "Processing", "Partial", "In progress"])
    )
    result = await db.execute(query)
    orders = list(result.scalars().all())

    now = datetime.now(timezone.utc)
    updated = 0

    for order in orders:
        created_at = order.created_at
        if created_at.tzinfo is None:
            now_comparison = datetime.utcnow()
            updated_at = order.updated_at
        else:
            now_comparison = now
            updated_at = order.updated_at
            if updated_at.tzinfo is None:
                updated_at = updated_at.replace(tzinfo=timezone.utc)

        age_minutes = (now_comparison - created_at).total_seconds() / 60.0
        last_check_minutes = (now_comparison - updated_at).total_seconds() / 60.0

        should_check = False
        if age_minutes < 15:
            if last_check_minutes >= 2.0:
                should_check = True
        elif age_minutes < 120:
            if last_check_minutes >= 5.0:
                should_check = True
        else:
            if last_check_minutes >= 15.0:
                should_check = True

        if should_check:
            try:
                await refresh_order_status(db, order)
                updated += 1
            except Exception as e:
                logger.error("Failed to refresh order %s: %s", order.id, e)

    if updated:
        await db.flush()
    return updated


# ── Stats ────────────────────────────────────────────────────────────────────


async def get_smm_stats(db: AsyncSession) -> dict:
    """Compute aggregate SMM stats for the admin dashboard."""
    # Service counts
    total_svc_result = await db.execute(select(func.count(SmmService.id)))
    total_services = total_svc_result.scalar() or 0

    active_svc_result = await db.execute(
        select(func.count(SmmService.id)).where(SmmService.is_active.is_(True))
    )
    active_services = active_svc_result.scalar() or 0

    # Order counts
    total_orders_result = await db.execute(select(func.count(Order.id)))
    total_orders = total_orders_result.scalar() or 0

    pending_result = await db.execute(
        select(func.count(Order.id)).where(
            Order.status.in_(["Pending", "Processing", "Partial", "In progress"])
        )
    )
    pending_orders = pending_result.scalar() or 0

    # Revenue
    revenue_result = await db.execute(select(func.sum(Order.total_price)).where(Order.status == "Success"))
    total_revenue = revenue_result.scalar() or 0

    # Unique users
    users_result = await db.execute(select(func.count(func.distinct(Order.user_id))))
    total_users = users_result.scalar() or 0

    # Panel balance
    profile = await get_panel_profile()

    return {
        "total_services": total_services,
        "active_services": active_services,
        "total_orders": total_orders,
        "pending_orders": pending_orders,
        "total_revenue": total_revenue,
        "total_users_with_orders": total_users,
        "panel_balance": profile.get("balance"),
    }


# ── Settings ─────────────────────────────────────────────────────────────────


async def get_global_settings(db: AsyncSession) -> dict:
    """Get all SMM global settings."""
    result = await db.execute(select(SmmSetting))
    rows = result.scalars().all()
    settings = {row.key: row.value for row in rows}

    return {
        "global_markup_percent": int(settings.get(SETTING_GLOBAL_MARKUP, "0")),
        "account_buy_price": int(settings.get("account_buy_price", "0")),
        "account_sell_price": int(settings.get("account_sell_price", "0")),
    }


async def update_global_settings(db: AsyncSession, updates: dict) -> dict:
    """Update SMM global settings."""
    for key in ["global_markup_percent", "account_buy_price", "account_sell_price"]:
        if key in updates and updates[key] is not None:
            value = str(updates[key])
            # Use SETTING_GLOBAL_MARKUP for key if it matches
            db_key = SETTING_GLOBAL_MARKUP if key == "global_markup_percent" else key
            existing = await db.get(SmmSetting, db_key)
            if existing:
                existing.value = value
            else:
                db.add(SmmSetting(key=db_key, value=value))

    await db.flush()
    return await get_global_settings(db)
