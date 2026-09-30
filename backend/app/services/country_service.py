"""Service for retrieving Telegram country codes and dialing formats via Telethon."""

import asyncio
import json
import logging
import os
from typing import Any

from telethon import TelegramClient
from telethon.sessions import StringSession
from telethon.tl.functions.help import GetCountriesListRequest

from app.config import get_settings
from app.utils.redis import redis_client
from app.utils.telethon_cleanup import force_close_telethon_client

logger = logging.getLogger(__name__)
settings = get_settings()

_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
_FALLBACK_FILE = os.path.join(_DATA_DIR, "telegram_countries.json")

_MEMORY_CACHE: dict[str, list[dict[str, Any]]] = {}
REDIS_CACHE_TTL = 86400  # 24 hours


def _iso2_to_flag(iso2: str) -> str:
    """Convert an ISO-3166-1 alpha-2 code into its emoji flag representation."""
    if len(iso2) == 2:
        return "".join(chr(127397 + ord(c)) for c in iso2.upper())
    return "🌐"


def load_fallback_countries() -> list[dict[str, Any]]:
    """Load pre-generated country list from local JSON file."""
    if os.path.exists(_FALLBACK_FILE):
        try:
            with open(_FALLBACK_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.error("Failed to read fallback countries file: %s", e)
    return []


async def fetch_countries_from_telegram(lang_code: str = "en") -> list[dict[str, Any]]:
    """Fetch live country list from Telegram MTProto using an unauthenticated client."""
    if not settings.TELEGRAM_API_ID or not settings.TELEGRAM_API_HASH:
        logger.warning("Telegram API ID or Hash not set. Returning fallback countries.")
        return load_fallback_countries()

    client = TelegramClient(
        StringSession(),
        settings.TELEGRAM_API_ID,
        settings.TELEGRAM_API_HASH,
        flood_sleep_threshold=0,
    )
    try:
        await asyncio.wait_for(client.connect(), timeout=10.0)
        res = await asyncio.wait_for(
            client(GetCountriesListRequest(lang_code=lang_code, hash=0)),
            timeout=10.0,
        )
        countries: list[dict[str, Any]] = []
        for c in getattr(res, "countries", []):
            if getattr(c, "hidden", False):
                continue
            iso2 = (c.iso2 or "").upper()
            name = c.default_name or getattr(c, "name", None) or iso2
            flag = _iso2_to_flag(iso2)
            for cc in getattr(c, "country_codes", []):
                countries.append({
                    "iso2": iso2,
                    "name": name,
                    "code": cc.country_code,
                    "flag": flag,
                    "prefixes": cc.prefixes or [],
                    "patterns": cc.patterns or [],
                })

        countries.sort(key=lambda x: (x["name"].lower(), x["code"]))
        return countries
    except Exception as exc:
        logger.warning("Failed to fetch country list from Telegram: %s", exc)
        return load_fallback_countries()
    finally:
        try:
            await client.disconnect()
        except Exception:
            pass
        # disconnect() is a no-op for a client that never connected, leaving
        # its recv/send loop tasks pending (see force_close_telethon_client).
        force_close_telethon_client(client)


async def get_countries(lang_code: str = "en") -> list[dict[str, Any]]:
    """Get list of supported countries with calling codes, cached in memory & Redis."""
    # 1. Check in-memory cache
    if lang_code in _MEMORY_CACHE and _MEMORY_CACHE[lang_code]:
        return _MEMORY_CACHE[lang_code]

    # 2. Check Redis cache
    redis_key = f"telegram:countries:{lang_code}"
    try:
        cached = await redis_client.get(redis_key)
        if cached:
            parsed = json.loads(cached)
            _MEMORY_CACHE[lang_code] = parsed
            return parsed
    except Exception as e:
        logger.debug("Redis cache miss for countries: %s", e)

    # 3. Fetch from Telegram (with fallback)
    countries = await fetch_countries_from_telegram(lang_code)
    if not countries:
        countries = load_fallback_countries()

    # 4. Save to cache
    if countries:
        _MEMORY_CACHE[lang_code] = countries
        try:
            await redis_client.setex(redis_key, REDIS_CACHE_TTL, json.dumps(countries, ensure_ascii=False))
        except Exception as e:
            logger.debug("Failed to set Redis cache for countries: %s", e)

    return countries
