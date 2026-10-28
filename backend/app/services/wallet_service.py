"""Wallet fulfillment and transaction service."""

import json
import logging
from datetime import datetime, timedelta
from uuid import UUID

from sqlalchemy import and_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.account_audit_log import AccountAuditLog
from app.models.order import Order
from app.models.smm_service import SmmService
from app.models.telegram_account import TelegramAccount
from app.models.user import User
from app.models.wallet_transaction import WalletTransaction
from app.services.ledger_service import record_ledger_entry
from app.services.notification_service import create_notification
from app.services.smm_service import create_order
from app.utils.timezone import ensure_utc

logger = logging.getLogger(__name__)


def generate_qris_string(invoice_id: str, amount: int) -> str:
    """Generate static/dynamic QRIS formatted string payload."""
    amount_str = str(amount)
    amount_len = f"{len(amount_str):02d}"
    inv_inner_len = f"{len(invoice_id):02d}"
    inv_outer_len = f"{len(invoice_id) + 4:02d}"
    return (
        f"00020101021226610014ID.LINKAJA.WWW0118936009110022304930020300051440014ID.DANA.WWW"
        f"01189360091100223049300203000520458125303360540{amount_len}{amount_str}5802ID5911TELEBOS PAY"
        f"6007JAKARTA61051294062{inv_outer_len}01{inv_inner_len}{invoice_id}6304A1B2"
    )


async def _safe_bg_reconnect_account(account_id: str) -> None:
    """Safely reconnect an account in the background without holding a request-scoped DB session."""
    try:
        from app.services.session_manager import session_manager

        await session_manager.ensure_connected_on_demand(account_id)
    except Exception as exc:
        logger.warning(
            "Background auto-reconnect failed for account %s: %s", account_id, exc
        )


def _get_reconnect_fn():
    """Retrieve reconnect function, resolving patches on app.api.wallet if present."""
    import sys

    mod = sys.modules.get("app.api.wallet")
    if mod and hasattr(mod, "_safe_bg_reconnect_account"):
        return getattr(mod, "_safe_bg_reconnect_account")
    return _safe_bg_reconnect_account


async def fulfill_wallet_transaction(
    db: AsyncSession,
    tx: WalletTransaction,
    user: User,
    total_paid: int | float,
    now_utc: datetime,
) -> bool:
    """Fulfill a paid wallet transaction according to its type.

    Handles:
    - subscription: activates plan and extends expiry
    - smm: dispatches order to SMM provider and creates Order record
    - marketplace: transfers TelegramAccount ownership to buyer and credits seller
    - topup (or fallback): adds funds to user's wallet balance
    """
    if tx.status != "pending":
        return False

    if tx.type == "subscription" and tx.note:
        try:
            sub_data = json.loads(tx.note)
            plan = sub_data.get("plan_id")
            duration_days = sub_data.get("duration_days", 30)

            # Apply subscription
            user.role = plan
            await db.execute(
                text('UPDATE "user" SET role = :role WHERE id = :user_id'),
                {"role": plan, "user_id": str(user.id)},
            )

            current_expiry = ensure_utc(user.subscription_expires_at)
            base_time = (
                max(now_utc, current_expiry)
                if (current_expiry and current_expiry > now_utc)
                else now_utc
            )
            user.subscription_expires_at = base_time + timedelta(days=duration_days)

            tx.admin_note = f"Subscription {plan.title()} activated via QRIS (total: Rp {int(float(total_paid)):,})"
            create_notification(
                db,
                user.id,
                "subscription.upgraded",
                kind="success",
                data={
                    "tx_id": tx.id,
                    "plan": plan,
                    "duration_days": duration_days,
                },
                href="/subscriptions",
            )
        except Exception as e:
            logger.error("Failed to parse subscription note for tx=%s: %s", tx.id, e)
            await record_ledger_entry(
                db=db,
                user=user,
                amount=tx.amount,
                entry_type="CREDIT",
                category="topup_fallback",
                reference_id=tx.id,
                description="Parsing paket langganan gagal, dialihkan ke saldo dompet",
            )
            tx.admin_note = f"Auto-approved via QRIS (total: Rp {int(float(total_paid)):,}) - Sub failed, credited to balance"
            create_notification(
                db,
                user.id,
                "wallet.topup_approved",
                kind="warning",
                data={"tx_id": tx.id, "amount": tx.amount, "method": tx.method},
                href="/wallet",
            )

    elif tx.type == "smm" and tx.note:
        try:
            smm_data = json.loads(tx.note)
            service_id = smm_data.get("service_id")
            data_target = smm_data.get("data_target")
            quantity = smm_data.get("quantity")
            comments = smm_data.get("comments")
            usernames = smm_data.get("usernames")
            existing_order_id = smm_data.get("order_id")

            result = await create_order(
                service_id, data_target, quantity, comments, usernames
            )
            if result.get("status"):
                smm_order_id = str(result.get("data", {}).get("id", ""))
                order = None
                if existing_order_id:
                    order = await db.get(Order, UUID(existing_order_id))
                if order:
                    order.status = "Pending"
                    order.smm_order_id = smm_order_id
                    order.note = f"Paid via QRIS invoice {tx.id}"
                else:
                    svc = await db.get(SmmService, service_id)
                    order = Order(
                        user_id=user.id,
                        smm_order_id=smm_order_id,
                        service_id=service_id,
                        service_name=svc.service_name
                        if svc
                        else f"Service #{service_id}",
                        category=svc.category if svc else "SMM",
                        data_target=data_target,
                        quantity=quantity,
                        price=svc.original_price if svc else 0,
                        total_price=tx.amount,
                        status="Pending",
                        is_mass_order=False,
                        note=f"Paid via QRIS invoice {tx.id}",
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
                tx.admin_note = f"SMM Order #{smm_order_id} placed via QRIS (total: Rp {int(float(total_paid)):,})"
            else:
                msg = result.get("data", {}).get("msg", "Unknown API error")
                logger.error(
                    "SMM API failed for tx=%s: %s. Refunding to user balance.",
                    tx.id,
                    msg,
                )
                await record_ledger_entry(
                    db=db,
                    user=user,
                    amount=tx.amount,
                    entry_type="CREDIT",
                    category="topup_fallback",
                    reference_id=tx.id,
                    description=f"SMM API error ({msg}), dialihkan ke saldo dompet",
                )
                if existing_order_id:
                    ord_rec = await db.get(Order, UUID(existing_order_id))
                    if ord_rec:
                        ord_rec.status = "Failed"
                        ord_rec.note = (
                            f"Order failed ({msg}). Refunded to wallet balance."
                        )
                tx.admin_note = (
                    f"SMM API failed ({msg}), credited Rp {tx.amount} to user balance"
                )
                create_notification(
                    db,
                    user.id,
                    "wallet.topup_approved",
                    kind="warning",
                    data={
                        "tx_id": tx.id,
                        "amount": tx.amount,
                        "method": tx.method,
                        "reason": f"SMM error: {msg}",
                    },
                    href="/wallet",
                )
        except Exception as e:
            logger.error("Failed to fulfill SMM order for tx=%s: %s", tx.id, e)
            await record_ledger_entry(
                db=db,
                user=user,
                amount=tx.amount,
                entry_type="CREDIT",
                category="topup_fallback",
                reference_id=tx.id,
                description=f"SMM fulfillment exception ({e}), dialihkan ke saldo dompet",
            )
            tx.admin_note = f"SMM fulfillment exception ({e}), credited Rp {tx.amount} to balance"
            create_notification(
                db,
                user.id,
                "wallet.topup_approved",
                kind="warning",
                data={"tx_id": tx.id, "amount": tx.amount, "method": tx.method},
                href="/wallet",
            )

    elif tx.type == "marketplace" and tx.note:
        try:
            m_data = json.loads(tx.note)
            account_id_str = m_data.get("account_id")
            acc_uuid = UUID(account_id_str)

            stmt = (
                select(TelegramAccount)
                .where(
                    and_(
                        TelegramAccount.id == acc_uuid,
                        TelegramAccount.for_sale.is_(True),
                        TelegramAccount.is_sold.is_(False),
                    )
                )
                .with_for_update()
            )
            acc_res = await db.execute(stmt)
            account = acc_res.scalar_one_or_none()

            if account:
                seller_id = account.seller_id or account.user_id
                sell_price = account.sell_price or 7000
                buy_price = tx.amount

                if seller_id:
                    s_res = await db.execute(
                        select(User).where(User.id == seller_id).with_for_update()
                    )
                    seller = s_res.scalar_one_or_none()
                    if seller:
                        await record_ledger_entry(
                            db=db,
                            user=seller,
                            amount=sell_price,
                            entry_type="CREDIT",
                            category="marketplace_sell",
                            reference_id=tx.id,
                            description=f"Hasil penjualan akun Telegram #{account.phone or str(account.id)[:8]}",
                        )

                account.user_id = user.id
                account.for_sale = False
                account.is_sold = False
                account.sold_at = now_utc
                account.buy_price = None
                account.sell_price = None
                account.seller_id = None
                account.is_active = True

                audit_seller = AccountAuditLog(
                    user_id=seller_id,
                    account_id=account.id,
                    action="sell",
                    price=sell_price,
                    phone=account.phone,
                    telegram_id=account.telegram_id,
                )
                db.add(audit_seller)

                audit_buyer = AccountAuditLog(
                    user_id=user.id,
                    account_id=account.id,
                    action="buy",
                    price=buy_price,
                    phone=account.phone,
                    telegram_id=account.telegram_id,
                )
                db.add(audit_buyer)

                if seller_id:
                    create_notification(
                        db,
                        seller_id,
                        "marketplace.sale_completed",
                        kind="success",
                        data={
                            "account_id": str(account.id),
                            "phone": account.phone,
                            "price": sell_price,
                        },
                        href="/orders?tab=accounts",
                    )
                create_notification(
                    db,
                    user.id,
                    "marketplace.purchase_completed",
                    kind="success",
                    data={
                        "account_id": str(account.id),
                        "phone": account.phone,
                        "price": buy_price,
                    },
                    href="/orders?tab=accounts",
                )

                tx.admin_note = f"Telegram account {account.phone} transferred via QRIS (total: Rp {int(float(total_paid)):,})"

                try:
                    import asyncio

                    reconnect_fn = _get_reconnect_fn()
                    asyncio.create_task(reconnect_fn(str(account.id)))
                except Exception as exc:
                    logger.warning(
                        "Failed to schedule auto-reconnect for account %s: %s",
                        account.id,
                        exc,
                    )
            else:
                logger.warning(
                    "Account %s no longer available for marketplace tx=%s. Crediting to buyer balance.",
                    account_id_str,
                    tx.id,
                )
                await record_ledger_entry(
                    db=db,
                    user=user,
                    amount=tx.amount,
                    entry_type="CREDIT",
                    category="topup_fallback",
                    reference_id=tx.id,
                    description="Akun sudah terjual, dana dialihkan ke saldo dompet",
                )
                tx.admin_note = (
                    f"Account no longer available, credited Rp {tx.amount} to balance"
                )
                create_notification(
                    db,
                    user.id,
                    "wallet.topup_approved",
                    kind="info",
                    data={
                        "tx_id": tx.id,
                        "amount": tx.amount,
                        "reason": "Akun sudah terjual, dana dialihkan ke saldo dompet",
                    },
                    href="/wallet",
                )
        except Exception as e:
            logger.error(
                "Failed to fulfill marketplace transaction for tx=%s: %s", tx.id, e
            )
            await record_ledger_entry(
                db=db,
                user=user,
                amount=tx.amount,
                entry_type="CREDIT",
                category="topup_fallback",
                reference_id=tx.id,
                description=f"Marketplace error ({e}), dialihkan ke saldo dompet",
            )
            tx.admin_note = (
                f"Marketplace error ({e}), credited Rp {tx.amount} to balance"
            )
            create_notification(
                db,
                user.id,
                "wallet.topup_approved",
                kind="warning",
                data={"tx_id": tx.id, "amount": tx.amount},
                href="/wallet",
            )
    else:
        # Default: Top-up
        await record_ledger_entry(
            db=db,
            user=user,
            amount=tx.amount,
            entry_type="CREDIT",
            category="topup",
            reference_id=tx.id,
            description=f"Deposit {tx.method or 'QRIS'} otomatis disetujui (total: Rp {int(float(total_paid)):,})",
        )
        tx.admin_note = (
            f"Auto-approved via {tx.method or 'Paymenku QRIS'} (total: Rp {int(float(total_paid)):,})"
        )
        create_notification(
            db,
            user.id,
            "wallet.topup_approved",
            kind="success",
            data={
                "tx_id": tx.id,
                "amount": tx.amount,
                "method": tx.method,
            },
            href="/wallet",
        )

    tx.status = "approved"
    tx.processed_at = now_utc
    return True
