"""FastAPI dependency injection helpers."""

from fastapi import Depends, HTTPException, status, Query, Request, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select, text
from datetime import datetime, timezone

from app.models.api_key import ApiKey
from app.utils.api_keys import hash_api_key
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models.user import User
from app.utils.session_token import hash_session_token

settings = get_settings()


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User:
    """Validate Better Auth session from x-better-auth-token header and return the user.

    The frontend injects the Better Auth session token into every request via
    the ``x-better-auth-token`` header (read from the ``better-auth.session_token``
    cookie client-side).  We query the ``session`` table in PostgreSQL directly
    to validate it.

    This replaces the old custom JWT auth (FastAPI + python-jose).
    """
    token = request.headers.get("x-better-auth-token")
    if not token:
        # Fallback to Better Auth cookies
        token = request.cookies.get("better-auth.session_token") or request.cookies.get("__Secure-better-auth.session_token")
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token",
        )

    # Validate the Better Auth session token by querying the session table
    # by its SHA-256 hash.  Fall back to plaintext lookup for sessions created
    # before the token_hash column was added (backward compatibility).
    # Better Auth stores sessions in a "session" table with columns:
    #   id, expiresAt, token, token_hash, createdAt, updatedAt, ipAddress, userAgent, userId
    hashed_token = hash_session_token(token)
    result = await db.execute(
        text("""
            SELECT s."userId" AS user_id, s."expiresAt" AS expires_at, u.email, u.name
            FROM session s
            JOIN "user" u ON u.id = s."userId"
            WHERE s.token_hash = :hashed_token
               OR (s.token_hash IS NULL AND s.token = :token)
            LIMIT 1
        """),
        {"hashed_token": hashed_token, "token": token},
    )
    row = result.one_or_none()

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid session",
        )

    # Check expiration
    from datetime import datetime, timezone
    expires_at = row.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired",
        )

    # Map the Better Auth user to our User model via the user ID (UUID).
    # BA stores IDs as TEXT; our legacy "users" table uses PostgreSQL UUID type.
    # Resolving by ID (not email) prevents a duplicate-email attack where an
    # attacker registers with an existing email, verifies it, and the session
    # would map to the original user's record.
    from uuid import UUID as PyUUID
    try:
        user_uuid = PyUUID(row.user_id)
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user ID in session",
        )
    user_result = await db.execute(
        select(User).where(User.id == user_uuid)
    )
    user = user_result.scalar_one_or_none()

    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    # Auto-downgrade expired subscriptions
    from app.services.redeem_service import auto_downgrade_if_expired
    user = await auto_downgrade_if_expired(db, user)

    return user


async def get_current_user_from_token_or_header(
    request: Request,
    token: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Validate Better Auth session from header or query param, returning authenticated user."""
    auth_token = token or request.headers.get("x-better-auth-token")
    if not auth_token:
        # Fallback to Better Auth cookies
        auth_token = request.cookies.get("better-auth.session_token") or request.cookies.get("__Secure-better-auth.session_token")
    if not auth_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )

    hashed_token = hash_session_token(auth_token)
    result = await db.execute(
        text("""
            SELECT s."userId" AS user_id, s."expiresAt" AS expires_at, u.email
            FROM session s
            JOIN "user" u ON u.id = s."userId"
            WHERE s.token_hash = :hashed_token
               OR (s.token_hash IS NULL AND s.token = :token)
            LIMIT 1
        """),
        {"hashed_token": hashed_token, "token": auth_token},
    )
    row = result.one_or_none()

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid session",
        )

    from datetime import datetime, timezone
    expires_at = row.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired",
        )

    # Map via user ID (UUID) — see comment in get_current_user above
    from uuid import UUID as PyUUID
    try:
        user_uuid = PyUUID(row.user_id)
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user ID in session",
        )
    user_result = await db.execute(
        select(User).where(User.id == user_uuid)
    )
    user = user_result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )
    return user


api_key_scheme = HTTPBearer(auto_error=False, description="TeleBos integration API key")


async def get_api_principal(
    credentials: HTTPAuthorizationCredentials | None = Security(api_key_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Validate a scoped integration key; never accepts browser session cookies."""
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing API key")

    key_hash = hash_api_key(credentials.credentials)
    result = await db.execute(
        select(ApiKey, User)
        .join(User, User.id == ApiKey.user_id)
        .where(ApiKey.key_hash == key_hash)
    )
    row = result.one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")

    api_key, user = row
    now = datetime.now(timezone.utc)
    if api_key.revoked_at is not None or (api_key.expires_at and api_key.expires_at <= now):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="API key expired or revoked")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User inactive")

    api_key.last_used_at = now
    # The route dependency owns the transaction and commits this timestamp.
    setattr(user, "_api_key_scopes", set(api_key.scopes or []))
    setattr(user, "_api_key_id", api_key.id)
    return user


def require_api_scope(scope: str):
    async def dependency(user: User = Depends(get_api_principal)) -> User:
        if scope not in getattr(user, "_api_key_scopes", set()):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Missing API scope: {scope}")
        return user
    return dependency


def require_role(allowed_roles: list[str] | str):
    """Dependency that checks if the authenticated user has one of the allowed roles."""
    if isinstance(allowed_roles, str):
        allowed_roles = [allowed_roles]

    async def dependency(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action.",
            )
        return current_user
    return dependency
