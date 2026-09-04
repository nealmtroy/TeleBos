"""Service for managing telegram_id prefix-based pricing (owner only)."""

import logging
import time
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.telegram_account import TelegramAccount
from app.models.user_account_price import TelegramIdPrefixPrice
from app.models.smm_setting import SmmSetting

logger = logging.getLogger(__name__)

_price_cache: dict = {
    "entries": None,  # list of (id_prefix, sell_price) sorted by len desc
    "fallback_price": None,
    "timestamp": 0.0,
}
_CACHE_TTL = 300.0  # 5 minutes


def invalidate_price_cache() -> None:
    """Invalidate in-memory price rules cache."""
    _price_cache["entries"] = None
    _price_cache["fallback_price"] = None
    _price_cache["timestamp"] = 0.0


async def _get_cached_rules(db: AsyncSession) -> tuple[list[tuple[str, int]], int]:
    """Retrieve prefix price rules and fallback price with in-memory caching."""
    now = time.time()
    if (
        _price_cache["entries"] is not None
        and _price_cache["fallback_price"] is not None
        and (now - _price_cache["timestamp"]) < _CACHE_TTL
    ):
        return _price_cache["entries"], _price_cache["fallback_price"]

    # 1. Fetch prefix prices
    raw_entries = prefix_result.scalars().all() if hasattr(prefix_result, "scalars") else []
    # ALG-01: Sort by length descending so longest prefix match early exits immediately
    sorted_entries = sorted(
        [(getattr(e, "id_prefix", ""), getattr(e, "sell_price", 0)) for e in raw_entries if hasattr(e, "id_prefix")],
        key=lambda x: len(x[0]),
        reverse=True,
    )

    # 2. Fetch fallback sell price
    setting_result = await db.execute(
        select(SmmSetting).where(SmmSetting.key == "account_sell_price")
    )
    setting = setting_result.scalar_one_or_none() if hasattr(setting_result, "scalar_one_or_none") else None
    fallback_price = int(setting.value) if setting and hasattr(setting, "value") and setting.value else 5500

    _price_cache["entries"] = sorted_entries
    _price_cache["fallback_price"] = fallback_price
    _price_cache["timestamp"] = now

    return sorted_entries, fallback_price


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
    invalidate_price_cache()
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
        invalidate_price_cache()


async def get_price_for_telegram_id(db: AsyncSession, telegram_id: int) -> int:
    """Get the sell price for a telegram_id by matching LONGEST prefix.

    E.g. if entries exist for "7" (3000) and "77" (5000), then
    telegram_id 7780645374 matches "77" (5000), not "7" (3000).
    """
    sorted_entries, fallback_price = await _get_cached_rules(db)
    tid_str = str(telegram_id)

    # Longest prefix matches first because entries are sorted by len descending
    for id_prefix, sell_price in sorted_entries:
        if tid_str.startswith(id_prefix):
            return sell_price

    return fallback_price


async def resolve_telegram_id_price(db: AsyncSession, account: TelegramAccount) -> int:
    """Resolve price for a TelegramAccount using its telegram_id."""
    if account.telegram_id:
        return await get_price_for_telegram_id(db, account.telegram_id)
    _, fallback_price = await _get_cached_rules(db)
    return fallback_price


async def resolve_prices_for_accounts(db: AsyncSession, accounts: list[TelegramAccount]) -> None:
    """Resolve and inject sell_price dynamically on a list of accounts using prefix-based rules."""
    if not accounts:
        return

    sorted_entries, fallback_price = await _get_cached_rules(db)

    # Resolve price in-memory for each account using cached sorted prefix rules
    for account in accounts:
        if account.for_sale or account.is_sold:
            if account.sell_price is not None:
                continue

        if not account.telegram_id:
            account.sell_price = fallback_price
            continue

        tid_str = str(account.telegram_id)
        matched_price = None
        for id_prefix, sell_price in sorted_entries:
            if tid_str.startswith(id_prefix):
                matched_price = sell_price
                break

        account.sell_price = matched_price if matched_price is not None else fallback_price


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
