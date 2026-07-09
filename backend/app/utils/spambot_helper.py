"""Utility helper for parsing and verifying SpamBot responses and keywords."""

import json
import os
import logging

logger = logging.getLogger(__name__)

# Load keywords configuration once at import time
_KEYWORDS = {}
try:
    _CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
    _JSON_PATH = os.path.join(_CURRENT_DIR, "spambot_keywords.json")
    with open(_JSON_PATH, "r", encoding="utf-8") as f:
        _KEYWORDS = json.load(f)
except Exception as e:
    logger.error("Failed to load spambot_keywords.json: %s", e)
    # Fallback to hardcoded keywords if file loading fails
    _KEYWORDS = {
        "clean": [
            "good news", "no limits", "free as a bird",
            "kabar baik", "tidak ada batasan", "bebas terbang",
            "berita baik", "tiada had", "bebas sebebas burung", "burung di angkasa"
        ],
        "temporary_limit": [
            "until", "released on", "automatically released",
            "sampai", "dibebaskan pada", "otomatis dibebaskan",
            "sehingga", "automatik dibebaskan", "dilepaskan pada"
        ],
        "appeal_submitted": [
            "your appeal has been submitted", "appeal has been submitted",
            "banding anda telah dikirim", "pengajuan banding",
            "restriction review submitted", "already submitted",
            "banding sebelumnya", "previously submitted",
            "kamu sudah pernah", "already appealed",
            "we have received your appeal", "permohonan banding",
            "we will review", "akan ditinjau", "sedang diproses", "help us understand"
        ],
        "appeal_flow_active": [
            "do you admit", "apakah kamu mengakui", "apa yang terjadi",
            "tell us more", "jelaskan lebih", "is your account useful",
            "apakah akun anda bermanfaat", "why did this happen",
            "mengapa ini terjadi", "kirimkan ke moderators", "send to moderators"
        ]
    }


def get_spambot_keywords(category: str) -> list[str]:
    """Retrieve keywords for a specific category."""
    return _KEYWORDS.get(category, [])


def is_clean_status(text: str) -> bool:
    """Check if the response text indicates that the account is normal / free from limits."""
    if not text:
        return False
    text_lower = text.lower()
    return any(kw in text_lower for kw in get_spambot_keywords("clean"))


def is_temporary_limit(text: str) -> bool:
    """Check if the response text indicates a temporary limit (contains automatic release date)."""
    if not text:
        return False
    text_lower = text.lower()
    return any(kw in text_lower for kw in get_spambot_keywords("temporary_limit"))


def is_appeal_submitted(text: str) -> bool:
    """Check if the response text indicates an appeal has been submitted previously."""
    if not text:
        return False
    text_lower = text.lower()
    return any(kw in text_lower for kw in get_spambot_keywords("appeal_submitted"))


def is_appeal_flow_active(text: str) -> bool:
    """Check if the response text indicates that the conversation is currently in the middle of an appeal flow."""
    if not text:
        return False
    text_lower = text.lower()
    return any(kw in text_lower for kw in get_spambot_keywords("appeal_flow_active"))


def has_recent_appeal_keywords(text: str) -> bool:
    """Check if the text contains any keywords related to submitted or in-progress appeals."""
    if not text:
        return False
    text_lower = text.lower()
    for kw in get_spambot_keywords("appeal_submitted") + get_spambot_keywords("appeal_flow_active"):
        if kw in text_lower:
            return True
    return False
