"""Wallet API router package — modular decomposition of wallet, ledger, and payment workflows."""

from fastapi import APIRouter

from app.api.wallet.admin_settlement import (
    admin_list_transactions,
    admin_reconcile_user_balance,
    admin_update_transaction_status,
    router as admin_settlement_router,
)
from app.api.wallet.bank_accounts import (
    create_bank_account,
    delete_bank_account,
    list_bank_accounts,
    router as bank_accounts_router,
    set_default_bank_account,
    update_bank_account,
)
from app.api.wallet.transactions import (
    check_topup_status,
    get_my_ledger,
    get_my_transactions,
    request_topup,
    router as transactions_router,
)
from app.api.wallet.webhooks import (
    klikqris_webhook,
    router as webhooks_router,
)
from app.api.wallet.withdrawals import (
    request_withdraw,
    request_withdraw_otp,
    router as withdrawals_router,
)
from app.services.klikqris_service import is_klikqris_configured
from app.services.wallet_service import (
    _safe_bg_reconnect_account,
    fulfill_wallet_transaction,
    generate_qris_string,
)
from app.utils.rate_limiter import rate_limiter
from app.utils.redis import redis_client

router = APIRouter(tags=["wallet"])

router.include_router(transactions_router)
router.include_router(withdrawals_router)
router.include_router(bank_accounts_router)
router.include_router(admin_settlement_router)
router.include_router(webhooks_router)

__all__ = [
    "router",
    # Transactions & Ledger
    "get_my_transactions",
    "request_topup",
    "check_topup_status",
    "get_my_ledger",
    # Withdrawals & Step-Up OTP
    "request_withdraw_otp",
    "request_withdraw",
    # Bank Accounts CRUD
    "list_bank_accounts",
    "create_bank_account",
    "set_default_bank_account",
    "update_bank_account",
    "delete_bank_account",
    # Admin Settlement & Reconciliation
    "admin_list_transactions",
    "admin_update_transaction_status",
    "admin_reconcile_user_balance",
    # Webhooks
    "klikqris_webhook",
    # Backward compatibility exports for utilities & test monkeypatching
    "generate_qris_string",
    "_safe_bg_reconnect_account",
    "fulfill_wallet_transaction",
    "is_klikqris_configured",
    "rate_limiter",
    "redis_client",
]
