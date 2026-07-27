"""Marketplace service logic — buy and sell Telegram accounts, manage stock."""

import logging
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select, func, and_
from sqlalchemy.orm import selectinload
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
    from app.services.user_account_price_service import resolve_prices_for_accounts

    result = await db.execute(
        select(TelegramAccount)
        .options(selectinload(TelegramAccount.folders))
        .where(
            and_(
                TelegramAccount.user_id == user.id,
                TelegramAccount.phone_verified == True,
                TelegramAccount.for_sale == False,
                TelegramAccount.is_sold == False,
            )
        ).order_by(TelegramAccount.created_at.desc())
    )
    accounts = list(result.scalars().all())

    # Inject sell_price from prefix pricing (not persisted, just for display)
    await resolve_prices_for_accounts(db, accounts)

    return accounts


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
    account_ids: list[str],  # just account IDs — price is auto-determined
) -> int:
    """List accounts only after their Telegram profiles are safe for transfer.

    Telegram profile changes are external, forward-only side effects: they may
    remain applied if a later account in the batch fails. The database listing
    itself is fail-closed and is rolled back by the API unless every requested
    account finishes preparation successfully.
    """
    if not account_ids:
        raise ValueError("At least one account is required.")

    account_uuids: list[UUID] = []
    for acc_id_str in account_ids:
        try:
            account_uuids.append(UUID(acc_id_str))
        except ValueError as exc:
            raise ValueError(f"Invalid account ID format: {acc_id_str}") from exc

    if len(set(account_uuids)) != len(account_uuids):
        raise ValueError("Each account can only be listed once per request.")

    result = await db.execute(
        select(TelegramAccount)
        .where(
            TelegramAccount.id.in_(account_uuids),
            TelegramAccount.user_id == user.id,
        )
        .with_for_update()
    )
    accounts_by_id = {account.id: account for account in result.scalars().all()}
    if len(accounts_by_id) != len(account_uuids):
        raise ValueError("One or more accounts were not found or are not owned by you.")

    accounts = [accounts_by_id[account_id] for account_id in account_uuids]
    for account in accounts:
        if account.for_sale or account.is_sold:
            raise ValueError(f"Account is already listed for sale or sold: {account.phone}")

    from app.services.marketplace_profile_service import prepare_account_for_sale
    from app.services.user_account_price_service import resolve_telegram_id_price

    reserved_usernames: set[str] = set()
    prices: dict[UUID, int] = {}
    for account in accounts:
        prices[account.id] = await resolve_telegram_id_price(db, account)
        await prepare_account_for_sale(
            db,
            account,
            reserved_usernames=reserved_usernames,
        )

    active_broadcasts = await db.execute(
        select(BroadcastJob).where(BroadcastJob.status.in_(["running", "paused", "pending"]))
    )
    active_invites = await db.execute(
        select(InviteJob).where(InviteJob.status.in_(["running", "paused", "pending"]))
    )
    broadcast_jobs = active_broadcasts.scalars().all()
    invite_jobs = active_invites.scalars().all()

    from app.services.event_relay import event_relay
    from app.services.invite_service import _running_invite_tasks

    for account in accounts:
        for job in broadcast_jobs:
            if str(account.id) in job.account_ids:
                job.status = "cancelled"
        for job in invite_jobs:
            if str(account.id) in job.account_ids:
                job.status = "cancelled"
                task = _running_invite_tasks.get(str(job.id))
                if task:
                    task.cancel()

        sell_price = prices[account.id]
        account.for_sale = True
        account.is_sold = False
        account.sell_price = sell_price
        account.seller_id = user.id
        account.is_active = False
        account.auto_reply_enabled = False
        account.sale_listed_at = datetime.now(timezone.utc)

        await event_relay.detach(str(account.id))
        await client_pool.remove(str(account.id))
        db.add(
            AccountAuditLog(
                user_id=user.id,
                account_id=account.id,
                action="list_for_sale",
                price=sell_price,
                phone=account.phone,
                telegram_id=account.telegram_id,
            )
        )

    await db.flush()
    return len(accounts)


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

    Note: session_manager.attach_and_reconnect is intentionally NOT called
    inside this function to prevent network I/O from running within the active
    database transaction (which holds locks on User and TelegramAccount rows).
    The caller must trigger the reconnect after committing the transaction.
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

    # Identify the seller (who gets credited)
    seller_id = account.seller_id or account.user_id

    # Prevent self-purchasing: a seller cannot buy their own listed account
    if user.id == seller_id:
        raise ValueError("You cannot purchase your own listed account.")

    # Use the account's own sell_price; fallback to default
    buy_price = account.sell_price or 7000

    # Re-fetch buyer row with exclusive lock to prevent TOCTOU race condition.
    # The user object from get_current_user is loaded without FOR UPDATE,
    # so concurrent purchases could all see the same pre-deduction balance.
    locked_buyer_result = await db.execute(
        select(User).where(User.id == user.id).with_for_update()
    )
    user = locked_buyer_result.scalar_one()

    if user.balance < buy_price:
        raise ValueError("Insufficient balance to buy this account.")

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
    # Set purchased account to active upon purchase
    account.is_active = True

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


async def cancel_sell_account(db: AsyncSession, user: User, account_id: str) -> TelegramAccount:
    """Cancel listing a Telegram account for sale.

    Resets for_sale, is_active, sell_price, and seller_id.

    Note: session_manager.attach_and_reconnect is intentionally NOT called
    inside this function to prevent network I/O from running within the active
    database transaction. The caller must trigger the reconnect after
    committing the transaction.
    """
    try:
        acc_uuid = UUID(account_id)
    except ValueError:
        raise ValueError("Invalid account ID format.")

    # Select the account with a write lock
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
        raise ValueError("Account is not listed for sale or already sold.")

    if account.seller_id != user.id and account.user_id != user.id:
        raise ValueError("You do not own this account listing.")

    # Revert marketplace settings & make account active again
    account.for_sale = False
    account.is_active = True
    account.sell_price = None
    account.seller_id = None

    # Write audit log
    audit = AccountAuditLog(
        user_id=user.id,
        account_id=account.id,
        action="cancel_sale",
        phone=account.phone,
        telegram_id=account.telegram_id,
    )
    db.add(audit)

    await db.flush()

    return account
