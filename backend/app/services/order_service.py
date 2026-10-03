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
from app.services.notification_service import create_notification
from app.utils.encryption import encrypt, decrypt

logger = logging.getLogger(__name__)

SETTING_GLOBAL_MARKUP = "global_markup_percent"

ALLOWED_SMM_SERVICE_IDS: set[int] = {
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
    7836, 7837, 7838, 7839, 7840, 7841, 7842,
}


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


def _notification_kind_for_status(status: str) -> str:
    normalized = status.lower()
    if normalized in {"failed", "error", "partial", "canceled", "cancelled"}:
        return "error"
    if normalized in {"success", "completed"}:
        return "success"
    if normalized in {"processing", "in progress"}:
        return "info"
    return "warning"


async def _get_effective_price(db: AsyncSession, service_id: int) -> tuple[int, str, str, int, int, str | None, str | None]:
    """Get service info with effective price from local smm_services table.

    Returns:
        (effective_price, service_name, category, min_qty, max_qty, note, speed)

    Raises:
        ValueError: If service not found or inactive.
    """
    if service_id not in ALLOWED_SMM_SERVICE_IDS:
        raise ValueError(f"Service with ID {service_id} is not supported")

    svc = await db.get(SmmService, service_id)
    if not svc:
        raise ValueError(f"Service with ID {service_id} not found in catalog")

    if not svc.is_active or not svc.is_visible:
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

    if effective_price <= 0:
        raise ValueError(f"Service '{svc.service_name}' has invalid price configuration")

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
    # Validate service ID is allowed
    if service_id not in ALLOWED_SMM_SERVICE_IDS:
        raise ValueError(f"Service ID {service_id} is not available")

    # Get service info with effective price from local smm_services table
    price_per_unit, service_name, category, min_qty, max_qty, _, _ = await _get_effective_price(db, service_id)

    # Validate quantity
    if quantity <= 0:
        raise ValueError("Quantity must be greater than 0")
    if quantity < min_qty:
        raise ValueError(f"Minimum quantity is {min_qty}")
    if quantity > max_qty:
        raise ValueError(f"Maximum quantity is {max_qty}")
    # Calculate total price
    total_price = _calculate_price(price_per_unit, quantity)

    # 1. Atomically reserve funds under row-level lock to prevent TOCTOU race conditions
    locked_user_result = await db.execute(
        select(User).where(User.id == user.id).with_for_update()
    )
    locked_user = locked_user_result.scalar_one()

    if locked_user.balance < total_price:
        raise ValueError(
            f"Insufficient balance. Required: {total_price}, Your balance: {locked_user.balance}"
        )

    # Deduct balance and commit immediately to release the row write lock before network I/O
    locked_user.balance -= total_price
    await db.commit()

    # 2. Call SMM API outside of the database row lock
    try:
        result = await create_order(service_id, data_target, quantity, comments, usernames)
    except Exception as exc:
        # Refund on network / unexpected exception
        refund_res = await db.execute(
            select(User).where(User.id == user.id).with_for_update()
        )
        refund_user = refund_res.scalar_one()
        refund_user.balance += total_price
        await db.commit()
        raise ValueError(f"Order failed due to network error: {exc}")

    if not result.get("status"):
        # Refund on API failure
        refund_res = await db.execute(
            select(User).where(User.id == user.id).with_for_update()
        )
        refund_user = refund_res.scalar_one()
        refund_user.balance += total_price
        await db.commit()
        msg = result.get("data", {}).get("msg", "Unknown API error")
        raise ValueError(f"Order failed: {msg}")

    smm_order_id = str(result.get("data", {}).get("id", ""))

    # 3. Create order record & notification
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
    await db.flush()
    create_notification(
        db,
        user.id,
        "order.created",
        kind="success",
        data={"order_id": str(order.id), "service": order.service_name},
        href="/orders",
    )
    await db.commit()
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
    # Calculate total cost first by resolving effective prices for each unique service ID (N1Q-03)
    service_ids = {order_data["service_id"] for order_data in orders_data}
    effective_prices = {}
    for sid in service_ids:
        effective_prices[sid] = await _get_effective_price(db, sid)

    total_cost = 0
    validated_orders = []
    for order_data in orders_data:
        service_id = order_data["service_id"]
        quantity = order_data.get("quantity", 1)
        price_per_unit, service_name, category, min_qty, max_qty, _, _ = effective_prices[service_id]
        if quantity <= 0:
            raise ValueError(f"Quantity must be greater than 0 for service '{service_name}'")
        if quantity < min_qty:
            raise ValueError(
                f"Quantity {quantity} is below minimum ({min_qty}) for service '{service_name}'"
            )
        if quantity > max_qty:
            raise ValueError(
                f"Quantity {quantity} exceeds maximum ({max_qty}) for service '{service_name}'"
            )
        total_price = _calculate_price(price_per_unit, quantity)
        total_cost += total_price
        validated_orders.append({
            **order_data,
            "service_name": service_name,
            "category": category,
            "price_per_unit": price_per_unit,
            "total_price": total_price,
        })

    # 1. Atomically reserve total cost under row-level lock
    locked_user_result = await db.execute(
        select(User).where(User.id == user.id).with_for_update()
    )
    locked_user = locked_user_result.scalar_one()

    if locked_user.balance < total_cost:
        raise ValueError(
            f"Insufficient balance. Required: {total_cost}, Your balance: {locked_user.balance}"
        )

    # Deduct and commit to release row lock before performing multiple external HTTP calls
    locked_user.balance -= total_cost
    await db.commit()

    created_orders = []
    # 2. Execute external API calls without holding database locks
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

    # 3. Calculate actual successful cost and refund any failed items
    successful_cost = sum(o.total_price for o in created_orders if o.status == "Pending")
    refund_amount = total_cost - successful_cost

    if refund_amount > 0:
        refund_res = await db.execute(
            select(User).where(User.id == user.id).with_for_update()
        )
        refund_user = refund_res.scalar_one()
        refund_user.balance += refund_amount

    await db.flush()
    create_notification(
        db,
        user.id,
        "order.mass_created",
        kind="success",
        data={"count": len(created_orders)},
        href="/orders",
    )
    await db.commit()
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
    try:
        ord_uuid = UUID(str(order_id))
        usr_uuid = UUID(str(user_id))
    except (ValueError, TypeError, AttributeError):
        return None

    result = await db.execute(
        select(Order).where(
            Order.id == ord_uuid,
            Order.user_id == usr_uuid,
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
        previous_status = order.status
        order.status = new_status
        order.start_count = _parse_int_or_none(data.get("start_count"), order.start_count)
        order.remains = _parse_int_or_none(data.get("remains"), order.remains)
        if new_status != previous_status:
            create_notification(
                db,
                order.user_id,
                "order.status_changed",
                kind=_notification_kind_for_status(new_status),
                data={
                    "order_id": str(order.id),
                    "service": order.service_name,
                    "status": new_status,
                },
                href="/orders",
            )

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
    if price_per_unit <= 0 or quantity <= 0:
        raise ValueError("Price per unit and quantity must be positive")
    return max(1, (price_per_unit * quantity) // 1000)
