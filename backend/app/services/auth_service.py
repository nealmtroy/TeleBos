"""Auth business logic — register, login, token management."""

import uuid
from datetime import datetime, timedelta, timezone

from jose import jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.user import User

settings = get_settings()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def _create_access_token(user_id: str, jti: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload = {"sub": user_id, "exp": expire, "type": "access", "jti": jti}
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def _create_refresh_token(user_id: str, jti: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS
    )
    payload = {"sub": user_id, "exp": expire, "type": "refresh", "jti": jti}
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


async def register_user(
    db: AsyncSession, email: str, password: str, full_name: str | None = None
) -> User:
    """Create a new web user. Raises ValueError if email already exists."""
    result = await db.execute(select(User).where(User.email == email))
    if result.scalar_one_or_none():
        raise ValueError("Email already registered")

    # bcrypt has a 72-byte limit; truncate silently to avoid hard errors
    pwd_bytes = password.encode()
    truncated = pwd_bytes[:72].decode(errors="ignore")
    user = User(
        id=uuid.uuid4(),
        email=email,
        password_hash=pwd_context.hash(truncated),
        full_name=full_name,
    )
    db.add(user)
    await db.flush()
    return user


async def authenticate_user(db: AsyncSession, email: str, password: str) -> User:
    """Verify credentials and return the user. Raises ValueError on failure."""
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    pwd_bytes = password.encode()
    pwd_trimmed = pwd_bytes[:72].decode(errors="ignore")
    if user is None or not pwd_context.verify(pwd_trimmed, user.password_hash):
        raise ValueError("Invalid email or password")
    if not user.is_active:
        raise ValueError("Account is deactivated")
    return user


def generate_tokens(user_id: str) -> tuple[str, str]:
    """Return (access_token, refresh_token)."""
    access_jti = str(uuid.uuid4())
    refresh_jti = str(uuid.uuid4())
    access = _create_access_token(user_id, access_jti)
    refresh = _create_refresh_token(user_id, refresh_jti)
    return access, refresh


async def refresh_access_token(refresh_token: str) -> tuple[str, str]:
    """Validate refresh token and return new (access_token, refresh_token)."""
    import time
    from app.utils.redis import is_token_blacklisted, blacklist_token
    try:
        payload = jwt.decode(
            refresh_token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
        if payload.get("type") != "refresh":
            raise ValueError("Invalid token type")
        
        jti = payload.get("jti")
        exp = payload.get("exp")
        user_id: str = payload.get("sub")
        
        if jti and await is_token_blacklisted(jti):
            raise ValueError("Refresh token has been revoked or already used")
            
        if jti and exp:
            remaining = int(exp - time.time())
            if remaining > 0:
                await blacklist_token(jti, remaining)
                
        return generate_tokens(user_id)
    except Exception as exc:
        raise ValueError(f"Invalid or expired refresh token: {exc}")


async def change_password(
    db: AsyncSession, user: User, current_password: str, new_password: str
) -> None:
    """Verify current password and update to new password. Raises ValueError on failure."""
    pwd_bytes = current_password.encode()
    pwd_trimmed = pwd_bytes[:72].decode(errors="ignore")
    if not pwd_context.verify(pwd_trimmed, user.password_hash):
        raise ValueError("Current password is incorrect")

    new_pwd_bytes = new_password.encode()
    new_pwd_trimmed = new_pwd_bytes[:72].decode(errors="ignore")
    user.password_hash = pwd_context.hash(new_pwd_trimmed)
    await db.flush()
