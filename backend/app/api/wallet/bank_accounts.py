"""User bank accounts CRUD endpoints with AES-256 Fernet encrypted storage."""

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.bank_account import UserBankAccount
from app.models.user import User
from app.schemas.wallet import (
    BankAccountCreateRequest,
    BankAccountResponse,
    BankAccountUpdateRequest,
)
from app.utils.encryption import decrypt_or_none, encrypt

router = APIRouter()


@router.get("/wallet/bank-accounts", response_model=list[BankAccountResponse])
async def list_bank_accounts(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List saved withdrawal bank accounts for current user with decrypted account numbers."""
    query = (
        select(UserBankAccount)
        .where(UserBankAccount.user_id == current_user.id)
        .order_by(UserBankAccount.is_default.desc(), UserBankAccount.created_at.desc())
    )
    result = await db.execute(query)
    accounts = result.scalars().all()

    items: list[BankAccountResponse] = []
    for acc in accounts:
        decrypted_number = decrypt_or_none(acc.account_number_encrypted) or (
            f"****{acc.account_number_last4}"
        )
        items.append(
            BankAccountResponse(
                id=str(acc.id),
                user_id=acc.user_id,
                type=acc.account_type,
                provider=acc.provider,
                account_number=decrypted_number,
                account_number_last4=acc.account_number_last4,
                account_holder=acc.account_holder,
                is_default=acc.is_default,
                created_at=acc.created_at or datetime.now(timezone.utc),
                updated_at=acc.updated_at,
            )
        )
    return items


@router.post("/wallet/bank-accounts", response_model=BankAccountResponse, status_code=status.HTTP_201_CREATED)
async def create_bank_account(
    payload: BankAccountCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add a new withdrawal bank account. Encrypts the raw account number before storing."""
    clean_account_number = payload.account_number.strip()
    clean_account_holder = payload.account_holder.strip()
    clean_provider = payload.provider.strip()

    if not clean_account_number or not clean_account_holder:
        raise HTTPException(status_code=400, detail="Account number and holder name cannot be empty")

    last4 = clean_account_number[-4:] if len(clean_account_number) >= 4 else clean_account_number
    encrypted_number = encrypt(clean_account_number)

    # Check if this is the user's first account
    existing_count_res = await db.execute(
        select(func.count(UserBankAccount.id)).where(UserBankAccount.user_id == current_user.id)
    )
    existing_count = existing_count_res.scalar() or 0

    should_be_default = payload.is_default or (existing_count == 0)

    if should_be_default:
        # Clear default flag on existing accounts
        existing_accs_res = await db.execute(
            select(UserBankAccount).where(UserBankAccount.user_id == current_user.id)
        )
        for acc in existing_accs_res.scalars().all():
            acc.is_default = False

    new_account = UserBankAccount(
        user_id=current_user.id,
        account_type=payload.type,
        provider=clean_provider,
        account_number_encrypted=encrypted_number,
        account_number_last4=last4,
        account_holder=clean_account_holder,
        is_default=should_be_default,
    )
    db.add(new_account)
    await db.flush()
    await db.refresh(new_account)

    return BankAccountResponse(
        id=str(new_account.id),
        user_id=new_account.user_id,
        type=new_account.account_type,
        provider=new_account.provider,
        account_number=clean_account_number,
        account_number_last4=new_account.account_number_last4,
        account_holder=new_account.account_holder,
        is_default=new_account.is_default,
        created_at=new_account.created_at or datetime.now(timezone.utc),
        updated_at=new_account.updated_at,
    )


@router.put("/wallet/bank-accounts/{account_id}/default", response_model=BankAccountResponse)
async def set_default_bank_account(
    account_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Set the specified bank account as the default withdrawal account."""
    query = select(UserBankAccount).where(
        UserBankAccount.user_id == current_user.id
    )
    res = await db.execute(query)
    all_accounts = res.scalars().all()

    target_account = next((a for a in all_accounts if a.id == account_id), None)
    if not target_account:
        raise HTTPException(status_code=404, detail="Bank account not found")

    for a in all_accounts:
        a.is_default = (a.id == account_id)

    await db.flush()
    await db.refresh(target_account)

    decrypted_number = decrypt_or_none(target_account.account_number_encrypted) or (
        f"****{target_account.account_number_last4}"
    )

    return BankAccountResponse(
        id=str(target_account.id),
        user_id=target_account.user_id,
        type=target_account.account_type,
        provider=target_account.provider,
        account_number=decrypted_number,
        account_number_last4=target_account.account_number_last4,
        account_holder=target_account.account_holder,
        is_default=target_account.is_default,
        created_at=target_account.created_at or datetime.now(timezone.utc),
        updated_at=target_account.updated_at,
    )


@router.put("/wallet/bank-accounts/{account_id}", response_model=BankAccountResponse)
async def update_bank_account(
    account_id: UUID,
    payload: BankAccountUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update bank account details."""
    query = select(UserBankAccount).where(
        UserBankAccount.id == account_id,
        UserBankAccount.user_id == current_user.id,
    )
    res = await db.execute(query)
    account = res.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Bank account not found")

    if payload.type is not None:
        account.account_type = payload.type
    if payload.provider is not None:
        account.provider = payload.provider.strip()
    if payload.account_holder is not None:
        account.account_holder = payload.account_holder.strip()
    if payload.account_number is not None:
        clean_number = payload.account_number.strip()
        account.account_number_encrypted = encrypt(clean_number)
        account.account_number_last4 = clean_number[-4:] if len(clean_number) >= 4 else clean_number
    if payload.is_default is True:
        # Clear other defaults
        existing_res = await db.execute(
            select(UserBankAccount).where(UserBankAccount.user_id == current_user.id)
        )
        for a in existing_res.scalars().all():
            a.is_default = (a.id == account_id)
        account.is_default = True
    elif payload.is_default is False:
        account.is_default = False

    await db.flush()
    await db.refresh(account)

    decrypted_number = decrypt_or_none(account.account_number_encrypted) or (
        f"****{account.account_number_last4}"
    )

    return BankAccountResponse(
        id=str(account.id),
        user_id=account.user_id,
        type=account.account_type,
        provider=account.provider,
        account_number=decrypted_number,
        account_number_last4=account.account_number_last4,
        account_holder=account.account_holder,
        is_default=account.is_default,
        created_at=account.created_at or datetime.now(timezone.utc),
        updated_at=account.updated_at,
    )


@router.delete("/wallet/bank-accounts/{account_id}")
async def delete_bank_account(
    account_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a saved bank account. If it was default, reassigns default to remaining account."""
    query = select(UserBankAccount).where(
        UserBankAccount.id == account_id,
        UserBankAccount.user_id == current_user.id,
    )
    res = await db.execute(query)
    account = res.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Bank account not found")

    was_default = account.is_default
    await db.delete(account)
    await db.flush()

    if was_default:
        remaining_res = await db.execute(
            select(UserBankAccount)
            .where(UserBankAccount.user_id == current_user.id)
            .order_by(UserBankAccount.created_at.desc())
        )
        remaining = remaining_res.scalars().all()
        if remaining and not any(r.is_default for r in remaining):
            remaining[0].is_default = True
            await db.flush()

    return {"status": "success", "message": "Bank account deleted"}
