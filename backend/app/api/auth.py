"""Auth endpoints — backend-side session management and profile endpoints.

Registration, login, and token refresh are handled by Better Auth
in the Next.js frontend (see frontend/src/lib/auth.ts and
frontend/src/app/api/auth/[...all]/route.ts).

This file provides:
- GET /me — returns user details (role, balance, etc.)
- POST /logout — deletes the session from PostgreSQL (complements BA client signOut)
- POST /change-password — changes password and invalidates all sessions
"""

from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.auth import (
    UserResponse,
    ChangePasswordRequest,
    ChangePasswordResponse,
    LogoutResponse,
)
from app.utils.session_token import hash_session_token

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/logout", response_model=LogoutResponse)
async def logout(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Delete the session row from PostgreSQL, fully invalidating the token.

    This is defence-in-depth alongside Better Auth's client-side signOut:
    the BA sign-out clears cookies and client state, but does not reliably
    delete the session row from the database.  This endpoint ensures the
    token in the ``session`` table is physically removed, so any subsequent
    API request with that token will receive a 401.

    The endpoint tolerates missing / already-deleted tokens so callers can
    safely invoke it unconditionally on logout.
    """
    token = request.headers.get("x-better-auth-token")
    if not token:
        token = request.cookies.get("better-auth.session_token") or \
                 request.cookies.get("__Secure-better-auth.session_token")

    if token:
        hashed_token = hash_session_token(token)
        await db.execute(
            text("DELETE FROM session WHERE token_hash = :hashed_token OR (token_hash IS NULL AND token = :token)"),
            {"hashed_token": hashed_token, "token": token},
        )
        await db.commit()

    return LogoutResponse()


@router.post("/change-password", response_model=ChangePasswordResponse)
async def change_password(
    request: Request,
    payload: ChangePasswordRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Change the current user's password and invalidate all their sessions.

    All sessions for this user are deleted from the ``session`` table so that
    an attacker who may have a stolen token is locked out immediately.
    """
    try:
        from app.services.auth_service import change_password, revoke_all_user_sessions
        await change_password(
            db, current_user, payload.current_password, payload.new_password
        )
        await revoke_all_user_sessions(db, current_user)
        await db.commit()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return ChangePasswordResponse()
