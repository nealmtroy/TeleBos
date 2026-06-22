"""Marketplace service logic — buy and sell Telegram accounts, manage stock."""

import logging
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.telegram_account import TelegramAccount
from app.models.user import User
from app.models.account_audit_log import AccountAuditLog
from app.models.smm_setting import SmmSetting
from app.models.broadcast_job import BroadcastJob
from app.models.invite_job import InviteJob
from app.services.telegram_client import client_pool

logger = logging.getLogger(__name__)


def get_country_code_and_name(phone: str) -> tuple[str, str]:
    """Helper to extract country code prefix and name from a phone number."""
    if not phone:
        return "+Unknown", "Unknown"

    # Clean phone number
    cleaned = "".join(c for c in phone if c.isdigit() or c == "+")
    if not cleaned.startswith("+"):
        cleaned = "+" + cleaned

    prefixes = {
        "+62": "Indonesia",
        "+1": "United States/Canada",
        "+7": "Russia/Kazakhstan",
        "+44": "United Kingdom",
        "+91": "India",
        "+86": "China",
        "+33": "France",
        "+49": "Germany",
        "+39": "Italy",
        "+34": "Spain",
        "+81": "Japan",
        "+82": "South Korea",
        "+84": "Vietnam",
        "+66": "Thailand",
        "+60": "Malaysia",
        "+65": "Singapore",
        "+63": "Philippines",
        "+92": "Pakistan",
        "+90": "Turkey",
        "+98": "Iran",
        "+380": "Ukraine",
        "+998": "Uzbekistan",
        "+992": "Tajikistan",
        "+993": "Turkmenistan",
        "+994": "Azerbaijan",
        "+995": "Georgia",
        "+996": "Kyrgyzstan",
        "+370": "Lithuania",
        "+371": "Latvia",
        "+372": "Estonia",
        "+375": "Belarus",
        "+351": "Portugal",
    }

    # Try 4-character prefix (e.g. +380), then 3-character (e.g. +62), then 2-character (e.g. +1)
    for length in [4, 3, 2]:
        if len(cleaned) >= length:
            prefix = cleaned[:length]
            if prefix in prefixes:
                return prefix, prefixes[prefix]

    if len(cleaned) > 2:
        return cleaned[:3], "Other"
    return cleaned, "Other"


async def get_sell_eligible_accounts(db: AsyncSession, user: User) -> list[TelegramAccount]:
    """Get all connected accounts owned by the user that can be listed for sale."""
    result = await db.execute(
        select(TelegramAccount).where(
            and_(
                TelegramAccount.user_id == user.id,
                TelegramAccount.phone_verified == True,
                TelegramAccount.for_sale == False,
                TelegramAccount.is_sold == False,
            )
        ).order_by(TelegramAccount.created_at.desc())
    )
    return list(result.scalars().all())


async def get_marketplace_prices(db: AsyncSession) -> tuple[int, int]:
    """Retrieve current default buy and sell prices from settings."""
    result = await db.execute(select(SmmSetting))
    rows = result.scalars().all()
    settings = {row.key: row.value for row in rows}

    buy_price = int(settings.get("account_buy_price", "7000"))
    sell_price = int(settings.get("account_sell_price", "5500"))
    return buy_price, sell_price


async def sell_accounts(
    db: AsyncSession,
    user: User,
    account_data: list[dict],  # [{"account_id": str, "sell_price": int}, ...]
) -> int:
    """List accounts for sale with per-account pricing.

    Does NOT credit the seller's balance immediately. The seller only gets paid
    when someone buys the account.

    Returns the number of accounts listed.
    """
    if not account_data:
        raise ValueError("At least one account is required.")

    processed = 0

    for item in account_data:
        acc_id_str = item["account_id"]
        sell_price = item.get("sell_price", 0)

        try:
            acc_uuid = UUID(acc_id_str)
        except ValueError:
            raise ValueError(f"Invalid account ID format: {acc_id_str}")

        account = await db.get(TelegramAccount, acc_uuid)
        if not account or account.user_id != user.id:
            raise ValueError(f"Account not found or not owned by you: {acc_id_str}")

        if account.for_sale or account.is_sold:
            raise ValueError(f"Account is already listed for sale or sold: {account.phone}")

        if sell_price <= 0:
            raise ValueError(f"Sell price must be greater than 0 for account {account.phone}")

        # 1. Stop all active/paused/pending automation for this account

        # Broadcast Jobs
        active_broadcasts = await db.execute(
            select(BroadcastJob).where(
                BroadcastJob.status.in_(["running", "paused", "pending"])
            )
        )
        for job in active_broadcasts.scalars().all():
            if str(account.id) in job.account_ids:
                job.status = "cancelled"

        # Invite Jobs
        active_invites = await db.execute(
            select(InviteJob).where(
                InviteJob.status.in_(["running", "paused", "pending"])
            )
        )
        for job in active_invites.scalars().all():
            if str(account.id) in job.account_ids:
                job.status = "cancelled"
                from app.services.invite_service import _running_invite_tasks
                task = _running_invite_tasks.get(str(job.id))
                if task:
                    task.cancel()

        # 2. Mark account as for_sale with the seller's price
        #    Account stays owned by the seller until purchased
        account.for_sale = True
        account.is_sold = False
        account.sell_price = sell_price
        account.seller_id = user.id  # Track who will get paid
        account.is_active = False
        account.auto_reply_enabled = False
        account.sale_listed_at = datetime.now(timezone.utc)

        # 3. Remove client session from memory pool
        await client_pool.remove(str(account.id))

        # 4. Write audit log
        audit = AccountAuditLog(
            user_id=user.id,
            account_id=account.id,
            action="list_for_sale",
            price=sell_price,
            phone=account.phone,
            telegram_id=account.telegram_id,
        )
        db.add(audit)

        # NOTE: No balance credit — seller gets paid when account is purchased
        processed += 1

    await db.flush()
    return processed


async def get_stock_categories(db: AsyncSession) -> list[dict]:
    """Retrieve available account stock categories grouped by country prefix."""
    result = await db.execute(
        select(TelegramAccount).where(
            and_(
                TelegramAccount.for_sale == True,
                TelegramAccount.is_sold == False,
            )
        )
    )
    accounts = result.scalars().all()
    _, default_sell_price = await get_marketplace_prices(db)

    groups = {}
    for acc in accounts:
        prefix, name = get_country_code_and_name(acc.phone)
        if prefix not in groups:
            groups[prefix] = {
                "country_code": prefix,
                "country_name": name,
                "ready_stock": 0,
                "price": default_sell_price,  # fallback
            }
        groups[prefix]["ready_stock"] += 1
        # Keep the minimum price in the category as the display "from" price
        acc_price = acc.sell_price or default_sell_price
        if groups[prefix]["price"] > acc_price:
            groups[prefix]["price"] = acc_price

    return sorted(list(groups.values()), key=lambda x: x["country_code"])


async def get_stock_accounts(db: AsyncSession, country_code: str) -> list[dict]:
    """Retrieve accounts for sale in a category, showing limited summary details."""
    result = await db.execute(
        select(TelegramAccount).where(
            and_(
                TelegramAccount.for_sale == True,
                TelegramAccount.is_sold == False,
            )
        )
    )
    accounts = result.scalars().all()

    matched = []
    for acc in accounts:
        prefix, _ = get_country_code_and_name(acc.phone)
        if prefix == country_code:
            matched.append({
                "id": acc.id,
                "telegram_id": acc.telegram_id,
                "twofa_enabled": acc.twofa_enabled,
                "recovery_email_available": acc.recovery_email is not None,
                "sell_price": acc.sell_price,
            })

    return matched


async def buy_account(db: AsyncSession, user: User, account_id: str) -> TelegramAccount:
    """Atomic buy transaction.

    Locks the account row, checks buyer balance, transfers ownership,
    credits the seller's balance.
    """
    try:
        acc_uuid = UUID(account_id)
    except ValueError:
        raise ValueError("Invalid account ID format.")

    # Select the account with a row-level write lock (FOR UPDATE)
    stmt = select(TelegramAccount).where(
        and_(
            TelegramAccount.id == acc_uuid,
            TelegramAccount.for_sale == True,
            TelegramAccount.is_sold == False,
        )
    ).with_for_update()

    result = await db.execute(stmt)
    account = result.scalar_one_or_none()

    if not account:
        raise ValueError("Account is no longer available for purchase.")

    # Use the account's own sell_price; fallback to default
    buy_price = account.sell_price or 7000

    if user.balance < buy_price:
        raise ValueError("Insufficient balance to buy this account.")

    # Identify the seller (who gets credited)
    seller_id = account.seller_id or account.user_id

    # 1. Debit buyer's balance
    user.balance -= buy_price

    # 2. Credit seller's balance
    seller_result = await db.execute(
        select(User).where(User.id == seller_id).with_for_update()
    )
    seller = seller_result.scalar_one_or_none()
    if seller:
        seller.balance += buy_price
    else:
        # If seller no longer exists, the platform keeps the balance
        # (e.g. user was deleted). Just skip the credit.
        logger.warning("Seller %s not found for account %s — keeping balance as platform revenue", seller_id, account_id)

    # 3. Update ownership and flags
    account.user_id = user.id
    account.for_sale = False
    account.is_sold = True
    account.sold_at = datetime.now(timezone.utc)
    # The buyer starts with a clean slate: inactive until they choose to activate it
    account.is_active = False

    # 4. Create transaction audit log
    audit_seller = AccountAuditLog(
        user_id=seller_id,
        account_id=account.id,
        action="sell",
        price=buy_price,
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

    await db.flush()
    return account
