"""Validation for SMM order targets.

An SMM target is a Telegram link, ``@username``, bare username, or numeric id.
Accepting arbitrary text let HTML/JS payloads into the database and onward to
the external SMM provider. This enforces the shape at the service boundary
(defence in depth: the UI already escapes on render, this keeps junk out).
"""

import re

MAX_TARGET_LENGTH = 500

# t.me / telegram.me links — any path: @name, +invite hash, /c/<id>/<post>, ?single…
_TME_LINK_RE = re.compile(r"^(?:https?://)?(?:t\.me|telegram\.me)/[A-Za-z0-9_+/=?.&-]+$")
# @username or bare username
_USERNAME_RE = re.compile(r"^@?[A-Za-z][A-Za-z0-9_]{2,63}$")
# numeric telegram id (optionally negative, e.g. -100123)
_NUMERIC_ID_RE = re.compile(r"^-?\d{1,20}$")

_FORBIDDEN_CHARS = frozenset(["<", ">", '"', "'", "`", "\\"])

_INVALID_MESSAGE = (
    "Format target tidak valid. Gunakan link https://t.me/..., @username, "
    "username, atau ID numerik."
)


def is_valid_telegram_target(value: str) -> bool:
    """Whether ``value`` is an acceptable SMM target (see validate_telegram_target)."""
    try:
        validate_telegram_target(value)
        return True
    except ValueError:
        return False


def validate_telegram_target(value: str) -> str:
    """Return the trimmed target, or raise ValueError with a user-facing message."""
    target = (value or "").strip()
    if not target:
        raise ValueError("Target wajib diisi.")
    if len(target) > MAX_TARGET_LENGTH:
        raise ValueError(
            f"Target terlalu panjang (maks {MAX_TARGET_LENGTH} karakter)."
        )
    if any(ch in _FORBIDDEN_CHARS for ch in target) or any(
        ord(ch) < 32 for ch in target
    ):
        raise ValueError(_INVALID_MESSAGE)
    if (
        _TME_LINK_RE.match(target)
        or _USERNAME_RE.match(target)
        or _NUMERIC_ID_RE.match(target)
    ):
        return target
    raise ValueError(_INVALID_MESSAGE)
