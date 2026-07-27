"""Telegram profile sanitization required before marketplace listing."""

from __future__ import annotations

import logging
import os
import random
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.indonesian_names import choose_indonesian_full_name, generate_username_candidates
from app.models.telegram_account import TelegramAccount
from app.services.telegram_client import client_pool
from app.utils.encryption import decrypt

logger = logging.getLogger(__name__)
OFFICIAL_MARKETPLACE_BIO = "https://t.me/telebos_official"
MAX_USERNAME_ATTEMPTS = 12
MAX_PHOTO_DELETE_BATCHES = 100


class MarketplaceProfilePreparationError(ValueError):
    """Raised when an account cannot be made safe for marketplace transfer."""


@dataclass(frozen=True)
class SaleProfileIdentity:
    """The randomized Telegram identity successfully applied before listing."""

    first_name: str
    last_name: str
    username: str


async def _delete_all_profile_photos(client) -> None:
    """Delete every Telegram profile photo, not only the first result page."""
    from telethon.tl.functions.photos import DeletePhotosRequest, GetUserPhotosRequest

    me = await client.get_me()
    if not me:
        raise MarketplaceProfilePreparationError("Telegram account is disconnected. Please re-login.")

    for _ in range(MAX_PHOTO_DELETE_BATCHES):
        result = await client(
            GetUserPhotosRequest(user_id=me, offset=0, max_id=0, limit=100)
        )
        photos = result.photos
        if not photos:
            return
        await client(DeletePhotosRequest(id=photos))

    raise MarketplaceProfilePreparationError("Unable to remove all Telegram profile photos.")


async def prepare_account_for_sale(
    db: AsyncSession,
    account: TelegramAccount,
    *,
    rng: random.Random | random.SystemRandom | None = None,
    reserved_usernames: set[str] | None = None,
) -> SaleProfileIdentity:
    """Apply a randomized safe profile and remove photos before marketplace sale.

    This deliberately fails closed. Telegram changes cannot be rolled back, but
    an account is never marked for sale unless this preparation finishes.
    """
    from telethon.errors import (
        FloodWaitError,
        RPCError,
        UsernameInvalidError,
        UsernameOccupiedError,
    )
    from telethon.tl.functions.account import UpdateProfileRequest, UpdateUsernameRequest

    random_source = rng or random.SystemRandom()
    first_name, last_name = choose_indonesian_full_name(random_source)
    session_string = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_string)
    if client is None:
        raise MarketplaceProfilePreparationError("Telegram account is disconnected. Please re-login.")

    try:
        await client(
            UpdateProfileRequest(
                first_name=first_name,
                last_name=last_name,
                about=OFFICIAL_MARKETPLACE_BIO,
            )
        )
    except FloodWaitError as exc:
        raise MarketplaceProfilePreparationError(
            f"Telegram is rate limiting this account. Try again after {exc.seconds} seconds."
        ) from exc
    except RPCError as exc:
        logger.warning("Failed to sanitize Telegram profile for %s: %s", account.id, exc)
        raise MarketplaceProfilePreparationError("Unable to update the Telegram profile. Please try again.") from exc
    except Exception as exc:
        logger.warning("Failed to sanitize Telegram profile for %s: %s", account.id, exc)
        raise MarketplaceProfilePreparationError("Unable to update the Telegram profile. Please try again.") from exc

    username = None
    for candidate in generate_username_candidates(
        first_name,
        last_name,
        rng=random_source,
        reserved=reserved_usernames,
        limit=MAX_USERNAME_ATTEMPTS,
    ):
        try:
            await client(UpdateUsernameRequest(username=candidate))
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
        except Exception as exc:
            logger.warning("Failed to set marketplace username for %s: %s", account.id, exc)
            raise MarketplaceProfilePreparationError("Unable to set a Telegram username. Please try again.") from exc
        username = candidate
        break

    if username is None:
        raise MarketplaceProfilePreparationError(
            "Unable to reserve a Telegram username. Please try listing the account again."
        )

    try:
        await _delete_all_profile_photos(client)
        from app.services.account_service import _photo_path

        photo_path = _photo_path(str(account.id))
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
