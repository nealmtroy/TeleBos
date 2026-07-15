"""Cryptographic helpers for integration API keys."""

import hashlib
import secrets

KEY_PREFIX = "tb_live_"


def generate_api_key() -> tuple[str, str, str]:
    """Return (plaintext secret, display prefix, SHA-256 hash)."""
    secret = f"{KEY_PREFIX}{secrets.token_urlsafe(32)}"
    prefix = secret[:16]
    return secret, prefix, hash_api_key(secret)


def hash_api_key(secret: str) -> str:
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()
