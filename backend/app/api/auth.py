"""Auth endpoints — register, login, refresh, me, logout."""

from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from jose import jwt, JWTError

from app.config import get_settings
from app.database import get_db
from app.dependencies import get_current_user, security_scheme
from app.models.user import User
from app.schemas.auth import (
    TokenResponse,
    UserLogin,
    UserRegister,
    UserResponse,
    RefreshRequest,
    ChangePasswordRequest,
    ChangePasswordResponse,
)
from app.services import auth_service
from app.utils.rate_limiter import rate_limiter

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()


def _cookie_secure() -> bool:
    """Secure flag depends on PRODUCTION env — True only when running over HTTPS."""
    return settings.PRODUCTION


def _set_refresh_cookie(response: JSONResponse, refresh_token: str, remember_me: bool = False) -> None:
    """Set refresh_token as an httpOnly cookie (inaccessible to JavaScript)."""
    max_age = settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS * 86400 if remember_me else None
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=_cookie_secure(),
        samesite="lax",
        max_age=max_age,
        path="/api/v1/auth/refresh",
    )


def _set_auth_session_cookie(response: JSONResponse, remember_me: bool = False) -> None:
    """Set a lightweight auth_session cookie for Next.js middleware validation.

    This cookie signals to the middleware that the user is authenticated.
    It mirrors the access_token lifetime (60 min default) if remember_me is False.
    If remember_me is True, we set it to match the refresh token lifetime (30 days)
    so that middleware doesn't redirect the user to login while they have a valid refresh token.
    httpOnly=True so JavaScript cannot read it.
    """
    max_age = (
        settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS * 86400
        if remember_me
        else settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60
    )
    response.set_cookie(
        key="auth_session",
        value="true",
        httponly=True,
        secure=_cookie_secure(),
        samesite="lax",
        max_age=max_age,
        path="/",
    )


def _clear_auth_session_cookie(response: JSONResponse) -> None:
    """Clear the auth_session cookie."""
    response.set_cookie(
        key="auth_session",
        value="",
        httponly=True,
        secure=_cookie_secure(),
        samesite="lax",
        max_age=0,
        path="/",
    )


def _clear_refresh_cookie(response: JSONResponse) -> None:
    """Clear the refresh_token cookie."""
    response.set_cookie(
        key="refresh_token",
        value="",
        httponly=True,
        secure=_cookie_secure(),
        samesite="lax",
        max_age=0,
        path="/api/v1/auth/refresh",
    )


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(request: Request, payload: UserRegister, db: AsyncSession = Depends(get_db)):
    ip = request.client.host
    if not await rate_limiter.check(f"register:ip:{ip}"):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many registration attempts. Please try again later.",
        )
    try:
        user = await auth_service.register_user(
            db, payload.email, payload.password, payload.full_name
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return user


@router.post("/login")
async def login(request: Request, payload: UserLogin, db: AsyncSession = Depends(get_db)):
    ip = request.client.host
    email = payload.email
    if not await rate_limiter.check(f"login:ip:{ip}") or not await rate_limiter.check(f"login:email:{email}"):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts. Please try again later.",
        )

    try:
        user = await auth_service.authenticate_user(db, payload.email, payload.password)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc))

    access, refresh = auth_service.generate_tokens(str(user.id), payload.remember_me)

    response = JSONResponse(content={
        "access_token": access,
        "refresh_token": refresh,
        "token_type": "bearer",
    })
    _set_refresh_cookie(response, refresh, payload.remember_me)
    _set_auth_session_cookie(response, payload.remember_me)
    return response


@router.post("/refresh")
async def refresh(
    request: Request,
    payload: RefreshRequest | None = None,
):
    ip = request.client.host
    if not await rate_limiter.check(f"refresh:ip:{ip}"):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many refresh attempts. Please try again later.",
        )

    # Read refresh token from cookie first, fall back to request body
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token and payload:
        refresh_token = payload.refresh_token
    if not refresh_token:
        raise HTTPException(status_code=401, detail="Refresh token missing")

    try:
        access, refresh, remember_me = await auth_service.refresh_access_token(refresh_token)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc))

    response = JSONResponse(content={
        "access_token": access,
        "refresh_token": refresh,
        "token_type": "bearer",
    })
    _set_refresh_cookie(response, refresh, remember_me)
    _set_auth_session_cookie(response, remember_me)
    return response


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    payload: RefreshRequest | None = None,
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
):
    """Log out a user by blacklisting their access token and optional refresh token."""
    response = JSONResponse(content=None, status_code=status.HTTP_204_NO_CONTENT)
    _clear_refresh_cookie(response)
    _clear_auth_session_cookie(response)

    # 1. Blacklist access token
    token = credentials.credentials
    try:
        payload_access = jwt.decode(
            token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )
        jti = payload_access.get("jti")
        exp = payload_access.get("exp")
        if jti and exp:
            import time
            from app.utils.redis import blacklist_token
            remaining = int(exp - time.time())
            if remaining > 0:
                await blacklist_token(jti, remaining)
    except JWTError:
        pass

    # 2. Get refresh token from cookie (preferred) or body
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token and payload:
        refresh_token = payload.refresh_token

    if refresh_token:
        try:
            payload_refresh = jwt.decode(
                refresh_token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
            )
            jti_ref = payload_refresh.get("jti")
            exp_ref = payload_refresh.get("exp")
            if jti_ref and exp_ref:
                import time
                from app.utils.redis import blacklist_token
                remaining_ref = int(exp_ref - time.time())
                if remaining_ref > 0:
                    await blacklist_token(jti_ref, remaining_ref)
        except JWTError:
            pass

    return response


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
    ip = request.client.host
    if not await rate_limiter.check(f"change_password:ip:{ip}"):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many password change attempts. Please try again later.",
        )
    try:
        await auth_service.change_password(
            db, current_user, payload.current_password, payload.new_password
        )
        await db.commit()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return ChangePasswordResponse()
