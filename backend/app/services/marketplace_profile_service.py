"""Telegram profile sanitization required before marketplace listing."""

from __future__ import annotations

import asyncio
import logging
import os
import random
import time
from dataclasses import dataclass
from collections.abc import Awaitable
from typing import TypeVar

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
BIO_VERIFICATION_RETRY_DELAY_SECONDS = 0.25

T = TypeVar("T")


class MarketplaceProfilePreparationError(ValueError):
    """Raised when an account cannot be made safe for marketplace transfer."""


class MarketplaceProfilePreparationTimeoutError(MarketplaceProfilePreparationError):
    """Raised when bounded marketplace preparation does not finish in time."""


class MarketplaceProfilePreparationRateLimitError(MarketplaceProfilePreparationError):
    """Raised when Telegram asks the marketplace flow to wait before retrying."""

    def __init__(self, seconds: int):
        self.seconds = seconds
        super().__init__(
            f"Telegram is rate limiting this account. Try again after {seconds} seconds."
        )


@dataclass(frozen=True)
class SaleProfileIdentity:
    """The randomized Telegram identity successfully applied before listing."""

    first_name: str
    last_name: str
    username: str


def _remaining_timeout(deadline: float, limit: float) -> float:
    """Return the remaining bounded time for one operation."""
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise MarketplaceProfilePreparationTimeoutError(
            "Telegram profile preparation timed out. The account was not listed; please try again."
        )
    return min(limit, remaining)


async def _with_timeout(
    awaitable: Awaitable[T], *, operation: str, account_id: str, deadline: float
) -> T:
    """Await one Telegram operation without exceeding the sale deadline."""
    try:
        return await asyncio.wait_for(
            awaitable,
            timeout=_remaining_timeout(deadline, TELEGRAM_RPC_TIMEOUT_SECONDS),
        )
    except asyncio.TimeoutError as exc:
        logger.warning(
            "Marketplace profile preparation timed out during %s for account %s",
            operation,
            account_id,
        )
        raise MarketplaceProfilePreparationTimeoutError(
            "Telegram did not respond in time. The account was not listed; please try again."
        ) from exc


async def _get_sale_client(account: TelegramAccount, *, deadline: float):
    try:
        return await asyncio.wait_for(
            client_pool.get(str(account.id), decrypt(account.session_string)),
            timeout=_remaining_timeout(deadline, CLIENT_ACQUISITION_TIMEOUT_SECONDS),
        )
    except asyncio.TimeoutError as exc:
        logger.warning("Marketplace client acquisition timed out for account %s", account.id)
        raise MarketplaceProfilePreparationTimeoutError(
            "Telegram connection timed out. The account was not listed; please try again."
        ) from exc


async def _verify_official_bio(client, account_id: str, *, deadline: float) -> bool:
    """Read Telegram's authoritative profile payload and confirm the sale bio."""
    from telethon.errors import FloodWaitError, RPCError
    from telethon.tl.functions.users import GetFullUserRequest

    try:
        full = await _with_timeout(
            client(GetFullUserRequest("me")),
            operation="verify profile bio",
            account_id=account_id,
            deadline=deadline,
        )
    except FloodWaitError as exc:
        logger.warning(
            "Marketplace profile verification rate limited for account %s; retry after %s seconds",
            account_id,
            exc.seconds,
        )
        raise MarketplaceProfilePreparationRateLimitError(exc.seconds) from exc
    except RPCError as exc:
        logger.warning("Failed to verify marketplace profile bio for %s: %s", account_id, exc)
        raise MarketplaceProfilePreparationError(
            "Unable to verify the Telegram profile bio. Please try again."
        ) from exc

    return getattr(getattr(full, "full_user", None), "about", None) == OFFICIAL_MARKETPLACE_BIO


async def _apply_official_profile(
    client,
    *,
    first_name: str,
    last_name: str,
    account_id: str,
    deadline: float,
) -> None:
    """Set the randomized sale profile with the exact official bio."""
    from telethon.errors import FloodWaitError, RPCError
    from telethon.tl.functions.account import UpdateProfileRequest

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
            deadline=deadline,
        )
    except FloodWaitError as exc:
        raise MarketplaceProfilePreparationRateLimitError(exc.seconds) from exc
    except RPCError as exc:
        logger.warning("Failed to sanitize Telegram profile for %s: %s", account_id, exc)
        raise MarketplaceProfilePreparationError(
            "Unable to update the Telegram profile. Please try again."
        ) from exc


async def _retry_profile_after_bio_mismatch(
    client,
    *,
    first_name: str,
    last_name: str,
    account_id: str,
    deadline: float,
) -> None:
    """Reapply and verify the profile once after a failed final verification."""
    from telethon.errors import FloodWaitError, RPCError
    from telethon.tl.functions.account import UpdateProfileRequest

    await asyncio.sleep(
        min(
            BIO_VERIFICATION_RETRY_DELAY_SECONDS,
            _remaining_timeout(deadline, BIO_VERIFICATION_RETRY_DELAY_SECONDS),
        )
    )
    try:
        await _with_timeout(
            client(
                UpdateProfileRequest(
                    first_name=first_name,
                    last_name=last_name,
                    about=OFFICIAL_MARKETPLACE_BIO,
                )
            ),
            operation="retry profile update",
            account_id=account_id,
            deadline=deadline,
        )
    except FloodWaitError as exc:
        raise MarketplaceProfilePreparationRateLimitError(exc.seconds) from exc
    except RPCError as exc:
        logger.warning("Failed to retry marketplace profile for %s: %s", account_id, exc)
        raise MarketplaceProfilePreparationError(
            "Unable to update the Telegram profile. Please try again."
        ) from exc

    if not await _verify_official_bio(client, account_id, deadline=deadline):
        raise MarketplaceProfilePreparationError(
            "Telegram did not save the official bio. The account was not listed; please try again."
        )


async def _delete_all_profile_photos(client, account_id: str, *, deadline: float) -> None:
    """Delete every Telegram profile photo, not only the first result page."""
    from telethon.tl.functions.photos import DeletePhotosRequest, GetUserPhotosRequest

    me = await _with_timeout(
        client.get_me(),
        operation="get current user",
        account_id=account_id,
        deadline=deadline,
    )
    if not me:
        raise MarketplaceProfilePreparationError(
            "Telegram account is disconnected. Please re-login."
        )

    for _ in range(MAX_PHOTO_DELETE_BATCHES):
        result = await _with_timeout(
            client(GetUserPhotosRequest(user_id=me, offset=0, max_id=0, limit=100)),
            operation="list profile photos",
            account_id=account_id,
            deadline=deadline,
        )
        photos = result.photos
        if not photos:
            return
        await _with_timeout(
            client(DeletePhotosRequest(id=photos)),
            operation="delete profile photos",
            account_id=account_id,
            deadline=deadline,
        )

    raise MarketplaceProfilePreparationError("Unable to remove all Telegram profile photos.")


async def _prepare_account_for_sale_inner(
    db: AsyncSession,
    account: TelegramAccount,
    *,
    rng: random.Random | random.SystemRandom | None,
    reserved_usernames: set[str] | None,
    deadline: float,
    photos_to_delete: list[str] | None = None,
) -> SaleProfileIdentity:
    from telethon.errors import (
        FloodWaitError,
        RPCError,
        UsernameInvalidError,
        UsernameOccupiedError,
    )
    from telethon.tl.functions.account import UpdateUsernameRequest

    random_source = rng or random.SystemRandom()
    first_name, surname = choose_indonesian_full_name(random_source)
    last_name = f"{surname} by Telebos"
    account_id = str(account.id)
    client = await _get_sale_client(account, deadline=deadline)
    if client is None:
        raise MarketplaceProfilePreparationError(
            "Telegram account is disconnected. Please re-login."
        )

    await _apply_official_profile(
        client,
        first_name=first_name,
        last_name=last_name,
        account_id=account_id,
        deadline=deadline,
    )

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
                deadline=deadline,
            )
        except UsernameOccupiedError:
            continue
        except UsernameInvalidError:
            continue
        except FloodWaitError as exc:
            raise MarketplaceProfilePreparationRateLimitError(exc.seconds) from exc
        except RPCError as exc:
            logger.warning("Failed to set marketplace username for %s: %s", account.id, exc)
            raise MarketplaceProfilePreparationError(
                "Unable to set a Telegram username. Please try again."
            ) from exc
        username = candidate
        break

    if username is None:
        raise MarketplaceProfilePreparationError(
            "Unable to reserve a Telegram username. Please try listing the account again."
        )

    try:
        await _delete_all_profile_photos(client, account_id, deadline=deadline)
        from app.services.account_service import _photo_path

        photo_path = _photo_path(account_id)
        if photos_to_delete is not None:
            photos_to_delete.append(photo_path)
        else:
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
        raise MarketplaceProfilePreparationError(
            "Unable to remove Telegram profile photos. Please try again."
        ) from exc
    except OSError as exc:
        logger.warning("Failed to remove cached marketplace photo for %s: %s", account.id, exc)
        raise MarketplaceProfilePreparationError(
            "Unable to clear the cached profile photo. Please try again."
        ) from exc
    except Exception as exc:
        logger.warning("Failed to remove Telegram profile photos for %s: %s", account.id, exc)
        raise MarketplaceProfilePreparationError(
            "Unable to remove Telegram profile photos. Please try again."
        ) from exc

    if not await _verify_official_bio(client, account_id, deadline=deadline):
        logger.warning(
            "Marketplace bio verification mismatch for account %s; retrying once", account_id
        )
        await _retry_profile_after_bio_mismatch(
            client,
            first_name=first_name,
            last_name=last_name,
            account_id=account_id,
            deadline=deadline,
        )

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


async def _prepare_account_for_sale(
    db: AsyncSession,
    account: TelegramAccount,
    *,
    rng: random.Random | random.SystemRandom | None,
    reserved_usernames: set[str] | None,
    deadline: float,
    photos_to_delete: list[str] | None = None,
) -> SaleProfileIdentity:
    from app.services.event_relay import event_relay

    account_id = str(account.id)
    event_relay.suspend_profile_sync(account_id)
    try:
        return await _prepare_account_for_sale_inner(
            db,
            account,
            rng=rng,
            reserved_usernames=reserved_usernames,
            deadline=deadline,
            photos_to_delete=photos_to_delete,
        )
    finally:
        event_relay.resume_profile_sync(account_id)


async def prepare_account_for_sale(
    db: AsyncSession,
    account: TelegramAccount,
    *,
    rng: random.Random | random.SystemRandom | None = None,
    reserved_usernames: set[str] | None = None,
    photos_to_delete: list[str] | None = None,
) -> SaleProfileIdentity:
    """Apply a randomized safe profile and remove photos before marketplace sale.

    The profile phase is fail-closed and has a strict overall deadline so it
    returns an application error before an upstream proxy can time out.
    """
    started_at = time.monotonic()
    deadline = started_at + PROFILE_PREPARATION_TIMEOUT_SECONDS
    try:
        return await asyncio.wait_for(
            _prepare_account_for_sale(
                db,
                account,
                rng=rng,
                reserved_usernames=reserved_usernames,
                deadline=deadline,
                photos_to_delete=photos_to_delete,
            ),
            timeout=PROFILE_PREPARATION_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError as exc:
        logger.warning(
            "Marketplace profile preparation exceeded deadline for account %s", account.id
        )
        raise MarketplaceProfilePreparationTimeoutError(
            "Telegram profile preparation timed out. The account was not listed; please try again."
        ) from exc
    finally:
        logger.info(
            "Marketplace profile preparation finished for account %s in %.2fs",
            account.id,
            time.monotonic() - started_at,
        )
