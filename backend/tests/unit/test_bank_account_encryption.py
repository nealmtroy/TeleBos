"""Unit tests for TASK-11 / SEC-03:
Server-side encrypted bank account storage and CRUD operations.
Verifies that bank account numbers are encrypted at rest using AES-256 Fernet,
correctly decrypted only for authenticated owners, and properly managed.
"""

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock
import uuid
import pytest
from fastapi import HTTPException

from app.api.wallet import (
    create_bank_account,
    delete_bank_account,
    list_bank_accounts,
    set_default_bank_account,
    update_bank_account,
)
from app.models.bank_account import UserBankAccount
from app.models.user import User
from app.schemas.wallet import BankAccountCreateRequest, BankAccountUpdateRequest
from app.utils.encryption import decrypt, encrypt


def _create_mock_user() -> User:
    return User(
        id=uuid.uuid4(),
        email="trader@telebos.id",
        role="member",
        is_active=True,
    )


def test_bank_account_encryption_at_rest():
    """Verify raw bank numbers are never stored in plaintext and Fernet encrypts properly."""
    raw_number = "1400001944882"
    ciphertext = encrypt(raw_number)

    assert ciphertext != raw_number
    assert raw_number not in ciphertext
    assert decrypt(ciphertext) == raw_number

    # Verify last 4 digits extraction
    last4 = raw_number[-4:]
    assert last4 == "4882"


@pytest.mark.asyncio
async def test_list_bank_accounts_returns_decrypted_numbers():
    """list_bank_accounts must return decrypted account numbers for the authenticated user."""
    user = _create_mock_user()
    acc_id = uuid.uuid4()
    raw_number = "5551234567"
    encrypted_number = encrypt(raw_number)

    bank_acc = UserBankAccount(
        id=acc_id,
        user_id=user.id,
        account_type="bank",
        provider="BCA",
        account_number_encrypted=encrypted_number,
        account_number_last4="4567",
        account_holder="TeleBos Trader",
        is_default=True,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )

    db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [bank_acc]
    db.execute.return_value = mock_result

    results = await list_bank_accounts(db=db, current_user=user)

    assert len(results) == 1
    assert results[0].id == str(acc_id)
    assert results[0].account_number == raw_number
    assert results[0].account_number_last4 == "4567"
    assert results[0].provider == "BCA"
    assert results[0].is_default is True
    # CamelCase properties for frontend
    assert results[0].accountNumber == raw_number
    assert results[0].isDefault is True


@pytest.mark.asyncio
async def test_create_bank_account_first_account_becomes_default_and_encrypts():
    """First bank account added by a user automatically receives is_default=True and encrypted at rest."""
    user = _create_mock_user()

    db = AsyncMock()
    db.add = MagicMock()
    # Mock count query returning 0 existing accounts
    mock_count_result = MagicMock()
    mock_count_result.scalar.return_value = 0
    db.execute.return_value = mock_count_result

    payload = BankAccountCreateRequest(
        type="bank",
        provider="Mandiri",
        account_number="1400019283311",
        account_holder="John TeleBos",
        is_default=False,  # Should become True because user has 0 accounts
    )

    created = await create_bank_account(payload=payload, db=db, current_user=user)

    assert created.is_default is True
    assert created.account_number == "1400019283311"
    assert created.account_number_last4 == "3311"
    assert created.provider == "Mandiri"
    assert db.add.called

    added_model: UserBankAccount = db.add.call_args[0][0]
    assert added_model.account_number_encrypted != "1400019283311"
    assert decrypt(added_model.account_number_encrypted) == "1400019283311"
    assert added_model.account_number_last4 == "3311"
    assert added_model.is_default is True


@pytest.mark.asyncio
async def test_create_bank_account_explicit_default_clears_previous_defaults():
    """When a new account is created with is_default=True, existing defaults are cleared."""
    user = _create_mock_user()

    old_acc = UserBankAccount(
        id=uuid.uuid4(),
        user_id=user.id,
        account_type="bank",
        provider="BCA",
        account_number_encrypted=encrypt("11111111"),
        account_number_last4="1111",
        account_holder="John",
        is_default=True,
    )

    db = AsyncMock()
    db.add = MagicMock()
    # Mock count returning 1 existing account
    mock_count_result = MagicMock()
    mock_count_result.scalar.return_value = 1

    # Mock select existing accounts returning old_acc
    mock_accs_result = MagicMock()
    mock_accs_result.scalars.return_value.all.return_value = [old_acc]

    db.execute.side_effect = [mock_count_result, mock_accs_result]

    payload = BankAccountCreateRequest(
        type="ewallet",
        provider="GoPay",
        account_number="081234567890",
        account_holder="John TeleBos",
        is_default=True,
    )

    created = await create_bank_account(payload=payload, db=db, current_user=user)

    assert created.is_default is True
    assert old_acc.is_default is False  # previous default cleared


@pytest.mark.asyncio
async def test_set_default_bank_account_switches_defaults():
    """set_default_bank_account sets target account to default and clears others."""
    user = _create_mock_user()
    acc1_id = uuid.uuid4()
    acc2_id = uuid.uuid4()

    acc1 = UserBankAccount(
        id=acc1_id,
        user_id=user.id,
        account_type="bank",
        provider="BCA",
        account_number_encrypted=encrypt("11111111"),
        account_number_last4="1111",
        account_holder="Owner",
        is_default=True,
    )
    acc2 = UserBankAccount(
        id=acc2_id,
        user_id=user.id,
        account_type="ewallet",
        provider="DANA",
        account_number_encrypted=encrypt("22222222"),
        account_number_last4="2222",
        account_holder="Owner",
        is_default=False,
    )

    db = AsyncMock()
    mock_res = MagicMock()
    mock_res.scalars.return_value.all.return_value = [acc1, acc2]
    db.execute.return_value = mock_res

    res = await set_default_bank_account(account_id=acc2_id, db=db, current_user=user)

    assert res.id == str(acc2_id)
    assert acc2.is_default is True
    assert acc1.is_default is False


@pytest.mark.asyncio
async def test_set_default_bank_account_not_found_raises_404():
    """Attempting to set default for non-existent or other user's account raises 404."""
    user = _create_mock_user()
    db = AsyncMock()
    mock_res = MagicMock()
    mock_res.scalars.return_value.all.return_value = []
    db.execute.return_value = mock_res

    with pytest.raises(HTTPException) as exc_info:
        await set_default_bank_account(account_id=uuid.uuid4(), db=db, current_user=user)

    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_delete_bank_account_reassigns_default_to_remaining():
    """Deleting the default account reassigns is_default=True to a remaining account."""
    user = _create_mock_user()
    acc1_id = uuid.uuid4()
    acc2_id = uuid.uuid4()

    acc1 = UserBankAccount(
        id=acc1_id,
        user_id=user.id,
        account_type="bank",
        provider="BCA",
        account_number_encrypted=encrypt("1111"),
        account_number_last4="1111",
        account_holder="Owner",
        is_default=True,
    )
    acc2 = UserBankAccount(
        id=acc2_id,
        user_id=user.id,
        account_type="bank",
        provider="Mandiri",
        account_number_encrypted=encrypt("2222"),
        account_number_last4="2222",
        account_holder="Owner",
        is_default=False,
    )

    db = AsyncMock()
    mock_lookup = MagicMock()
    mock_lookup.scalar_one_or_none.return_value = acc1

    mock_remaining = MagicMock()
    mock_remaining.scalars.return_value.all.return_value = [acc2]

    db.execute.side_effect = [mock_lookup, mock_remaining]

    res = await delete_bank_account(account_id=acc1_id, db=db, current_user=user)

    assert res["status"] == "success"
    assert db.delete.called
    assert acc2.is_default is True


@pytest.mark.asyncio
async def test_update_bank_account_reencrypts_new_account_number():
    """Updating account number re-encrypts the new number and updates last4."""
    user = _create_mock_user()
    acc_id = uuid.uuid4()

    acc = UserBankAccount(
        id=acc_id,
        user_id=user.id,
        account_type="bank",
        provider="BCA",
        account_number_encrypted=encrypt("11111111"),
        account_number_last4="1111",
        account_holder="Owner",
        is_default=True,
    )

    db = AsyncMock()
    mock_lookup = MagicMock()
    mock_lookup.scalar_one_or_none.return_value = acc
    db.execute.return_value = mock_lookup

    payload = BankAccountUpdateRequest(
        account_number="999988887777",
        provider="BCA Digital",
    )

    updated = await update_bank_account(account_id=acc_id, payload=payload, db=db, current_user=user)

    assert updated.account_number == "999988887777"
    assert updated.account_number_last4 == "7777"
    assert updated.provider == "BCA Digital"
    assert decrypt(acc.account_number_encrypted) == "999988887777"
    assert acc.account_number_last4 == "7777"
