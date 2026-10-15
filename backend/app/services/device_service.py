"""Device session management business logic."""

import logging
from typing import Any

from app.models.telegram_account import TelegramAccount
from app.services.telegram_client import client_pool
from app.utils.encryption import decrypt

logger = logging.getLogger(__name__)


def _normalize_device(raw: dict) -> dict:
    """Coerce either provider's authorization dict into the DeviceInfo shape.

    The in-process path and the worker command-bus path historically emitted
    different keys (``created`` vs ``date_created``, and no ``city``), which made
    ``DeviceInfo`` validation fail with a 500. Normalize both here so the API
    contract holds regardless of which path produced the data.
    """
    return {
        "hash": str(raw.get("hash", "")),
        "app_name": raw.get("app_name") or "",
        "app_version": raw.get("app_version") or None,
        "device_model": raw.get("device_model") or None,
        "platform": raw.get("platform") or None,
        "system_version": raw.get("system_version") or None,
        "ip": raw.get("ip") or None,
        "country": raw.get("country") or None,
        "region": raw.get("region") or None,
        "city": raw.get("city") or None,
        "current": bool(raw.get("current", False)),
        "created": raw.get("created") or raw.get("date_created") or None,
    }


async def get_devices(account: TelegramAccount) -> list[dict]:
    """Fetch all active sessions for this account."""
    from app.config import get_settings
    from app.services.telegram_command_bus import execute_telegram_command, TelegramCommandError

    settings = get_settings()
    if settings.ENABLE_TELEGRAM_COMMAND_BUS and not getattr(client_pool, "is_worker", False):
        try:
            res = await execute_telegram_command(
                account_id=str(account.id),
                action="get_authorizations",
            )
            data = res.get("authorizations", []) if isinstance(res, dict) else []
            return [_normalize_device(d) for d in data]
        except TelegramCommandError as cmd_err:
            raise RuntimeError(str(cmd_err)) from cmd_err

    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")

    try:
        from telethon.tl.functions.account import GetAuthorizationsRequest
        auths = await client(GetAuthorizationsRequest())
        devices = []
        for auth in auths.authorizations:
            devices.append(_normalize_device({
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
                "created": str(auth.date_created)
                if getattr(auth, "date_created", None)
                else None,
            }))
        return devices
    except Exception as exc:
        logger.error("Failed to get devices for %s: %s", account.id, exc)
        raise


async def terminate_device(account: TelegramAccount, device_hash: str) -> None:
    """Terminate a specific device session."""
    from app.config import get_settings
    from app.services.telegram_command_bus import execute_telegram_command, TelegramCommandError

    settings = get_settings()
    if settings.ENABLE_TELEGRAM_COMMAND_BUS and not getattr(client_pool, "is_worker", False):
        try:
            await execute_telegram_command(
                account_id=str(account.id),
                action="terminate_session",
                params={"hash": device_hash},
            )
            return
        except TelegramCommandError as cmd_err:
            raise RuntimeError(str(cmd_err)) from cmd_err

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
        # Telegram refuses this for the first hours/days of a session's life.
        # That is an expected, temporary condition the user can act on, not a
        # fault, so it must not be reported at error level
        # (PYTHON-FASTAPI-15).
        from app.utils.telegram_errors import classify_telegram_error

        err_type, err_msg = classify_telegram_error(exc)
        if err_type == "fresh_reset_forbidden":
            logger.info("Session termination deferred by Telegram: %s", err_msg)
            raise RuntimeError(err_msg) from exc
        logger.error("Failed to terminate all sessions: %s", exc)
        raise
