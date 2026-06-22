"""Service for managing per-user account sell prices (owner only)."""

import logging
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.user_account_price import UserAccountPrice

logger = logging.getLogger(__name__)


async def get_all_user_prices(db: AsyncSession) -> list[dict]:
    """Get sell prices for all users. Shows users without explicit price too
    (returns global default as their price)."""
    # All users
    users_result = await db.execute(
        select(User).where(User.role != "owner").order_by(User.full_name)
    )
    users = users_result.scalars().all()

    # Explicit prices
    prices_result = await db.execute(select(UserAccountPrice))
    prices = prices_result.scalars().all()
    price_map = {str(p.user_id): p.sell_price for p in prices}

    # Get global default
    from app.models.smm_setting import SmmSetting
    setting_result = await db.execute(
        select(SmmSetting).where(SmmSetting.key == "account_sell_price")
    )
    setting = setting_result.scalar_one_or_none()
    default_price = int(setting.value) if setting and setting.value else 5500

    result = []
    for user in users:
        sell_price = price_map.get(str(user.id), default_price)
        result.append({
            "user_id": user.id,
            "user_email": user.email,
            "user_full_name": user.full_name,
            "sell_price": sell_price,
        })

    return sorted(result, key=lambda r: r.get("user_full_name") or r["user_email"])


async def upsert_user_price(db: AsyncSession, user_id: UUID, sell_price: int):
    """Create or update a user's sell price."""
    result = await db.execute(
        select(UserAccountPrice).where(UserAccountPrice.user_id == user_id)
    )
    user_price = result.scalar_one_or_none()

    if user_price:
        user_price.sell_price = sell_price
    else:
        user_price = UserAccountPrice(user_id=user_id, sell_price=sell_price)
        db.add(user_price)

    await db.flush()
    return user_price


async def bulk_upsert_prices(db: AsyncSession, prices: list[dict]):
    """Bulk create or update sell prices."""
    for item in prices:
        await upsert_user_price(db, item["user_id"], item["sell_price"])
    await db.flush()


async def get_user_sell_price(db: AsyncSession, user_id: UUID) -> int:
    """Get the effective sell price for a specific user."""
    result = await db.execute(
        select(UserAccountPrice).where(UserAccountPrice.user_id == user_id)
    )
    user_price = result.scalar_one_or_none()
    if user_price:
        return user_price.sell_price

    # Fallback to global default
    from app.models.smm_setting import SmmSetting
    setting_result = await db.execute(
        select(SmmSetting).where(SmmSetting.key == "account_sell_price")
    )
    setting = setting_result.scalar_one_or_none()
    return int(setting.value) if setting and setting.value else 5500
