"""iOS device spoofing — makes Telethon clients appear as iPhone devices
to Telegram servers."""

import random

# ── iPhone models from iPhone 11 to iPhone 17 Pro Max ────────────────────
_IPHONE_MODELS = [
    # iPhone 11 series
    "iPhone 11",
    "iPhone 11 Pro",
    "iPhone 11 Pro Max",
    # iPhone 12 series
    "iPhone 12",
    "iPhone 12 mini",
    "iPhone 12 Pro",
    "iPhone 12 Pro Max",
    # iPhone 13 series
    "iPhone 13",
    "iPhone 13 mini",
    "iPhone 13 Pro",
    "iPhone 13 Pro Max",
    # iPhone 14 series
    "iPhone 14",
    "iPhone 14 Plus",
    "iPhone 14 Pro",
    "iPhone 14 Pro Max",
    # iPhone 15 series
    "iPhone 15",
    "iPhone 15 Plus",
    "iPhone 15 Pro",
    "iPhone 15 Pro Max",
    # iPhone 16 series
    "iPhone 16",
    "iPhone 16 Plus",
    "iPhone 16 Pro",
    "iPhone 16 Pro Max",
    # iPhone 17 series
    "iPhone 17",
    "iPhone 17 Plus",
    "iPhone 17 Pro",
    "iPhone 17 Pro Max",
]

# ── iOS versions (realistically paired to device generations) ─────────────
_IOS_VERSIONS = [
    "13.0", "13.1", "13.2", "13.3", "13.4", "13.5", "13.6", "13.7",
    "14.0", "14.1", "14.2", "14.3", "14.4", "14.5", "14.6", "14.7", "14.8",
    "15.0", "15.1", "15.2", "15.3", "15.4", "15.5", "15.6", "15.7",
    "16.0", "16.1", "16.2", "16.3", "16.4", "16.5", "16.6", "16.7",
    "17.0", "17.1", "17.2", "17.3", "17.4", "17.5", "17.6", "17.7",
    "18.0", "18.1", "18.2", "18.3", "18.4", "18.5", "18.6",
    "19.0",
]

# ── Telegram iOS app versions (real releases) ────────────────────────────
_APP_VERSIONS = [
    "10.0.0", "10.1.0", "10.2.0", "10.3.0", "10.4.0", "10.5.0",
    "10.6.0", "10.7.0", "10.8.0", "10.9.0", "10.10.0", "10.11.0",
    "10.12.0", "10.13.0", "10.14.0",
    "11.0.0", "11.1.0", "11.2.0", "11.3.0", "11.4.0", "11.5.0",
    "11.6.0", "11.7.0", "11.8.0", "11.9.0", "11.10.0", "11.11.0",
    "11.12.0", "11.13.0", "11.14.0", "11.15.0",
]


def get_locale_for_phone(phone: str | None) -> tuple[str, str]:
    """Determine (lang_code, system_lang_code) based on phone number prefix.
    Defaults to ('en', 'en-US').
    """
    if not phone:
        return "en", "en"
    
    # Strip non-digits
    digits = "".join(c for c in phone if c.isdigit())
    
    # Common marketing phone prefixes mapping
    if digits.startswith("62"): # Indonesia
        return "id", "id-ID"
    elif digits.startswith("7"): # Russia / Kazakhstan
        return "ru", "ru-RU"
    elif digits.startswith("60"): # Malaysia
        return "ms", "ms-MY"
    elif digits.startswith("380"): # Ukraine
        return "uk", "uk-UA"
    elif digits.startswith("98"): # Iran
        return "fa", "fa-IR"
    elif digits.startswith("91"): # India
        return "hi", "hi-IN"
    elif digits.startswith("55"): # Brazil
        return "pt", "pt-BR"
    elif digits.startswith("86"): # China
        return "zh", "zh-CN"
    elif digits.startswith("84"): # Vietnam
        return "vi", "vi-VN"
    elif digits.startswith("63"): # Philippines
        return "tl", "tl-PH"
    elif digits.startswith("33"): # France
        return "fr", "fr-FR"
    elif digits.startswith("49"): # Germany
        return "de", "de-DE"
    elif digits.startswith("39"): # Italy
        return "it", "it-IT"
    elif digits.startswith("34"): # Spain
        return "es", "es-ES"
    
    return "en", "en"


def random_ios_device(phone: str | None = None) -> dict:
    """Return random iOS device parameters for Telethon TelegramClient.

    Returns a dict suitable for splatting into ``TelegramClient(**params)``::

        client = TelegramClient(
            session,
            api_id=...,
            api_hash=...,
            **random_ios_device(),
        )
    """
    lang, sys_lang = get_locale_for_phone(phone)
    return {
        "device_model": random.choice(_IPHONE_MODELS),
        "app_version": random.choice(_APP_VERSIONS),
        "system_version": random.choice(_IOS_VERSIONS),
        "lang_code": lang,
        "system_lang_code": sys_lang,
    }


def deterministic_ios_device(seed: str, phone: str | None = None) -> dict:
    """Return an iOS device dict seeded from an account identifier.

    Same account always gets the same device fingerprint, making it look
    like a stable iPhone login rather than a new device every reconnect.
    """
    rng = random.Random(seed)
    lang, sys_lang = get_locale_for_phone(phone)
    return {
        "device_model": rng.choice(_IPHONE_MODELS),
        "app_version": rng.choice(_APP_VERSIONS),
        "system_version": rng.choice(_IOS_VERSIONS),
        "lang_code": lang,
        "system_lang_code": sys_lang,
    }
