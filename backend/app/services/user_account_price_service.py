"""Service for managing telegram_id prefix-based pricing (owner only).

Each prefix rule carries two prices:

- ``sell_price`` — what the seller receives when their account is listed.
- ``buy_price``  — what a buyer pays to purchase a listed account.

The difference is the platform margin. Both sides resolve through the same
longest-prefix match, so a listing and its eventual purchase always agree on
the pair that was configured for that account's telegram_id.
"""

import logging
import time

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.telegram_account import TelegramAccount
from app.models.user_account_price import TelegramIdPrefixPrice
from app.models.smm_setting import SmmSetting

logger = logging.getLogger(__name__)

# Global fallbacks, mirrored by the SmmSetting keys of the same name.
DEFAULT_SELL_PRICE = 5500
DEFAULT_BUY_PRICE = 7000

_price_cache: dict = {
    "entries": None,  # list of (id_prefix, sell_price, buy_price) sorted by len desc
    "fallback_sell": None,
    "fallback_buy": None,
    "timestamp": 0.0,
}
_CACHE_TTL = 300.0  # 5 minutes


def invalidate_price_cache() -> None:
    """Invalidate in-memory price rules cache."""
    _price_cache["entries"] = None
    _price_cache["fallback_sell"] = None
    _price_cache["fallback_buy"] = None
    _price_cache["timestamp"] = 0.0


async def _read_int_setting(db: AsyncSession, key: str, default: int) -> int:
    """Read one integer SmmSetting, falling back to ``default`` on absence."""
    result = await db.execute(select(SmmSetting).where(SmmSetting.key == key))
    setting = result.scalar_one_or_none()
    if setting is None or not setting.value:
        return default
    try:
        return int(setting.value)
    except (TypeError, ValueError):
        logger.warning("Setting %s has a non-integer value %r; using %s", key, setting.value, default)
        return default


async def _get_cached_rules(
    db: AsyncSession,
) -> tuple[list[tuple[str, int, int | None]], int, int]:
    """Retrieve prefix price rules and both fallbacks with in-memory caching."""
    now = time.time()
    if (
        _price_cache["entries"] is not None
        and _price_cache["fallback_sell"] is not None
        and _price_cache["fallback_buy"] is not None
        and (now - _price_cache["timestamp"]) < _CACHE_TTL
    ):
        return _price_cache["entries"], _price_cache["fallback_sell"], _price_cache["fallback_buy"]

    # 1. Fetch prefix prices
    prefix_result = await db.execute(select(TelegramIdPrefixPrice))
    raw_entries = prefix_result.scalars().all() if hasattr(prefix_result, "scalars") else []
    # ALG-01: Sort by length descending so longest prefix match early exits immediately
    sorted_entries = sorted(
        [
            (e.id_prefix, e.sell_price, e.buy_price)
            for e in raw_entries
            if hasattr(e, "id_prefix")
        ],
        key=lambda x: len(x[0]),
        reverse=True,
    )

    # 2. Fetch global fallbacks for both sides of the trade
    fallback_sell = await _read_int_setting(db, "account_sell_price", DEFAULT_SELL_PRICE)
    fallback_buy = await _read_int_setting(db, "account_buy_price", DEFAULT_BUY_PRICE)

    _price_cache["entries"] = sorted_entries
    _price_cache["fallback_sell"] = fallback_sell
    _price_cache["fallback_buy"] = fallback_buy
    _price_cache["timestamp"] = now

    return sorted_entries, fallback_sell, fallback_buy


def _match_prefix(
    sorted_entries: list[tuple[str, int, int | None]], telegram_id: int
) -> tuple[int, int | None] | None:
    """Return ``(sell_price, buy_price)`` for the longest matching prefix, or None."""
    tid_str = str(telegram_id)
    for id_prefix, sell_price, buy_price in sorted_entries:
        if tid_str.startswith(id_prefix):
            return sell_price, buy_price
    return None


def _effective_buy_price(sell_price: int, buy_price: int | None, fallback_buy: int) -> int:
    """Resolve the buyer's price, never letting the platform sell at a loss.

    A prefix may omit ``buy_price``; in that case the global buy price applies,
    but it is still floored at the sell price so TeleBos never takes a negative
    margin on a listing it created.
    """
    candidate = fallback_buy if buy_price is None else buy_price
    return max(candidate, sell_price)


async def effective_margin(
    db: AsyncSession, sell_price: int, buy_price: int | None
) -> int:
    """Return the platform margin a single rule yields after global fallbacks apply."""
    _, _, fallback_buy = await _get_cached_rules(db)
    return _effective_buy_price(sell_price, buy_price, fallback_buy) - sell_price


async def get_all_prefix_prices(db: AsyncSession) -> list[dict]:
    """Get all configured prefix prices, including the derived margin."""
    result = await db.execute(
        select(TelegramIdPrefixPrice).order_by(TelegramIdPrefixPrice.id_prefix)
    )
    _, fallback_sell, fallback_buy = await _get_cached_rules(db)
    return [
        {
            "id": str(p.id),
            "id_prefix": p.id_prefix,
            "sell_price": p.sell_price,
            "buy_price": p.buy_price,
            "margin": (
                _effective_buy_price(p.sell_price, p.buy_price, fallback_buy) - p.sell_price
            ),
            "note": p.note,
        }
        for p in result.scalars().all()
    ]


async def upsert_prefix_price(
    db: AsyncSession,
    id_prefix: str,
    sell_price: int,
    note: str | None = None,
    buy_price: int | None = None,
) -> dict:
    """Create or update a prefix price rule with both sides of the trade."""
    if buy_price is not None and buy_price < sell_price:
        raise ValueError(
            "Buy price must be greater than or equal to sell price "
            f"(got buy {buy_price} < sell {sell_price})."
        )

    result = await db.execute(
        select(TelegramIdPrefixPrice).where(TelegramIdPrefixPrice.id_prefix == id_prefix)
    )
    entry = result.scalar_one_or_none()

    if entry:
        entry.sell_price = sell_price
        entry.buy_price = buy_price
        if note is not None:
            entry.note = note
    else:
        entry = TelegramIdPrefixPrice(
            id_prefix=id_prefix,
            sell_price=sell_price,
            buy_price=buy_price,
            note=note,
        )
        db.add(entry)

    await db.flush()
    invalidate_price_cache()
    return {
        "id": str(entry.id),
        "id_prefix": entry.id_prefix,
        "sell_price": entry.sell_price,
        "buy_price": entry.buy_price,
        "note": entry.note,
    }


async def delete_prefix_price(db: AsyncSession, id_prefix: str) -> None:
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
    sorted_entries, fallback_sell, _ = await _get_cached_rules(db)
    match = _match_prefix(sorted_entries, telegram_id)
    if match is not None:
        return match[0]
    return fallback_sell


async def get_prices_for_telegram_id(db: AsyncSession, telegram_id: int) -> tuple[int, int]:
    """Resolve both the sell and buy price for a telegram_id via longest-prefix match."""
    sorted_entries, fallback_sell, fallback_buy = await _get_cached_rules(db)
    match = _match_prefix(sorted_entries, telegram_id)
    if match is None:
        return fallback_sell, max(fallback_buy, fallback_sell)
    sell_price, buy_price = match
    return sell_price, _effective_buy_price(sell_price, buy_price, fallback_buy)


async def resolve_telegram_id_price(db: AsyncSession, account: TelegramAccount) -> int:
    """Resolve the sell price for a TelegramAccount using its telegram_id."""
    if account.telegram_id:
        return await get_price_for_telegram_id(db, account.telegram_id)
    _, fallback_sell, _ = await _get_cached_rules(db)
    return fallback_sell


async def resolve_buy_price_for_telegram_id(db: AsyncSession, account: TelegramAccount) -> int:
    """Resolve the price a buyer pays for a TelegramAccount using its telegram_id."""
    if account.telegram_id:
        return (await get_prices_for_telegram_id(db, account.telegram_id))[1]
    _, fallback_sell, fallback_buy = await _get_cached_rules(db)
    return max(fallback_buy, fallback_sell)


async def resolve_prices_for_accounts(db: AsyncSession, accounts: list[TelegramAccount]) -> None:
    """Inject both sell_price and buy_price on a list of accounts using prefix rules.

    ``buy_price`` is attached as a transient attribute for display; it is not
    persisted on the account row, so a later price change does not silently
    reprice an already-listed account.
    """
    if not accounts:
        return

    sorted_entries, fallback_sell, fallback_buy = await _get_cached_rules(db)

    for account in accounts:
        match = (
            _match_prefix(sorted_entries, account.telegram_id)
            if account.telegram_id
            else None
        )

        if account.for_sale and account.sell_price is not None:
            # Already listed: keep the sell price the seller agreed to, and
            # price the buy side off that same stored figure.
            sell_price, configured_buy = match if match else (None, None)
            account.buy_price = _effective_buy_price(
                account.sell_price, configured_buy, fallback_buy
            )
            continue

        if match is None:
            account.sell_price = fallback_sell
            account.buy_price = max(fallback_buy, fallback_sell)
        else:
            sell_price, buy_price = match
            account.sell_price = sell_price
            account.buy_price = _effective_buy_price(sell_price, buy_price, fallback_buy)


async def get_available_prefixes(db: AsyncSession) -> list[str]:
    """Get list of unique first-digit prefixes from all active accounts that have telegram_id."""
    result = await db.execute(
        select(TelegramAccount.telegram_id).where(
            TelegramAccount.telegram_id.isnot(None),
            TelegramAccount.for_sale == False,
        )
    )
    ids = result.scalars().all()
    prefixes = set()
    for tid in ids:
        if tid:
            prefixes.add(str(tid)[0])
    return sorted(prefixes)
