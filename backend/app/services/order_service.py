from datetime import datetime, timezone
import json
import logging
from uuid import UUID

from sqlalchemy import select, desc, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.order import Order
from app.models.smm_service import SmmService
from app.models.smm_setting import SmmSetting
from app.models.user import User
from app.models.wallet_transaction import WalletTransaction, generate_wallet_tx_id
from app.services.klikqris_service import create_qris_transaction, is_klikqris_configured
# Imported rather than redeclared: the allowlist lives in app/smm_service_ids.py
# so this service layer and app/api/orders.py can never disagree about which
# services are sellable.
from app.smm_service_ids import ALLOWED_SMM_SERVICE_IDS
from app.services.smm_service import create_order, check_order_status
from app.services.notification_service import create_notification
from app.services.ledger_service import record_ledger_entry
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


def _notification_kind_for_status(status: str) -> str:
    normalized = status.lower()
    if normalized in {"failed", "error", "partial", "canceled", "cancelled"}:
        return "error"
    if normalized in {"success", "completed"}:
        return "success"
    if normalized in {"processing", "in progress"}:
        return "info"
    return "warning"


notification_kind_for_status = _notification_kind_for_status


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
        # Insufficient balance: create QRIS invoice and pending order
        invoice_id = generate_wallet_tx_id()
        now_utc = datetime.now(timezone.utc)
        settings = get_settings()

        qris_url = None
        qris_image = None
        signature = None

        if is_klikqris_configured():
            callback_url = (
                settings.KLIKQRIS_CALLBACK_URL
                or f"{settings.NEXT_PUBLIC_URL.rstrip('/')}/api/v1/wallet/webhook/klikqris"
            )
            keterangan = f"Order {service_name[:30]} ({locked_user.email})"
            try:
                kq_data = await create_qris_transaction(
                    order_id=invoice_id,
                    amount=total_price,
                    keterangan=keterangan,
                    callback_url=callback_url,
                )
                qris_url = kq_data.get("qris_url")
                qris_image = kq_data.get("qris_image")
                signature = kq_data.get("signature")
            except Exception as e:
                logger.warning("Failed to create KlikQRIS transaction for order %s: %s", invoice_id, e)

        order = Order(
            user_id=user.id,
            smm_order_id=None,
            service_id=service_id,
            service_name=service_name,
            category=category,
            data_target=data_target,
            quantity=quantity,
            price=price_per_unit,
            total_price=total_price,
            status="Awaiting Payment",
            is_mass_order=False,
            note=f"Menunggu pembayaran invoice QRIS {invoice_id}",
        )
        db.add(order)
        await db.flush()

        note_data = json.dumps({
            "order_id": str(order.id),
            "service_id": service_id,
            "data_target": data_target,
            "quantity": quantity,
            "comments": comments,
            "usernames": usernames,
        })

        tx = WalletTransaction(
            id=invoice_id,
            user_id=user.id,
            type="smm",
            amount=total_price,
            total_amount=total_price,
            method="QRIS",
            note=note_data,
            status="pending",
            signature=signature,
            qris_url=qris_url,
            qris_image=qris_image,
            created_at=now_utc,
        )
        db.add(tx)
        await db.commit()

        order.invoice_id = invoice_id
        order.payment_required = True
        return order

    # Deduct balance via double-entry ledger and commit to release row write lock before network I/O
    await record_ledger_entry(
        db=db,
        user=locked_user,
        amount=total_price,
        entry_type="DEBIT",
        category="order_smm",
        description=f"Pembelian layanan SMM #{service_id}: {service_name}",
    )
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
        await record_ledger_entry(
            db=db,
            user=refund_user,
            amount=total_price,
            entry_type="CREDIT",
            category="order_smm_refund",
            description=f"Refund SMM gagal akibat error jaringan #{service_id}: {service_name}",
        )
        await db.commit()
        raise ValueError(f"Order failed due to network error: {exc}")

    if not result.get("status"):
        # Refund on API failure
        refund_res = await db.execute(
            select(User).where(User.id == user.id).with_for_update()
        )
        refund_user = refund_res.scalar_one()
        await record_ledger_entry(
            db=db,
            user=refund_user,
            amount=total_price,
            entry_type="CREDIT",
            category="order_smm_refund",
            description=f"Refund SMM gagal #{service_id}: {service_name}",
        )
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
        # Create mass order invoice
        invoice_id = generate_wallet_tx_id()
        now_utc = datetime.now(timezone.utc)
        settings = get_settings()

        qris_url = None
        qris_image = None
        signature = None

        if is_klikqris_configured():
            callback_url = (
                settings.KLIKQRIS_CALLBACK_URL
                or f"{settings.NEXT_PUBLIC_URL.rstrip('/')}/api/v1/wallet/webhook/klikqris"
            )
            keterangan = f"Mass Order {len(validated_orders)} items ({locked_user.email})"
            try:
                kq_data = await create_qris_transaction(
                    order_id=invoice_id,
                    amount=total_cost,
                    keterangan=keterangan,
                    callback_url=callback_url,
                )
                qris_url = kq_data.get("qris_url")
                qris_image = kq_data.get("qris_image")
                signature = kq_data.get("signature")
            except Exception as e:
                logger.warning("Failed to create KlikQRIS transaction for mass order %s: %s", invoice_id, e)

        created_orders = []
        for vd in validated_orders:
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
                status="Awaiting Payment",
                is_mass_order=True,
                mass_parent_id=None,
                note=f"Menunggu pembayaran invoice QRIS {invoice_id}",
            )
            db.add(order)
            created_orders.append(order)

        await db.flush()

        tx_note_orders = [
            {
                "order_id": str(ord.id),
                "service_id": ord.service_id,
                "data_target": ord.data_target,
                "quantity": ord.quantity,
                "comments": ord_data.get("comments"),
                "usernames": ord_data.get("usernames"),
            }
            for ord, ord_data in zip(created_orders, validated_orders)
        ]

        tx = WalletTransaction(
            id=invoice_id,
            user_id=user.id,
            type="smm",
            amount=total_cost,
            total_amount=total_cost,
            method="QRIS",
            note=json.dumps({"is_mass": True, "orders": tx_note_orders}),
            status="pending",
            signature=signature,
            qris_url=qris_url,
            qris_image=qris_image,
            created_at=now_utc,
        )
        db.add(tx)
        await db.commit()

        for ord in created_orders:
            ord.invoice_id = invoice_id
            ord.payment_required = True

        return created_orders

    # Deduct and commit to release row lock before performing multiple external HTTP calls
    await record_ledger_entry(
        db=db,
        user=locked_user,
        amount=total_cost,
        entry_type="DEBIT",
        category="order_smm_mass",
        description=f"Mass Order SMM {len(validated_orders)} item",
    )
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
        await record_ledger_entry(
            db=db,
            user=refund_user,
            amount=refund_amount,
            entry_type="CREDIT",
            category="order_smm_refund",
            description=f"Refund item gagal pada Mass Order SMM ({len(created_orders)} item)",
        )

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


async def process_order_refund_if_eligible(
    db: AsyncSession,
    order: Order,
    new_status: str,
) -> int:
    """Process an idempotent refund for terminal partial, canceled, or error SMM orders.

    Guards against double-refunding via order.is_refunded and locks the user row with FOR UPDATE.

    Returns:
        The refund amount credited (0 if not eligible or already refunded).
    """
    if getattr(order, "is_refunded", False):
        return 0

    norm_status = (new_status or "").strip().title()
    refund_amount = 0

    if norm_status in ("Canceled", "Cancelled", "Error"):
        # 100% full refund if canceled or errored
        refund_amount = order.total_price
    elif norm_status == "Partial":
        # Prorated refund based on remaining units
        if order.remains is not None and order.remains > 0 and order.quantity > 0:
            calculated = (order.total_price * order.remains) // order.quantity
            refund_amount = min(order.total_price, max(0, calculated))
        elif order.remains == 0:
            refund_amount = 0

    if refund_amount <= 0:
        return 0

    user_res = await db.execute(
        select(User).where(User.id == order.user_id).with_for_update()
    )
    user = user_res.scalar_one_or_none()
    if not user:
        logger.warning(
            "User %s not found when attempting to refund order %s",
            order.user_id,
            order.id,
        )
        return 0

    await record_ledger_entry(
        db=db,
        user=user,
        amount=refund_amount,
        entry_type="CREDIT",
        category="order_smm_refund",
        reference_id=str(order.id),
        description=f"Refund SMM ({norm_status}) pesanan #{order.id}: {order.service_name}",
    )
    order.is_refunded = True
    order.refunded_amount = refund_amount

    # Send refund notification to user
    create_notification(
        db,
        order.user_id,
        "wallet.refund_received",
        kind="info",
        data={
            "order_id": str(order.id),
            "service": order.service_name,
            "amount": refund_amount,
            "status": norm_status,
            "remains": order.remains,
        },
        href="/wallet",
    )
    logger.info(
        "Successfully refunded Rp %d to user %s for order %s (status=%s, remains=%s/%s)",
        refund_amount,
        order.user_id,
        order.id,
        norm_status,
        order.remains,
        order.quantity,
    )
    return refund_amount


async def refresh_order_status(db: AsyncSession, order: Order) -> Order:
    """Check the SMM panel for latest order status, process refund if applicable, and update DB."""
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

        # Process refund if terminal status and not already refunded
        await process_order_refund_if_eligible(db, order, new_status)

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
    """Refresh all non-terminal or unrefunded orders for a user.

    Returns:
        Number of orders updated.
    """
    query = select(Order).where(
        Order.user_id == UUID(user_id),
        or_(
            Order.status.in_(["Pending", "Processing", "In progress"]),
            and_(Order.status == "Partial", Order.is_refunded.is_(False)),
        ),
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
