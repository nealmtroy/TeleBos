"""Auth business logic.

Registration, login, token management, and refresh are handled by Better Auth
in the Next.js frontend. This file retains only:

- change_password: Updates the password hash in Better Auth's ``account`` table
  (run from FastAPI as a convenience for the web UI).
"""

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


async def change_password(
    db: AsyncSession, user: User, _current_password: str, new_password: str
) -> None:
    """Change the user's password in Better Auth's ``account`` table.

    Better Auth stores the bcrypt password hash in the ``account`` table
    (not in the custom ``users`` table).  We update it directly with a raw
    SQL query using passlib-compatible bcrypt.

    Raises ``ValueError`` on failure.
    """
    # Better Auth uses bcrypt via its own hashing, compatible with passlib.
    # Hash the new password with bcrypt (same scheme as Better Auth).
    from passlib.context import CryptContext
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

    new_pwd_bytes = new_password.encode()
    new_pwd_trimmed = new_pwd_bytes[:72].decode(errors="ignore")
    new_hash = pwd_context.hash(new_pwd_trimmed)

    # Update the password in Better Auth's account table
    result = await db.execute(
        text("""
            UPDATE account
            SET password = :password, updated_at = NOW()
            WHERE user_id = :user_id
        """),
        {"password": new_hash, "user_id": str(user.id)},
    )
    if result.rowcount == 0:
        raise ValueError("No Better Auth account found for this user")

    await db.flush()
