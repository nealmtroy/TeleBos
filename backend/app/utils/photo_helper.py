"""Profile photo storage utilities — centralized directory paths and helpers."""

import os

_PHOTO_DIR = os.path.join(
    os.path.dirname(os.path.dirname(__file__)), "uploads", "profile_photos"
)


def ensure_photo_dir() -> None:
    """Ensure the profile photos directory exists."""
    os.makedirs(_PHOTO_DIR, exist_ok=True)


def get_photo_path(account_id: str) -> str:
    """Get the local file path for an account's cached profile photo."""
    return os.path.join(_PHOTO_DIR, f"{account_id}.jpg")
