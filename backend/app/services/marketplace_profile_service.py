"""Telegram profile sanitization required before marketplace listing."""

from __future__ import annotations

import asyncio
import logging
import os
import random
import time
from dataclasses import dataclass
from typing import Awaitable, TypeVar

from sqlalchemy.ext.asyncio import AsyncSession

from app.indonesian_names import choose_indonesian_full_name, generate_username_candidates
from app.models.telegram_account import TelegramAccount
from app.services.telegram_client import client_pool
from app.utils.encryption import decrypt

logger = logging.getLogger(__name__)
OFFICIAL_MARKETPLACE_BIO = "https://t.me/telebos_official"
MAX_USERNAME_ATTEMPTS = 12
MAX_PHOTO_DELETE_BATCHES = 100
CLIENT_ACQUISITION_TIMEOUT_SECONDS = 20
TELEGRAM_RPC_TIMEOUT_SECONDS = 10
PROFILE_PREPARATION_TIMEOUT_SECONDS = 45

T = TypeVar("T")


class MarketplaceProfilePreparationError(ValueError):
    """Raised when an account cannot be made safe for marketplace transfer."""


class MarketplaceProfilePreparationTimeoutError(MarketplaceProfilePreparationError):
    """Raised when bounded marketplace preparation does not finish in time."""


@dataclass(frozen=True)
class SaleProfileIdentity:
    """The randomized Telegram identity successfully applied before listing."""

    first_name: str
    last_name: str
    username: str


async def _with_timeout(
    awaitable: Awaitable[T], *, operation: str, account_id: str
) -> T:
    """Await one Telegram operation with a bounded marketplace deadline."""
    try:
        return await asyncio.wait_for(awaitable, timeout=TELEGRAM_RPC_TIMEOUT_SECONDS)
    except asyncio.TimeoutError as exc:
        logger.warning(
            "Marketplace profile preparation timed out during %s for account %s",
            operation,
            account_id,
        )
        raise MarketplaceProfilePreparationTimeoutError(
            "Telegram did not respond in time. The account was not listed; please try again."
        ) from exc


async def _get_sale_client(account: TelegramAccount):
    try:
        return await asyncio.wait_for(
            client_pool.get(str(account.id), decrypt(account.session_string)),
            timeout=CLIENT_ACQUISITION_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError as exc:
        logger.warning("Marketplace client acquisition timed out for account %s", account.id)
        raise MarketplaceProfilePreparationTimeoutError(
            "Telegram connection timed out. The account was not listed; please try again."
        ) from exc


async def _delete_all_profile_photos(client, account_id: str) -> None:
    """Delete every Telegram profile photo, not only the first result page."""
    from telethon.tl.functions.photos import DeletePhotosRequest, GetUserPhotosRequest

    me = await _with_timeout(client.get_me(), operation="get current user", account_id=account_id)
    if not me:
        raise MarketplaceProfilePreparationError("Telegram account is disconnected. Please re-login.")

    for _ in range(MAX_PHOTO_DELETE_BATCHES):
        result = await _with_timeout(
            client(GetUserPhotosRequest(user_id=me, offset=0, max_id=0, limit=100)),
            operation="list profile photos",
            account_id=account_id,
        )
        photos = result.photos
        if not photos:
            return
        await _with_timeout(
            client(DeletePhotosRequest(id=photos)),
            operation="delete profile photos",
            account_id=account_id,
        )

    raise MarketplaceProfilePreparationError("Unable to remove all Telegram profile photos.")


async def _prepare_account_for_sale(
    db: AsyncSession,
    account: TelegramAccount,
    *,
    rng: random.Random | random.SystemRandom | None,
    reserved_usernames: set[str] | None,
) -> SaleProfileIdentity:
    from telethon.errors import (
        FloodWaitError,
        RPCError,
        UsernameInvalidError,
        UsernameOccupiedError,
    )
    from telethon.tl.functions.account import UpdateProfileRequest, UpdateUsernameRequest

    random_source = rng or random.SystemRandom()
    first_name, surname = choose_indonesian_full_name(random_source)
    last_name = f"{surname} by Telebos"
    account_id = str(account.id)
    client = await _get_sale_client(account)
    if client is None:
        raise MarketplaceProfilePreparationError("Telegram account is disconnected. Please re-login.")

    try:
        await _with_timeout(
            client(
                UpdateProfileRequest(
                    first_name=first_name,
                    last_name=last_name,
                    about=OFFICIAL_MARKETPLACE_BIO,
                )
            ),
            operation="update profile",
            account_id=account_id,
        )
    except FloodWaitError as exc:
        raise MarketplaceProfilePreparationError(
            f"Telegram is rate limiting this account. Try again after {exc.seconds} seconds."
        ) from exc
    except RPCError as exc:
        logger.warning("Failed to sanitize Telegram profile for %s: %s", account.id, exc)
        raise MarketplaceProfilePreparationError("Unable to update the Telegram profile. Please try again.") from exc

    username = None
    for candidate in generate_username_candidates(
        first_name,
        surname,
        rng=random_source,
        reserved=reserved_usernames,
        limit=MAX_USERNAME_ATTEMPTS,
    ):
        try:
            await _with_timeout(
                client(UpdateUsernameRequest(username=candidate)),
                operation="update username",
                account_id=account_id,
            )
        except UsernameOccupiedError:
            continue
        except UsernameInvalidError:
            continue
        except FloodWaitError as exc:
            raise MarketplaceProfilePreparationError(
                f"Telegram is rate limiting this account. Try again after {exc.seconds} seconds."
            ) from exc
        except RPCError as exc:
            logger.warning("Failed to set marketplace username for %s: %s", account.id, exc)
            raise MarketplaceProfilePreparationError("Unable to set a Telegram username. Please try again.") from exc
        username = candidate
        break

    if username is None:
        raise MarketplaceProfilePreparationError(
            "Unable to reserve a Telegram username. Please try listing the account again."
        )

    try:
        await _delete_all_profile_photos(client, account_id)
        from app.services.account_service import _photo_path

        photo_path = _photo_path(account_id)
        if os.path.exists(photo_path):
            os.remove(photo_path)
    except MarketplaceProfilePreparationError:
        raise
    except FloodWaitError as exc:
        raise MarketplaceProfilePreparationError(
            f"Telegram is rate limiting this account. Try again after {exc.seconds} seconds."
        ) from exc
    except RPCError as exc:
        logger.warning("Failed to remove Telegram profile photos for %s: %s", account.id, exc)
        raise MarketplaceProfilePreparationError("Unable to remove Telegram profile photos. Please try again.") from exc
    except OSError as exc:
        logger.warning("Failed to remove cached marketplace photo for %s: %s", account.id, exc)
        raise MarketplaceProfilePreparationError("Unable to clear the cached profile photo. Please try again.") from exc
    except Exception as exc:
        logger.warning("Failed to remove Telegram profile photos for %s: %s", account.id, exc)
        raise MarketplaceProfilePreparationError("Unable to remove Telegram profile photos. Please try again.") from exc

    account.first_name = first_name
    account.last_name = last_name
    account.username = username
    account.bio = OFFICIAL_MARKETPLACE_BIO
    account.profile_photo_path = None
    account.profile_photo_id = None
    account.photo_version += 1
    await db.flush()

    if reserved_usernames is not None:
        reserved_usernames.add(username)

    return SaleProfileIdentity(first_name=first_name, last_name=last_name, username=username)


async def prepare_account_for_sale(
    db: AsyncSession,
    account: TelegramAccount,
    *,
    rng: random.Random | random.SystemRandom | None = None,
    reserved_usernames: set[str] | None = None,
) -> SaleProfileIdentity:
    """Apply a randomized safe profile and remove photos before marketplace sale.

    The profile phase is fail-closed and has a strict overall deadline so it
    returns an application error before an upstream proxy can time out.
    """
    started_at = time.monotonic()
    try:
        return await asyncio.wait_for(
            _prepare_account_for_sale(
                db,
                account,
                rng=rng,
                reserved_usernames=reserved_usernames,
            ),
            timeout=PROFILE_PREPARATION_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError as exc:
        logger.warning("Marketplace profile preparation exceeded deadline for account %s", account.id)
        raise MarketplaceProfilePreparationTimeoutError(
            "Telegram profile preparation timed out. The account was not listed; please try again."
        ) from exc
    finally:
        logger.info(
            "Marketplace profile preparation finished for account %s in %.2fs",
            account.id,
            time.monotonic() - started_at,
        )
