"""Account folder API endpoints — CRUD for user-defined account folders."""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.models.account_folder import AccountFolder
from app.models.account_folder_member import AccountFolderMember
from app.models.telegram_account import TelegramAccount
from app.schemas.account_folder import (
    AccountFolderCreate,
    AccountFolderListResponse,
    AccountFolderMembershipRequest,
    AccountFolderResponse,
    AccountFolderUpdate,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/account-folders", tags=["Account Folders"])


async def _get_user_folder(
    db: AsyncSession, folder_id: str, user: User,
) -> AccountFolder:
    """Fetch a folder by ID, verifying it belongs to the user. Raises 404 if not found."""
    try:
        folder_uuid = UUID(folder_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found")

    result = await db.execute(
        select(AccountFolder).where(
            AccountFolder.id == folder_uuid,
            AccountFolder.user_id == user.id,
        )
    )
    folder = result.scalar_one_or_none()
    if not folder:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found")
    return folder


@router.get("", response_model=AccountFolderListResponse)
async def list_folders(
    include_accounts: bool = Query(False, alias="include_accounts"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List all account folders for the current user."""
    query = (
        select(AccountFolder)
        .where(AccountFolder.user_id == user.id)
        .order_by(AccountFolder.name)
    )
    if include_accounts:
        query = query.options(selectinload(AccountFolder.members))

    result = await db.execute(query)
    folders = list(result.scalars().all())

    folder_responses = []
    for folder in folders:
        account_ids = (
            [m.account_id for m in folder.members]
            if include_accounts
            else []
        )
        folder_responses.append(AccountFolderResponse(
            id=folder.id,
            name=folder.name,
            created_at=folder.created_at,
            updated_at=folder.updated_at,
            account_ids=account_ids,
        ))

    return AccountFolderListResponse(folders=folder_responses)


@router.post("", response_model=AccountFolderResponse, status_code=status.HTTP_201_CREATED)
async def create_folder(
    body: AccountFolderCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create a new account folder."""
    folder = AccountFolder(
        user_id=user.id,
        name=body.name.strip(),
    )
    db.add(folder)
    await db.flush()
    await db.refresh(folder)

    return AccountFolderResponse(
        id=folder.id,
        name=folder.name,
        created_at=folder.created_at,
        updated_at=folder.updated_at,
        account_ids=[],
    )


@router.put("/{folder_id}", response_model=AccountFolderResponse)
async def rename_folder(
    folder_id: str,
    body: AccountFolderUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Rename an existing folder."""
    folder = await _get_user_folder(db, folder_id, user)
    folder.name = body.name.strip()
    await db.flush()
    await db.refresh(folder)

    # Load account IDs for response
    members_result = await db.execute(
        select(AccountFolderMember.account_id).where(
            AccountFolderMember.folder_id == folder.id,
        )
    )
    account_ids = [row[0] for row in members_result.all()]

    return AccountFolderResponse(
        id=folder.id,
        name=folder.name,
        created_at=folder.created_at,
        updated_at=folder.updated_at,
        account_ids=account_ids,
    )


@router.delete("/{folder_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_folder(
    folder_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Delete a folder. Accounts in the folder are not deleted."""
    folder = await _get_user_folder(db, folder_id, user)
    await db.delete(folder)
    await db.flush()


@router.post("/{folder_id}/accounts", response_model=AccountFolderResponse)
async def add_accounts_to_folder(
    folder_id: str,
    body: AccountFolderMembershipRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Add one or more accounts to a folder."""
    folder = await _get_user_folder(db, folder_id, user)

    # Verify all accounts belong to the user
    account_uuids = []
    for raw_id in body.account_ids:
        try:
            account_uuids.append(UUID(raw_id))
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid account ID: {raw_id}",
            )

    accounts_result = await db.execute(
        select(TelegramAccount.id).where(
            TelegramAccount.id.in_(account_uuids),
            TelegramAccount.user_id == user.id,
        )
    )
    valid_account_ids = {row[0] for row in accounts_result.all()}

    # Insert membership rows (skip duplicates via unique constraint)
    for acc_id in account_uuids:
        if acc_id not in valid_account_ids:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Account {acc_id} not found",
            )

    # Bulk insert with conflict ignore
    for acc_id in account_uuids:
        # Check if already exists
        existing = await db.execute(
            select(AccountFolderMember).where(
                AccountFolderMember.folder_id == folder.id,
                AccountFolderMember.account_id == acc_id,
            )
        )
        if not existing.scalar_one_or_none():
            db.add(AccountFolderMember(folder_id=folder.id, account_id=acc_id))

    await db.flush()

    # Return updated folder with account IDs
    members_result = await db.execute(
        select(AccountFolderMember.account_id).where(
            AccountFolderMember.folder_id == folder.id,
        )
    )
    account_ids = [row[0] for row in members_result.all()]

    return AccountFolderResponse(
        id=folder.id,
        name=folder.name,
        created_at=folder.created_at,
        updated_at=folder.updated_at,
        account_ids=account_ids,
    )


@router.delete("/{folder_id}/accounts", response_model=AccountFolderResponse)
async def remove_accounts_from_folder(
    folder_id: str,
    body: AccountFolderMembershipRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Remove one or more accounts from a folder."""
    folder = await _get_user_folder(db, folder_id, user)

    account_uuids = []
    for raw_id in body.account_ids:
        try:
            account_uuids.append(UUID(raw_id))
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid account ID: {raw_id}",
            )

    await db.execute(
        delete(AccountFolderMember).where(
            AccountFolderMember.folder_id == folder.id,
            AccountFolderMember.account_id.in_(account_uuids),
        )
    )
    await db.flush()

    # Return updated folder with account IDs
    members_result = await db.execute(
        select(AccountFolderMember.account_id).where(
            AccountFolderMember.folder_id == folder.id,
        )
    )
    account_ids = [row[0] for row in members_result.all()]

    return AccountFolderResponse(
        id=folder.id,
        name=folder.name,
        created_at=folder.created_at,
        updated_at=folder.updated_at,
        account_ids=account_ids,
    )
