"""Device session management business logic."""

import logging
from typing import Any

from app.models.telegram_account import TelegramAccount
from app.services.telegram_client import client_pool
from app.utils.encryption import decrypt

logger = logging.getLogger(__name__)


async def get_devices(account: TelegramAccount) -> list[dict]:
    """Fetch all active sessions for this account."""
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")

    try:
        from telethon.tl.functions.account import GetAuthorizationsRequest
        auths = await client(GetAuthorizationsRequest())
        devices = []
        for auth in auths.authorizations:
            devices.append({
                "hash": str(auth.hash),
                "app_name": auth.app_name or "",
                "app_version": auth.app_version or "",
                "device_model": auth.device_model or "",
                "platform": auth.platform or "",
                "system_version": auth.system_version or "",
                "ip": auth.ip or "",
                "country": auth.country or "",
                "region": auth.region or "",
                "city": None,
                "current": bool(getattr(auth, "current", False)),
                "created": str(auth.date_created) if hasattr(auth, "date_created") and auth.date_created else None,
            })
        return devices
    except Exception as exc:
        logger.error("Failed to get devices for %s: %s", account.id, exc)
        raise


async def terminate_device(account: TelegramAccount, device_hash: str) -> None:
    """Terminate a specific device session."""
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")

    try:
        from telethon.tl.functions.account import ResetAuthorizationRequest
        await client(ResetAuthorizationRequest(int(device_hash)))
    except Exception as exc:
        logger.error("Failed to terminate device %s: %s", device_hash, exc)
        raise


async def terminate_all_other_sessions(account: TelegramAccount) -> None:
    """Terminate all sessions except the current one."""
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")

    try:
        from telethon.tl.functions.auth import ResetAuthorizationsRequest
        await client(ResetAuthorizationsRequest())
    except Exception as exc:
        logger.error("Failed to terminate all sessions: %s", exc)
        raise
