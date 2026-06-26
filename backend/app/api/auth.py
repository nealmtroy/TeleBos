"""Auth endpoints — only user profile endpoints remain.

Registration, login, logout, token refresh are handled by Better Auth
in the Next.js frontend (see frontend/src/lib/auth.ts and
frontend/src/app/api/auth/[...all]/route.ts).

This file keeps only the endpoints that need FastAPI business logic:
- GET /me — returns user details (role, balance, etc.)
- POST /change-password — changes password (delegates to Better Auth's DB)
"""

from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.auth import (
    UserResponse,
    ChangePasswordRequest,
    ChangePasswordResponse,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/change-password", response_model=ChangePasswordResponse)
async def change_password(
    request: Request,
    payload: ChangePasswordRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Change the current user's password through Better Auth.

    Note: This updates the password hash in Better Auth's ``account`` table,
    not in the legacy ``users`` table.
    """
    try:
        from app.services.auth_service import change_password
        await change_password(
            db, current_user, payload.current_password, payload.new_password
        )
        await db.commit()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return ChangePasswordResponse()
