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
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token",
        )

    # Validate the Better Auth session token by querying the session table
    # Better Auth stores sessions in a "session" table with columns:
    #   id, expires_at, token, created_at, updated_at, ip_address, user_agent, user_id
    result = await db.execute(
        text("""
            SELECT s.user_id, s.expires_at, u.email, u.name, u.is_active, u.role, u.balance
            FROM session s
            JOIN "user" u ON u.id = s.user_id
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
    if row.expires_at < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired",
        )

    # Map the Better Auth user to our User model
    # Better Auth's "user" table has: id, name, email, etc.
    # Our custom "users" table has role, balance, etc.
    # For now we fetch the User model separately to preserve app-specific fields.
    user_result = await db.execute(
        select(User).where(User.id == row.user_id)
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
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )

    result = await db.execute(
        text("""
            SELECT s.user_id, s.expires_at
            FROM session s
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
    if row.expires_at < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired",
        )

    user_result = await db.execute(
        select(User).where(User.id == row.user_id)
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
