"""Safe Telegram two-factor authentication status lookups."""

import logging
from typing import Any

from app.models.telegram_account import TelegramAccount
from app.services.telegram_client import client_pool
from app.utils.encryption import decrypt

logger = logging.getLogger(__name__)


async def get_live_2fa_status(client: Any) -> dict[str, Any] | None:
    """Return live Telegram 2FA details, or ``None`` when they are unavailable.

    A failed live check is deliberately distinct from Telegram reporting that 2FA is
    disabled. Callers must preserve their cached value when this returns ``None``.
    """
    try:
        from telethon.tl.functions.account import GetPasswordRequest

        password = await client(GetPasswordRequest())
        return {
            "enabled": password.has_password,
            "has_recovery": password.has_recovery,
            "hint": password.hint or None,
            "login_email_pattern": password.login_email_pattern or None,
            "unconfirmed_email_pattern": password.email_unconfirmed_pattern or None,
        }
    except Exception as exc:
        logger.warning("Unable to read live Telegram 2FA status: %s", type(exc).__name__)
        return None


async def get_account_live_2fa_status(account: TelegramAccount) -> dict[str, Any] | None:
    """Best-effort live 2FA lookup for an already persisted account."""
    try:
        session_string = decrypt(account.session_string)
        client = await client_pool.get(str(account.id), session_string)
        if client is None:
            return None
        return await get_live_2fa_status(client)
    except Exception as exc:
        logger.warning("Unable to connect for live Telegram 2FA status: %s", type(exc).__name__)
        return None
