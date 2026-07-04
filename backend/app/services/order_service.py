"""Order business logic — create orders, manage history, check status."""

import logging
from uuid import UUID

from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.order import Order
from app.models.smm_service import SmmService
from app.models.smm_setting import SmmSetting
from app.models.user import User
from app.services.smm_service import create_order, check_order_status
from app.utils.encryption import encrypt, decrypt

logger = logging.getLogger(__name__)

SETTING_GLOBAL_MARKUP = "global_markup_percent"


def _parse_int_or_none(value: object, default: int | None = None) -> int | None:
    """Parse an SMM API value to int or return default, allowing None."""
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


async def _get_effective_price(db: AsyncSession, service_id: int) -> tuple[int, str, str, int, int, str | None, str | None]:
    """Get service info with effective price from local smm_services table.

    Returns:
        (effective_price, service_name, category, min_qty, max_qty, note, speed)

    Raises:
        ValueError: If service not found or inactive.
    """
    svc = await db.get(SmmService, service_id)
    if not svc:
        # Fallback: try fetching from SMM API directly
        from app.services.smm_service import get_services
        all_services = await get_services()
        service_info = next((s for s in all_services if s["id"] == service_id), None)
        if not service_info:
            raise ValueError(f"Service with ID {service_id} not found")
        return (
            int(service_info["price"]),
            service_info["name"],
            service_info.get("category", "Telegram"),
            int(service_info.get("min", 1)),
            int(service_info.get("max", 999999)),
            service_info.get("note"),
            service_info.get("speed"),
        )

    if not svc.is_active:
        raise ValueError(f"Service '{svc.service_name}' is currently unavailable")

    # Get global markup
    global_result = await db.execute(
        select(SmmSetting.value).where(SmmSetting.key == SETTING_GLOBAL_MARKUP)
    )
    global_markup = int(global_result.scalar() or "0")

    # Calculate effective price
    if svc.selling_price is not None:
        effective_price = svc.selling_price
    else:
        markup = svc.markup_percent if svc.markup_percent else global_markup
        if markup > 0:
            effective_price = max(1, (svc.original_price * (100 + markup)) // 100)
        else:
            effective_price = svc.original_price

    return (
        effective_price,
        svc.service_name,
        svc.category,
        svc.min_qty,
        svc.max_qty,
        svc.note,
        svc.speed,
    )


async def place_order(
    db: AsyncSession,
    user: User,
    service_id: int,
    data_target: str,
    quantity: int,
    comments: str | None = None,
    usernames: str | None = None,
) -> Order:
    """Place a single order. Checks user balance first.

    Returns:
        The created Order record.

    Raises:
        ValueError: If service not found/disabled, insufficient balance, or API error.
    """
    # Get service info with effective price from local smm_services table
    price_per_unit, service_name, category, min_qty, max_qty, _, _ = await _get_effective_price(db, service_id)

    # Validate quantity
    if quantity < min_qty:
        raise ValueError(f"Minimum quantity is {min_qty}")
    if quantity > max_qty:
        raise ValueError(f"Maximum quantity is {max_qty}")

    # Calculate total price
    total_price = _calculate_price(price_per_unit, quantity)

    # Check balance
    if user.balance < total_price:
        raise ValueError(
            f"Insufficient balance. Required: {total_price}, Your balance: {user.balance}"
        )

    # Call SMM API
    result = await create_order(service_id, data_target, quantity, comments, usernames)

    if not result.get("status"):
        msg = result.get("data", {}).get("msg", "Unknown API error")
        raise ValueError(f"Order failed: {msg}")

    smm_order_id = str(result.get("data", {}).get("id", ""))

    # Create order record
    order = Order(
        user_id=user.id,
        smm_order_id=smm_order_id,
        service_id=service_id,
        service_name=service_name,
        category=category,
        data_target=data_target,
        quantity=quantity,
        price=price_per_unit,
        total_price=total_price,
        status="Pending",
        is_mass_order=False,
    )
    db.add(order)

    # Deduct balance
    user.balance -= total_price
    await db.flush()
    return order


async def place_mass_orders(
    db: AsyncSession,
    user: User,
    orders_data: list[dict],
) -> list[Order]:
    """Place multiple orders in sequence.

    Args:
        db: Database session.
        user: The authenticated user.
        orders_data: List of order dicts with keys: service_id, data_target, quantity, comments, usernames.

    Returns:
        List of created Order records.

    Raises:
        ValueError: If total cost exceeds balance.
    """
    # Calculate total cost first using local smm_services table
    total_cost = 0
    validated_orders = []
    for order_data in orders_data:
        service_id = order_data["service_id"]
        quantity = order_data.get("quantity", 1)
        price_per_unit, service_name, category, min_qty, max_qty, _, _ = await _get_effective_price(db, service_id)
        total_price = _calculate_price(price_per_unit, quantity)
        total_cost += total_price
        validated_orders.append({
            **order_data,
            "service_name": service_name,
            "category": category,
            "price_per_unit": price_per_unit,
            "total_price": total_price,
        })

    if user.balance < total_cost:
        raise ValueError(
            f"Insufficient balance. Required: {total_cost}, Your balance: {user.balance}"
        )

    created_orders = []
    for vd in validated_orders:
        try:
            result = await create_order(
                vd["service_id"],
                vd["data_target"],
                vd.get("quantity", 1),
                vd.get("comments"),
                vd.get("usernames"),
            )
            smm_order_id = str(result.get("data", {}).get("id", "")) if result.get("status") else ""
            if not result.get("status"):
                logger.warning("Order failed for service %d: %s", vd["service_id"],
                               result.get("data", {}).get("msg", "Unknown"))

            order = Order(
                user_id=user.id,
                smm_order_id=smm_order_id,
                service_id=vd["service_id"],
                service_name=vd["service_name"],
                category=vd["category"],
                data_target=vd["data_target"],
                quantity=vd.get("quantity", 1),
                price=vd["price_per_unit"],
                total_price=vd["total_price"],
                status=smm_order_id and "Pending" or "Failed",
                is_mass_order=True,
                mass_parent_id=None,
            )
            db.add(order)
            created_orders.append(order)
        except Exception as e:
            logger.error("Mass order item failed: %s", e)
            # Still add a failed record
            order = Order(
                user_id=user.id,
                smm_order_id=None,
                service_id=vd["service_id"],
                service_name=vd["service_name"],
                category=vd["category"],
                data_target=vd["data_target"],
                quantity=vd.get("quantity", 1),
                price=vd["price_per_unit"],
                total_price=vd["total_price"],
                status="Failed",
                is_mass_order=True,
                note=str(e),
            )
            db.add(order)
            created_orders.append(order)

    # Deduct total balance
    user.balance -= total_cost
    await db.flush()
    return created_orders


async def get_order_history(
    db: AsyncSession,
    user_id: str,
    limit: int = 50,
    offset: int = 0,
    category: str | None = None,
) -> list[Order]:
    """Get order history for a user."""
    query = select(Order).where(Order.user_id == UUID(user_id))

    if category:
        query = query.where(Order.category == category)

    query = query.order_by(desc(Order.created_at)).offset(offset).limit(limit)
    result = await db.execute(query)
    return list(result.scalars().all())


async def get_order_by_id(db: AsyncSession, order_id: str, user_id: str) -> Order | None:
    """Get a single order by ID, scoped to user."""
    result = await db.execute(
        select(Order).where(
            Order.id == UUID(order_id),
            Order.user_id == UUID(user_id),
        )
    )
    return result.scalar_one_or_none()


async def refresh_order_status(db: AsyncSession, order: Order) -> Order:
    """Check the SMM panel for the latest order status and update the DB record."""
    if not order.smm_order_id:
        return order

    result = await check_order_status(order.smm_order_id)
    if result.get("status"):
        data = result.get("data", {})
        new_status = data.get("status", order.status)
        order.status = new_status
        order.start_count = _parse_int_or_none(data.get("start_count"), order.start_count)
        order.remains = _parse_int_or_none(data.get("remains"), order.remains)

    await db.flush()
    return order


async def refresh_all_pending_orders(db: AsyncSession, user_id: str) -> int:
    """Refresh all non-terminal orders for a user.

    Returns:
        Number of orders updated.
    """
    query = select(Order).where(
        Order.user_id == UUID(user_id),
        Order.status.in_(["Pending", "Processing", "Partial", "In progress"]),
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


def _calculate_price(price_per_unit: int, quantity: int) -> int:
    """Calculate total price from per-unit price and quantity.

    The SMM panel prices are typically per 1000 units.
    """
    # If price is for 1k units
    if price_per_unit > 0:
        return max(1, (price_per_unit * quantity) // 1000)
    return 0
