"""Service for managing telegram_id prefix-based pricing (owner only)."""

import logging
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.telegram_account import TelegramAccount
from app.models.user_account_price import TelegramIdPrefixPrice
from app.models.smm_setting import SmmSetting

logger = logging.getLogger(__name__)


async def get_all_prefix_prices(db: AsyncSession) -> list[dict]:
    """Get all configured prefix prices."""
    result = await db.execute(
        select(TelegramIdPrefixPrice).order_by(TelegramIdPrefixPrice.id_prefix)
    )
    return [
        {
            "id": str(p.id),
            "id_prefix": p.id_prefix,
            "sell_price": p.sell_price,
            "note": p.note,
        }
        for p in result.scalars().all()
    ]


async def upsert_prefix_price(db: AsyncSession, id_prefix: str, sell_price: int, note: str | None = None):
    """Create or update a prefix price."""
    result = await db.execute(
        select(TelegramIdPrefixPrice).where(TelegramIdPrefixPrice.id_prefix == id_prefix)
    )
    entry = result.scalar_one_or_none()

    if entry:
        entry.sell_price = sell_price
        if note is not None:
            entry.note = note
    else:
        entry = TelegramIdPrefixPrice(
            id_prefix=id_prefix,
            sell_price=sell_price,
            note=note,
        )
        db.add(entry)

    await db.flush()
    return {
        "id": str(entry.id),
        "id_prefix": entry.id_prefix,
        "sell_price": entry.sell_price,
        "note": entry.note,
    }


async def delete_prefix_price(db: AsyncSession, id_prefix: str):
    """Delete a prefix price entry."""
    result = await db.execute(
        select(TelegramIdPrefixPrice).where(TelegramIdPrefixPrice.id_prefix == id_prefix)
    )
    entry = result.scalar_one_or_none()
    if entry:
        await db.delete(entry)
        await db.flush()


async def get_price_for_telegram_id(db: AsyncSession, telegram_id: int) -> int:
    """Get the sell price for a telegram_id by matching LONGEST prefix.

    E.g. if entries exist for "7" (3000) and "77" (5000), then
    telegram_id 7780645374 matches "77" (5000), not "7" (3000).
    """
    tid_str = str(telegram_id)

    result = await db.execute(
        select(TelegramIdPrefixPrice)
    )
    entries = result.scalars().all()

    # Find the longest matching prefix
    best_price = None
    best_len = 0

    for entry in entries:
        if tid_str.startswith(entry.id_prefix) and len(entry.id_prefix) > best_len:
            best_price = entry.sell_price
            best_len = len(entry.id_prefix)

    if best_price is not None:
        return best_price

    # Fallback to global default
    setting_result = await db.execute(
        select(SmmSetting).where(SmmSetting.key == "account_sell_price")
    )
    setting = setting_result.scalar_one_or_none()
    return int(setting.value) if setting and setting.value else 5500


async def resolve_telegram_id_price(db: AsyncSession, account: TelegramAccount) -> int:
    """Resolve price for a TelegramAccount using its telegram_id."""
    if account.telegram_id:
        return await get_price_for_telegram_id(db, account.telegram_id)
    # No telegram_id? Use global default
    setting_result = await db.execute(
        select(SmmSetting).where(SmmSetting.key == "account_sell_price")
    )
    setting = setting_result.scalar_one_or_none()
    return int(setting.value) if setting and setting.value else 5500


async def get_available_prefixes(db: AsyncSession) -> list[str]:
    """Get list of unique first-digit prefixes from all active accounts that have telegram_id."""
    result = await db.execute(
        select(TelegramAccount.telegram_id).where(
            TelegramAccount.telegram_id.isnot(None),
            TelegramAccount.for_sale == False,
            TelegramAccount.is_sold == False,
        )
    )
    ids = result.scalars().all()
    prefixes = set()
    for tid in ids:
        if tid:
            prefixes.add(str(tid)[0])
    return sorted(prefixes)
