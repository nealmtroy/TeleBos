"""FastAPI dependency injection helpers."""

from fastapi import Depends, HTTPException, status, Query, Request
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models.user import User

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
    # Better Auth stores sessions in a "session" table with columns:
    #   id, expiresAt, token, createdAt, updatedAt, ipAddress, userAgent, userId
    result = await db.execute(
        text("""
            SELECT s."userId" AS user_id, s."expiresAt" AS expires_at, u.email, u.name
            FROM session s
            JOIN "user" u ON u.id = s."userId"
            WHERE s.token = :token
            LIMIT 1
        """),
        {"token": token},
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

    # Map the Better Auth user to our User model via email (unique in both tables).
    # BA uses UUID strings; our legacy "users" table uses PostgreSQL UUID type.
    # Email is the stable cross-reference between them.
    user_result = await db.execute(
        select(User).where(User.email == row.email)
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

    result = await db.execute(
        text("""
            SELECT s."userId" AS user_id, s."expiresAt" AS expires_at, u.email
            FROM session s
            JOIN "user" u ON u.id = s."userId"
            WHERE s.token = :token
            LIMIT 1
        """),
        {"token": auth_token},
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

    # Map via email (see comment in get_current_user above)
    user_result = await db.execute(
        select(User).where(User.email == row.email)
    )
    user = user_result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )
    return user


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
