"""Profile photo storage utilities — centralized directory paths and helpers.

The database column ``telegram_accounts.profile_photo_path`` stores only the
*filename* (``"<account_id>.jpg"``), never an absolute OS path. An absolute
path recorded on a developer machine or inside one container goes stale as
soon as the app moves to a Linux VPS or a rebuilt image, so the real location
is always recomputed from ``_PHOTO_DIR`` at read time.
"""

import os
from app.utils.path_security import safe_join, validate_safe_id

_PHOTO_DIR = os.path.join(
    os.path.dirname(os.path.dirname(__file__)), "uploads", "profile_photos"
)


def ensure_photo_dir() -> None:
    """Ensure the profile photos directory exists."""
    os.makedirs(_PHOTO_DIR, exist_ok=True)


def get_photo_filename(account_id: str) -> str:
    """Return the portable, relative filename that the database stores."""
    clean_id = validate_safe_id(str(account_id))
    return f"{clean_id}.jpg"


def get_photo_path(account_id: str) -> str:
    """Get the local file path for an account's cached profile photo.
    
    Guarantees strict containment within _PHOTO_DIR.
    """
    filename = get_photo_filename(account_id)
    return safe_join(_PHOTO_DIR, filename)


def is_valid_photo_path(account_id: str, stored_path: str | None) -> bool:
    """Whether ``stored_path`` names this account's cached photo and it exists.

    Accepts a bare filename (the current format) and also tolerates a legacy
    absolute path ending in the same filename, so rows written before this
    change keep validating instead of being discarded on the next read.
    """
    if not stored_path:
        return False
    try:
        expected = get_photo_filename(account_id)
    except ValueError:
        return False
    if os.path.basename(stored_path.replace("\\", "/")) != expected:
        return False
    try:
        photo_path = get_photo_path(account_id)
        return os.path.exists(photo_path)
    except ValueError:
        return False

