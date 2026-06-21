"""Contact management service — list, detail, delete Telegram contacts."""

import logging

from telethon.tl.functions.contacts import GetContactsRequest, DeleteContactsRequest
from telethon.tl.functions.users import GetFullUserRequest
from telethon.tl.types import InputUser

from app.models.telegram_account import TelegramAccount
from app.services.telegram_client import client_pool
from app.utils.encryption import decrypt

logger = logging.getLogger(__name__)


async def get_contacts(
    account: TelegramAccount,
    *,
    page: int = 1,
    page_size: int = 50,
    search: str | None = None,
) -> tuple[list[dict], int]:
    """Fetch the account's Telegram contacts with optional pagination & search.

    Returns (list_of_serialized_contacts, total_count).
    """
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")

    try:
        result = await client(GetContactsRequest(0))
    except Exception as exc:
        logger.error("Failed to get contacts for account %s: %s", account.id, exc)
        raise RuntimeError(str(exc)) from exc

    users = result.users if result else []

    # Serialize to dicts
    contact_list = []
    for user in users:
        contact_list.append({
            "contact_id": user.id,
            "first_name": user.first_name or "",
            "last_name": user.last_name,
            "username": user.username,
            "phone": user.phone,
            "mutual": getattr(user, "mutual_contact", False),
        })

    # Apply search filter
    if search:
        q = search.lower()
        contact_list = [
            c
            for c in contact_list
            if q in c["first_name"].lower()
            or (c["last_name"] and q in c["last_name"].lower())
            or (c["username"] and q in c["username"].lower())
            or (c["phone"] and q in c["phone"])
        ]

    total = len(contact_list)

    # Apply pagination
    start = (page - 1) * page_size
    end = start + page_size
    page_contacts = contact_list[start:end]

    return page_contacts, total


async def get_contact_detail(
    account: TelegramAccount,
    contact_id: int,
) -> dict:
    """Fetch full details for a single contact (bio, common chats, etc.)."""
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")

    # First get the user entity
    try:
        entity = await client.get_entity(contact_id)
    except ValueError as exc:
        raise RuntimeError(f"Contact not found: {exc}") from exc
    except Exception as exc:
        logger.error("Failed to get entity %d: %s", contact_id, exc)
        raise RuntimeError(str(exc)) from exc

    # Then get full user info (bio, common chats)
    try:
        full = await client(GetFullUserRequest(contact_id))
    except Exception as exc:
        logger.error("Failed to get full user %d: %s", contact_id, exc)
        raise RuntimeError(str(exc)) from exc

    full_user = full.full_user if full else None

    return {
        "contact_id": entity.id,
        "first_name": entity.first_name or "",
        "last_name": entity.last_name,
        "username": entity.username,
        "phone": entity.phone,
        "about": getattr(full_user, "about", None),
        "mutual": getattr(entity, "mutual_contact", False),
        "common_chats_count": getattr(full_user, "common_chats_count", 0),
    }


async def delete_contact(
    account: TelegramAccount,
    contact_id: int,
) -> bool:
    """Delete a contact from the Telegram address book."""
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")

    try:
        id_input = InputUser(user_id=contact_id, access_hash=0)
        await client(DeleteContactsRequest(id=[id_input]))
        return True
    except Exception as exc:
        logger.error("Failed to delete contact %d: %s", contact_id, exc)
        raise RuntimeError(str(exc)) from exc
