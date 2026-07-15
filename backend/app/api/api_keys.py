"""First-party API key management for external integrations."""

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.api_key import ApiKey
from app.models.user import User
from app.schemas.api_key import (
    API_KEY_SCOPES,
    ApiKeyCreateRequest,
    ApiKeyCreateResponse,
    ApiKeyResponse,
)
from app.utils.api_keys import generate_api_key

router = APIRouter(prefix="/api/v1/api-keys", tags=["api-keys"])


def _validate_scopes(scopes: list[str]) -> list[str]:
    unknown = sorted(set(scopes) - set(API_KEY_SCOPES))
    if unknown:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"unknown_scopes": unknown, "allowed_scopes": API_KEY_SCOPES},
        )
    if not scopes:
        raise HTTPException(status_code=422, detail="At least one API scope is required")
    return sorted(set(scopes))


@router.get("", response_model=list[ApiKeyResponse])
async def list_api_keys(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ApiKey]:
    result = await db.execute(
        select(ApiKey)
        .where(ApiKey.user_id == user.id)
        .order_by(ApiKey.created_at.desc())
    )
    return list(result.scalars().all())


@router.post("", response_model=ApiKeyCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_api_key(
    payload: ApiKeyCreateRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    if payload.expires_at and payload.expires_at <= datetime.now(timezone.utc):
        raise HTTPException(status_code=422, detail="expires_at must be in the future")

    secret, prefix, key_hash = generate_api_key()
    api_key = ApiKey(
        user_id=user.id,
        name=payload.name,
        key_prefix=prefix,
        key_hash=key_hash,
        scopes=_validate_scopes(payload.scopes),
        expires_at=payload.expires_at,
        created_from_ip=request.client.host if request.client else None,
    )
    db.add(api_key)
    await db.flush()
    await db.refresh(api_key)
    return {**ApiKeyResponse.model_validate(api_key).model_dump(), "secret": secret}


@router.delete("/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_api_key(
    key_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    result = await db.execute(
        select(ApiKey).where(ApiKey.id == key_id, ApiKey.user_id == user.id)
    )
    api_key = result.scalar_one_or_none()
    if api_key is None:
        raise HTTPException(status_code=404, detail="API key not found")
    if api_key.revoked_at is None:
        api_key.revoked_at = datetime.now(timezone.utc)
