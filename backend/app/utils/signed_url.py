"""Short-lived signed token generation for photo URLs.

Replaces passing full JWTs as query parameters (which leak into logs, history,
and Referer headers) with a lightweight HMAC token specific to the resource.

Token format: ``<user_id>:<expiry_timestamp>:<hmac_sig>``

Where *hmac_sig* = HMAC-SHA256(key=JWT_SECRET_KEY, msg=``account_id:user_id:expiry``).
The token is scoped to a single (account_id, user_id) pair and expires after a
configurable TTL (default 5 minutes).
"""

import hmac
import hashlib
import time
import logging

from app.config import get_settings

logger = logging.getLogger(__name__)

TOKEN_TTL = 300  # 5 minutes


def generate_photo_token(account_id: str, user_id: str, expires_in: int = TOKEN_TTL) -> str:
    """Generate a short-lived HMAC token scoped to (account_id, user_id)."""
    settings = get_settings()
    expiry = int(time.time()) + expires_in
    message = f"{account_id}:{user_id}:{expiry}"
    sig = hmac.new(
        settings.JWT_SECRET_KEY.encode(),
        message.encode(),
        hashlib.sha256,
    ).hexdigest()[:16]
    return f"{user_id}:{expiry}:{sig}"


def parse_photo_token(token: str, account_id: str) -> str | None:
    """Verify and parse a photo token, returning the *user_id* if valid.

    Returns *None* when the token is invalid, expired, or does not match
    the given *account_id*.
    """
    try:
        parts = token.split(":")
        if len(parts) != 3:
            return None
        user_id, expiry_str, sig = parts
        expiry = int(expiry_str)
    except (ValueError, IndexError):
        logger.warning("Invalid photo token format")
        return None

    # Reject expired tokens
    if time.time() > expiry:
        logger.debug("Photo token expired for account %s", account_id)
        return None

    # Verify HMAC signature
    expected_sig = hmac.new(
        get_settings().JWT_SECRET_KEY.encode(),
        f"{account_id}:{user_id}:{expiry}".encode(),
        hashlib.sha256,
    ).hexdigest()[:16]

    if not hmac.compare_digest(sig, expected_sig):
        logger.warning("Photo token signature mismatch for account %s", account_id)
        return None

    return user_id
