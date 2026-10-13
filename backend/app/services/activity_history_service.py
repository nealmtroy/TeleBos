"""Activity history aggregation service.

Provides unified, server-side paginated, sorted, and filtered activity history
across SMM orders, marketplace account trades, and wallet transactions.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import math
from typing import Any
from uuid import UUID

from sqlalchemy import BigInteger, String, case, cast, desc, func, literal, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.account_audit_log import AccountAuditLog
from app.models.order import Order
from app.models.user import User
from app.models.wallet_transaction import WalletTransaction
from app.schemas.order import (
    ActivityHistoryResponse,
    ActivityMetrics,
    ActivityPagination,
    UnifiedActivityItem,
)

WIB = timezone(timedelta(hours=7))

MONTH_ID = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agt", "Sep", "Okt", "Nov", "Des"]
MONTH_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def format_wib_datetime(dt: datetime, locale: str = "id") -> tuple[str, str]:
    """Format UTC datetime into WIB (UTC+7) date string and time string."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    wib_dt = dt.astimezone(WIB)
    months = MONTH_ID if locale == "id" else MONTH_EN
    month_name = months[wib_dt.month - 1]
    date_str = f"{wib_dt.day:02d} {month_name} {wib_dt.year}"
    time_str = f"{wib_dt.hour:02d}:{wib_dt.minute:02d} WIB"
    return date_str, time_str


def _map_smm_status(status: str) -> str:
    s = (status or "").strip().lower()
    if s in ("success", "completed"):
        return "Selesai"
    if s in ("processing", "in progress"):
        return "Proses"
    if s == "pending":
        return "Menunggu"
    if s in ("failed", "error", "partial", "canceled", "cancelled"):
        return "Dibatalkan"
    return "Menunggu"


def _map_account_status(action: str) -> str:
    a = (action or "").strip().lower()
    if a == "list_for_sale":
        return "Proses"
    if a == "cancel_sale":
        return "Dibatalkan"
    return "Selesai"


def _map_wallet_status(status: str, tx_type: str) -> str:
    s = (status or "").strip().lower()
    if tx_type in ("redeem", "admin_adjustment"):
        return "Selesai"
    if s == "approved":
        return "Selesai"
    if s == "pending":
        return "Menunggu"
    return "Dibatalkan"


async def calculate_activity_metrics(
    db: AsyncSession,
    user_id: UUID | str,
) -> ActivityMetrics:
    """Calculate executive KPI metrics for user activity history."""
    uid = UUID(str(user_id)) if isinstance(user_id, str) else user_id

    # 1. SMM metrics
    smm_res = await db.execute(
        select(
            func.count(Order.id).label("total"),
            func.coalesce(func.sum(Order.total_price), 0).label("spend"),
            func.count(case((Order.status.in_(["Success", "Completed"]), 1))).label("completed"),
            func.count(case((Order.status.in_(["Processing", "In progress", "Pending"]), 1))).label("in_progress"),
        ).where(Order.user_id == uid)
    )
    smm_row = smm_res.one()
    smm_total = int(smm_row.total or 0)
    smm_spend = int(smm_row.spend or 0)
    smm_completed = int(smm_row.completed or 0)
    smm_in_progress = int(smm_row.in_progress or 0)

    # 2. Account metrics
    acct_res = await db.execute(
        select(
            func.count(AccountAuditLog.id).label("total"),
            func.coalesce(func.sum(AccountAuditLog.price), 0).label("spend"),
            func.count(case((AccountAuditLog.action.in_(["buy", "sell"]), 1))).label("completed"),
            func.count(case((AccountAuditLog.action == "list_for_sale", 1))).label("in_progress"),
        ).where(AccountAuditLog.user_id == uid)
    )
    acct_row = acct_res.one()
    acct_total = int(acct_row.total or 0)
    acct_spend = int(acct_row.spend or 0)
    acct_completed = int(acct_row.completed or 0)
    acct_in_progress = int(acct_row.in_progress or 0)

    # 3. Wallet metrics
    wallet_res = await db.execute(
        select(
            func.count(case((WalletTransaction.type == "topup", 1))).label("deposits"),
            func.count(case((WalletTransaction.type == "withdraw", 1))).label("withdrawals"),
            func.count(case((WalletTransaction.type.in_(["redeem", "admin_adjustment"]), 1))).label("balance_adj"),
            func.coalesce(func.sum(func.abs(WalletTransaction.amount)), 0).label("spend"),
            func.count(
                case((
                    (WalletTransaction.status == "approved")
                    | (WalletTransaction.type.in_(["redeem", "admin_adjustment"])),
                    1,
                ))
            ).label("completed"),
            func.count(case((WalletTransaction.status == "pending", 1))).label("in_progress"),
        ).where(WalletTransaction.user_id == uid)
    )
    wallet_row = wallet_res.one()
    deposits_count = int(wallet_row.deposits or 0)
    withdrawals_count = int(wallet_row.withdrawals or 0)
    balance_adj_count = int(wallet_row.balance_adj or 0)
    wallet_spend = int(wallet_row.spend or 0)
    wallet_completed = int(wallet_row.completed or 0)
    wallet_in_progress = int(wallet_row.in_progress or 0)

    total_orders = smm_total + acct_total + deposits_count + withdrawals_count + balance_adj_count
    total_spend = smm_spend + acct_spend + wallet_spend
    completed_count = smm_completed + acct_completed + wallet_completed
    in_progress_count = smm_in_progress + acct_in_progress + wallet_in_progress
    success_rate = f"{(completed_count / total_orders * 100):.1f}" if total_orders > 0 else "100.0"

    return ActivityMetrics(
        total_orders=total_orders,
        total_accounts=acct_total,
        total_smm=smm_total,
        total_deposits=deposits_count,
        total_withdrawals=withdrawals_count,
        total_balance_adj=balance_adj_count,
        total_spend=total_spend,
        in_progress_count=in_progress_count,
        completed_count=completed_count,
        success_rate=success_rate,
    )


async def get_user_activity_history(
    db: AsyncSession,
    user: User,
    *,
    tab: str = "all",
    search: str | None = None,
    status: str = "all",
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    sort_by: str = "date",
    sort_order: str = "desc",
    page: int = 1,
    page_size: int = 20,
    locale: str = "id",
) -> ActivityHistoryResponse:
    """Retrieve filtered, sorted, server-side paginated activity history with KPI metrics."""
    metrics = await calculate_activity_metrics(db, user.id)

    # Determine which tables to query based on tab
    query_smm = tab in ("all", "smm")
    query_accounts = tab in ("all", "accounts")
    query_deposits = tab in ("all", "deposits")
    query_withdrawals = tab in ("all", "withdrawals")
    query_balance = tab in ("all", "balance")

    items: list[dict[str, Any]] = []

    # 1. Query SMM Orders
    if query_smm:
        smm_stmt = select(Order).where(Order.user_id == user.id)
        if start_date:
            smm_stmt = smm_stmt.where(Order.created_at >= start_date)
        if end_date:
            smm_stmt = smm_stmt.where(Order.created_at <= end_date)
        if search and search.strip():
            term = f"%{search.strip().lower()}%"
            smm_stmt = smm_stmt.where(
                or_(
                    func.lower(cast(Order.id, String)).like(term),
                    func.lower(Order.service_name).like(term),
                    func.lower(Order.category).like(term),
                    func.lower(Order.data_target).like(term),
                    func.lower(cast(Order.smm_order_id, String)).like(term),
                )
            )
        smm_res = await db.execute(smm_stmt)
        for order in smm_res.scalars().all():
            st = _map_smm_status(order.status)
            if status != "all" and st != status and order.status != status:
                continue

            name_lower = (order.service_name or "").lower()
            if "reaction" in name_lower:
                qty_unit = "Reaksi" if locale == "id" else "Reactions"
            elif "view" in name_lower:
                qty_unit = "Tayangan" if locale == "id" else "Views"
            elif "member" in name_lower or "subscriber" in name_lower:
                qty_unit = "Anggota" if locale == "id" else "Members"
            elif "follower" in name_lower:
                qty_unit = "Pengikut" if locale == "id" else "Followers"
            else:
                qty_unit = "Layanan" if locale == "id" else "Items"

            date_str, time_str = format_wib_datetime(order.created_at, locale)
            items.append({
                "id": str(order.id),
                "order_id_display": f"#TB-{str(order.id)[:8].upper()}",
                "type": "smm",
                "type_name": "SMM Order",
                "service_name": order.service_name or "SMM Service",
                "service_sublabel": order.category or "General",
                "detail": order.data_target or "-",
                "quantity_display": f"{(order.quantity or 1):,} {qty_unit}",
                "quantity_raw": order.quantity or 1,
                "price_display": f"Rp {(order.total_price or 0):,}",
                "price_raw": order.total_price or 0,
                "status": st,
                "status_raw": order.status or "",
                "created_at": order.created_at,
                "date_str": date_str,
                "time_str": time_str,
                "telegram_id": None,
                "phone": None,
                "smm_order_id": order.smm_order_id,
                "remains": order.remains,
                "start_count": order.start_count,
                "target_url": order.data_target,
                "payment_method": None,
                "admin_note": None,
            })

    # 2. Query Account Audit Logs
    if query_accounts:
        acct_stmt = select(AccountAuditLog).where(AccountAuditLog.user_id == user.id)
        if start_date:
            acct_stmt = acct_stmt.where(AccountAuditLog.created_at >= start_date)
        if end_date:
            acct_stmt = acct_stmt.where(AccountAuditLog.created_at <= end_date)
        if search and search.strip():
            term = f"%{search.strip().lower()}%"
            acct_stmt = acct_stmt.where(
                or_(
                    func.lower(cast(AccountAuditLog.id, String)).like(term),
                    func.lower(AccountAuditLog.phone).like(term),
                    func.lower(cast(AccountAuditLog.telegram_id, String)).like(term),
                )
            )
        acct_res = await db.execute(acct_stmt)
        for log in acct_res.scalars().all():
            st = _map_account_status(log.action)
            if status != "all" and st != status and log.action != status:
                continue

            if log.action == "sell":
                svc_name = "Penjualan Akun" if locale == "id" else "Account Sale"
            elif log.action == "list_for_sale":
                svc_name = "Pendaftaran Jual" if locale == "id" else "Listing for Sale"
            elif log.action == "cancel_sale":
                svc_name = "Pembatalan Jual" if locale == "id" else "Cancelled Listing"
            else:
                svc_name = "Pembelian Akun" if locale == "id" else "Account Purchase"

            phone_disp = f"+{log.phone.lstrip('+')}" if log.phone else "-"
            date_str, time_str = format_wib_datetime(log.created_at, locale)
            items.append({
                "id": str(log.id),
                "order_id_display": f"#TB-{str(log.id)[:8].upper()}",
                "type": "telegram_account",
                "type_name": "Akun Telegram" if locale == "id" else "Telegram Account",
                "service_name": svc_name,
                "service_sublabel": "Transaksi Akun" if locale == "id" else "Account Trade",
                "detail": phone_disp,
                "quantity_display": "1 Akun" if locale == "id" else "1 Account",
                "quantity_raw": 1,
                "price_display": f"Rp {(log.price or 0):,}",
                "price_raw": log.price or 0,
                "status": st,
                "status_raw": log.action or "",
                "created_at": log.created_at,
                "date_str": date_str,
                "time_str": time_str,
                "telegram_id": log.telegram_id,
                "phone": log.phone,
                "smm_order_id": None,
                "remains": None,
                "start_count": None,
                "target_url": phone_disp,
                "payment_method": None,
                "admin_note": None,
            })

    # 3. Query Wallet Transactions
    if query_deposits or query_withdrawals or query_balance:
        wallet_stmt = select(WalletTransaction).where(WalletTransaction.user_id == user.id)
        types_to_include = []
        if query_deposits:
            types_to_include.append("topup")
        if query_withdrawals:
            types_to_include.append("withdraw")
        if query_balance:
            types_to_include.extend(["redeem", "admin_adjustment"])

        if types_to_include:
            wallet_stmt = wallet_stmt.where(WalletTransaction.type.in_(types_to_include))
        if start_date:
            wallet_stmt = wallet_stmt.where(WalletTransaction.created_at >= start_date)
        if end_date:
            wallet_stmt = wallet_stmt.where(WalletTransaction.created_at <= end_date)
        if search and search.strip():
            term = f"%{search.strip().lower()}%"
            wallet_stmt = wallet_stmt.where(
                or_(
                    func.lower(WalletTransaction.id).like(term),
                    func.lower(WalletTransaction.method).like(term),
                    func.lower(WalletTransaction.note).like(term),
                    func.lower(WalletTransaction.admin_note).like(term),
                )
            )

        wallet_res = await db.execute(wallet_stmt)
        for tx in wallet_res.scalars().all():
            st = _map_wallet_status(tx.status, tx.type)
            if status != "all" and st != status and tx.status != status:
                continue

            date_str, time_str = format_wib_datetime(tx.created_at, locale)
            amount = tx.amount or 0

            if tx.type == "topup":
                tx_type = "deposit"
                type_name = "Deposit Saldo" if locale == "id" else "Deposit"
                service_name = (
                    f"Isi Saldo via {tx.method or 'QRIS'}"
                    if locale == "id"
                    else f"Top Up via {tx.method or 'QRIS'}"
                )
                service_sublabel = tx.note or (
                    "Deposit Saldo Dompet" if locale == "id" else "Wallet Balance Deposit"
                )
                detail = f"{tx.method} • {tx.note}" if tx.method and tx.note else tx.method or "QRIS"
                price_display = f"+Rp {amount:,}"
            elif tx.type == "withdraw":
                tx_type = "withdraw"
                type_name = "Penarikan Saldo" if locale == "id" else "Withdrawal"
                service_name = (
                    f"Penarikan ({tx.method or 'Bank/E-Wallet'})"
                    if locale == "id"
                    else f"Withdrawal ({tx.method or 'Bank/E-Wallet'})"
                )
                service_sublabel = tx.note or (
                    "Rekening Penarikan" if locale == "id" else "Payout Destination"
                )
                detail = tx.note or tx.method or "-"
                price_display = f"-Rp {amount:,}"
            elif tx.type == "redeem":
                tx_type = "redeem"
                type_name = "Redeem Voucher" if locale == "id" else "Voucher Redeem"
                service_name = (
                    "Klaim Voucher Promo" if locale == "id" else "Promo Voucher Claim"
                )
                service_sublabel = (
                    f"Kode: {tx.note}"
                    if tx.note
                    else ("Kupon Hadiah TeleBos" if locale == "id" else "TeleBos Gift Voucher")
                )
                detail = tx.note or "Voucher Redeem"
                price_display = f"+Rp {amount:,}"
            else:
                tx_type = "admin_adjustment"
                is_credit = amount >= 0
                type_name = "Penyesuaian Saldo" if locale == "id" else "Balance Adjustment"
                service_name = (
                    "Penambahan Saldo oleh Admin" if is_credit else "Pengurangan Saldo oleh Admin"
                ) if locale == "id" else (
                    "Balance Credit by Admin" if is_credit else "Balance Debit by Admin"
                )
                service_sublabel = tx.note or (
                    "Penyesuaian oleh Administrator" if locale == "id" else "Administrator Adjustment"
                )
                detail = tx.admin_note or tx.note or "Admin Adjustment"
                price_display = f"{'+' if is_credit else '-'}Rp {abs(amount):,}"

            items.append({
                "id": tx.id,
                "order_id_display": f"#TRX-{tx.id.replace('wrn_', '').upper()}",
                "type": tx_type,
                "type_name": type_name,
                "service_name": service_name,
                "service_sublabel": service_sublabel,
                "detail": detail,
                "quantity_display": "1 Trx" if tx.type != "redeem" else "1 Kupon",
                "quantity_raw": 1,
                "price_display": price_display,
                "price_raw": amount,
                "status": st,
                "status_raw": tx.status or "",
                "created_at": tx.created_at,
                "date_str": date_str,
                "time_str": time_str,
                "telegram_id": None,
                "phone": None,
                "smm_order_id": None,
                "remains": None,
                "start_count": None,
                "target_url": None,
                "payment_method": tx.method,
                "admin_note": tx.admin_note,
            })

    # Sort items
    reverse = sort_order == "desc"
    if sort_by == "date":
        items.sort(key=lambda x: x["created_at"], reverse=reverse)
    elif sort_by == "price":
        items.sort(key=lambda x: x["price_raw"], reverse=reverse)
    elif sort_by == "status":
        items.sort(key=lambda x: x["status"].lower(), reverse=reverse)
    else:
        items.sort(key=lambda x: x["created_at"], reverse=reverse)

    total_items = len(items)
    total_pages = max(1, math.ceil(total_items / page_size)) if total_items > 0 else 1
    offset = (page - 1) * page_size
    paginated_items = items[offset : offset + page_size]

    typed_items = [UnifiedActivityItem(**item) for item in paginated_items]

    return ActivityHistoryResponse(
        items=typed_items,
        pagination=ActivityPagination(
            page=page,
            page_size=page_size,
            total_items=total_items,
            total_pages=total_pages,
        ),
        metrics=metrics,
    )
