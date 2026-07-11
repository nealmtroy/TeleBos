"""Auth business logic.

Registration, login, token management, and refresh are handled by Better Auth
in the Next.js frontend. This file provides server-side auth operations:

- change_password: Updates the password hash in Better Auth's ``account`` table.
- revoke_all_user_sessions: Deletes all sessions for a user from the ``session`` table.
"""

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


async def revoke_all_user_sessions(db: AsyncSession, user: User) -> int:
    """Delete every session row for the given user from the ``session`` table.

    Called after password changes and can also be called from an admin endpoint
    to forcibly log out a compromised account.  Returns the number of rows
    deleted.

    The caller is responsible for committing the transaction.
    """
    result = await db.execute(
        text('DELETE FROM session WHERE "userId" = :user_id'),
        {"user_id": str(user.id)},
    )
    await db.flush()
    return result.rowcount


async def change_password(
    db: AsyncSession, user: User, current_password: str, new_password: str
) -> None:
    """Change the user's password in Better Auth's ``account`` table.

    Better Auth stores the password hash in the ``account`` table
    (not in the custom ``users`` table).  We read the current hash,
    verify the old password, then write the new one using passlib-compatible
    bcrypt.

    Raises ``ValueError`` on failure (wrong password, or no BA account).
    """
    from passlib.context import CryptContext
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

    # 1. Fetch the current password hash from Better Auth
    result = await db.execute(
        text("""
            SELECT password
            FROM account
            WHERE user_id = :user_id
            LIMIT 1
        """),
        {"user_id": str(user.id)},
    )
    row = result.one_or_none()

    if row is None:
        raise ValueError("No Better Auth account found for this user")

    current_hash = row.password
    if not current_hash:
        raise ValueError("Account has no password set (OAuth-only?)")

    # 2. Verify current password against the stored hash
    if not pwd_context.verify(current_password, current_hash):
        raise ValueError("Current password is incorrect")

    # 3. Hash new password with bcrypt (max 72-byte truncation,
    #    compatible with Better Auth's default scheme)
    new_pwd_bytes = new_password.encode()
    new_pwd_trimmed = new_pwd_bytes[:72].decode(errors="ignore")
    new_hash = pwd_context.hash(new_pwd_trimmed)

    # 4. Update the password in Better Auth's account table
    await db.execute(
        text("""
            UPDATE account
            SET password = :password, updated_at = NOW()
            WHERE user_id = :user_id
        """),
        {"password": new_hash, "user_id": str(user.id)},
    )

    await db.flush()
