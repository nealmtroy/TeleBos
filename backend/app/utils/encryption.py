"""Fernet-based encryption for sensitive data (session strings, 2FA passwords).

If ENCRYPTION_KEY is provided and valid, it is used.
Otherwise a new key is auto-generated on first use.
"""

import logging
from cryptography.fernet import Fernet
from app.config import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()

_cipher: Fernet | None = None


def _get_cipher() -> Fernet:
    global _cipher
    if _cipher is not None:
        return _cipher
    try:
        key = settings.ENCRYPTION_KEY.encode()
        _cipher = Fernet(key)
    except (ValueError, Exception) as exc:
        logger.critical("ENCRYPTION_KEY is invalid, missing or corrupt. Application cannot start: %s", exc)
        raise RuntimeError("ENCRYPTION_KEY is invalid or not set. Start aborted to prevent data corruption.") from exc
    return _cipher



def encrypt(plaintext: str) -> str:
    """Encrypt a string and return a base64-encoded ciphertext."""
    if not plaintext:
        return ""
    return _get_cipher().encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str) -> str:
    """Decrypt a base64-encoded ciphertext back to the original string."""
    if not ciphertext:
        return ""
    try:
        return _get_cipher().decrypt(ciphertext.encode()).decode()
    except Exception as exc:
        logger.error("Decryption failed (possibly invalid ENCRYPTION_KEY): %s", exc)
        return ""


def get_current_key() -> str:
    """Return the currently active Fernet key (for debugging / export)."""
    return _get_cipher()._signing_key  # noqa
