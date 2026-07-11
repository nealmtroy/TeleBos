"""Session token hashing utility for database-at-rest protection.

Better Auth stores session tokens as plaintext in the ``session.token`` column.
If an attacker gains read access to the database (SQLi, credential theft,
backup exposure, insider threat), they can extract all active session tokens
and impersonate any user.

We add a ``token_hash`` column (SHA-256 hex digest) to the session table and
query by hash instead of plaintext.  SHA-256 is deterministic (same input →
same output), which is required because both Better Auth (via a database hook)
and this backend must independently compute the same hash for lookups to work.

This is defence-in-depth: it protects tokens at rest in the database without
needing to change Better Auth's internal session management.
"""

import hashlib


def hash_session_token(token: str) -> str:
    """Return the SHA-256 hex digest of a Better Auth session token.

    Args:
        token: The raw Better Auth session token (typically 32-char alphanumeric).

    Returns:
        A 64-character lowercase hex string.
    """
    return hashlib.sha256(token.encode()).hexdigest()
