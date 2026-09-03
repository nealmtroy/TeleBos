"""Centralized phone number normalization, country resolution, and locale mapping."""

import re

COUNTRY_PREFIXES: dict[str, str] = {
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
    "+55": "Brazil",
}

# Prefix without '+' to (lang_code, system_lang_code)
LOCALE_PREFIXES: dict[str, tuple[str, str]] = {
    "62": ("id", "id-ID"),
    "7": ("ru", "ru-RU"),
    "60": ("ms", "ms-MY"),
    "380": ("uk", "uk-UA"),
    "98": ("fa", "fa-IR"),
    "91": ("hi", "hi-IN"),
    "55": ("pt", "pt-BR"),
    "86": ("zh", "zh-CN"),
    "84": ("vi", "vi-VN"),
    "63": ("tl", "tl-PH"),
    "33": ("fr", "fr-FR"),
    "49": ("de", "de-DE"),
    "39": ("it", "it-IT"),
    "34": ("es", "es-ES"),
    "81": ("ja", "ja-JP"),
    "82": ("ko", "ko-KR"),
    "66": ("th", "th-TH"),
    "65": ("en", "en-SG"),
    "90": ("tr", "tr-TR"),
}


def clean_phone_number(phone: str) -> str:
    """Strip spaces, dashes and non-digit/plus characters."""
    cleaned = "".join(c for c in phone if c.isdigit() or c == "+")
    if not cleaned.startswith("+"):
        cleaned = "+" + cleaned
    return cleaned


def get_country_from_phone(phone: str) -> str:
    """Resolve human-readable country name from phone number prefix."""
    if not phone:
        return "Unknown"

    cleaned = clean_phone_number(phone)

    # Try 4-character prefix (e.g. +380), then 3-character (e.g. +62), then 2-character (e.g. +1)
    for length in (4, 3, 2):
        prefix = cleaned[:length]
        if prefix in COUNTRY_PREFIXES:
            return COUNTRY_PREFIXES[prefix]

    return "Unknown"


def get_locale_from_phone(phone: str | None) -> tuple[str, str]:
    """Map phone number prefix to (lang_code, system_lang_code) for Telethon device spoofing."""
    if not phone:
        return "en", "en"

    digits = re.sub(r"\D", "", phone)
    # Check prefixes from longest (3 digits) to shortest (1 digit)
    for length in (3, 2, 1):
        prefix = digits[:length]
        if prefix in LOCALE_PREFIXES:
            return LOCALE_PREFIXES[prefix]

    return "en", "en"
