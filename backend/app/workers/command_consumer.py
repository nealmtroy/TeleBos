"""Telegram Command Consumer — processes RPC commands from web server in worker runner.

Executes MTProto operations using the worker's persistent TelegramClientPool,
returning results or errors back to the caller via Redis.
"""

import asyncio
import json
import logging
import os
import time
import uuid
from typing import Any

from telethon import TelegramClient
from telethon.errors import (
    FloodWaitError,
    RPCError,
    SessionRevokedError,
    AuthKeyUnregisteredError,
    UserDeactivatedBanError,
)

from app.config import get_settings
from app.core.sharding import DEFAULT_CMD_QUEUE, get_shard_command_queue
from app.database import async_session_factory
from app.models.telegram_account import TelegramAccount
from app.services.chat_service import resolve_chat_entity
from app.services.telegram_command_bus import (
    TELEGRAM_COMMANDS_QUEUE,
    TELEGRAM_RESPONSE_PREFIX,
)
from app.utils.redis import redis_client
from app.utils.telethon_helpers import borrow_client, release_client
from sqlalchemy import select

logger = logging.getLogger(__name__)


async def _get_account_by_id(account_id: str) -> TelegramAccount | None:
    """Fetch TelegramAccount ORM entity from DB."""
    try:
        acc_uuid = uuid.UUID(str(account_id))
    except (ValueError, TypeError):
        return None

    async with async_session_factory() as db:
        res = await db.execute(select(TelegramAccount).where(TelegramAccount.id == acc_uuid))
        return res.scalar_one_or_none()


async def _handle_command_action(
    client: TelegramClient,
    account_id: str,
    action: str,
    params: dict[str, Any],
) -> Any:
    """Dispatch action to the appropriate Telethon MTProto method."""
    if action == "ping":
        return {"pong": True, "timestamp": time.time()}

    elif action == "send_message":
        chat_id = params["chat_id"]
        text = params["text"]
        reply_to = params.get("reply_to")
        entity = await resolve_chat_entity(client, account_id, int(chat_id))
        msg = await client.send_message(entity, text, reply_to=reply_to)
        return {
            "id": msg.id,
            "text": msg.text,
            "date": msg.date.isoformat() if msg.date else None,
        }

    elif action == "edit_message":
        chat_id = params["chat_id"]
        message_id = params["message_id"]
        text = params["text"]
        entity = await resolve_chat_entity(client, account_id, int(chat_id))
        msg = await client.edit_message(entity, int(message_id), text)
        return {
            "id": msg.id,
            "text": msg.text,
            "date": msg.date.isoformat() if msg.date else None,
        }

    elif action == "delete_messages":
        chat_id = params["chat_id"]
        message_ids = [int(mid) for mid in params["message_ids"]]
        revoke = params.get("revoke", True)
        entity = await resolve_chat_entity(client, account_id, int(chat_id))
        await client.delete_messages(entity, message_ids, revoke=revoke)
        return {"success": True, "deleted_count": len(message_ids)}

    elif action == "pin_message":
        chat_id = params["chat_id"]
        message_id = params["message_id"]
        notify = params.get("notify", False)
        entity = await resolve_chat_entity(client, account_id, int(chat_id))
        await client.pin_message(entity, int(message_id), notify=notify)
        return {"success": True}

    elif action == "unpin_message":
        chat_id = params["chat_id"]
        message_id = params.get("message_id")
        entity = await resolve_chat_entity(client, account_id, int(chat_id))
        await client.unpin_message(entity, int(message_id) if message_id else None)
        return {"success": True}

    elif action == "send_reaction":
        from telethon.tl.functions.messages import SendReactionRequest
        from telethon.tl.types import ReactionEmoji

        chat_id = params["chat_id"]
        message_id = params["message_id"]
        emoji = params["reaction"]
        entity = await resolve_chat_entity(client, account_id, int(chat_id))
        reaction_obj = [ReactionEmoji(emoticon=emoji)] if emoji else []
        await client(
            SendReactionRequest(
                peer=entity,
                msg_id=int(message_id),
                reaction=reaction_obj,
            )
        )
        return {"success": True}

    elif action == "mark_read":
        chat_id = params["chat_id"]
        max_id = params.get("max_id")
        entity = await resolve_chat_entity(client, account_id, int(chat_id))
        await client.send_read_acknowledge(entity, max_id=int(max_id) if max_id else None)
        return {"success": True}

    elif action == "update_profile":
        from telethon.tl.functions.account import UpdateProfileRequest

        first_name = params.get("first_name")
        last_name = params.get("last_name")
        about = params.get("about")
        req_kwargs: dict[str, Any] = {}
        if first_name is not None:
            req_kwargs["first_name"] = first_name
        if last_name is not None:
            req_kwargs["last_name"] = last_name
        if about is not None:
            req_kwargs["about"] = about
        res = await client(UpdateProfileRequest(**req_kwargs))
        return {
            "success": True,
            "id": getattr(res, "id", None),
            "first_name": getattr(res, "first_name", None),
            "last_name": getattr(res, "last_name", None),
        }

    elif action == "get_authorizations":
        from telethon.tl.functions.account import GetAuthorizationsRequest

        res = await client(GetAuthorizationsRequest())
        auths = []
        for a in getattr(res, "authorizations", []):
            auths.append({
                "hash": str(getattr(a, "hash", "")),
                "device_model": getattr(a, "device_model", ""),
                "platform": getattr(a, "platform", ""),
                "system_version": getattr(a, "system_version", ""),
                "api_id": getattr(a, "api_id", 0),
                "app_name": getattr(a, "app_name", ""),
                "app_version": getattr(a, "app_version", ""),
                "date_created": getattr(a, "date_created", None).isoformat() if getattr(a, "date_created", None) else None,
                "date_active": getattr(a, "date_active", None).isoformat() if getattr(a, "date_active", None) else None,
                "ip": getattr(a, "ip", ""),
                "country": getattr(a, "country", ""),
                "region": getattr(a, "region", ""),
                "current": bool(getattr(a, "current", False)),
            })
        return {"authorizations": auths}

    elif action == "terminate_session":
        from telethon.tl.functions.account import ResetAuthorizationRequest

        auth_hash = int(params["hash"])
        await client(ResetAuthorizationRequest(hash=auth_hash))
        return {"success": True}

    elif action == "download_media_to_file":
        chat_id = params["chat_id"]
        message_id = params["message_id"]
        destination_path = params["destination_path"]

        entity = await resolve_chat_entity(client, account_id, int(chat_id))
        msg = await client.get_messages(entity, ids=int(message_id))
        if not msg or not msg.media:
            raise ValueError(f"Message {message_id} has no media to download")

        os.makedirs(os.path.dirname(destination_path), exist_ok=True)
        saved_path = await client.download_media(msg, file=destination_path)
        return {"success": True, "saved_path": saved_path}

    elif action == "download_chat_photo":
        chat_id = params["chat_id"]
        destination_path = params["destination_path"]

        try:
            entity = await resolve_chat_entity(client, account_id, int(chat_id))
        except Exception:
            entity = await client.get_entity(int(chat_id))

        os.makedirs(os.path.dirname(destination_path), exist_ok=True)
        saved_path = await client.download_profile_photo(entity, file=destination_path, download_big=False)
        return {"success": bool(saved_path), "saved_path": saved_path}

    elif action in ("create_dialog_filter", "update_dialog_filter"):
        from telethon.tl.functions.messages import GetDialogFiltersRequest, UpdateDialogFilterRequest
        import telethon.tl.types as types

        folder_id = params.get("folder_id")
        title = params.get("title", "")
        included_chat_ids = params.get("included_chat_ids", [])
        excluded_chat_ids = params.get("excluded_chat_ids", [])
        pinned_chat_ids = params.get("pinned_chat_ids", [])

        if folder_id is None:
            dialog_filters = await client(GetDialogFiltersRequest())
            filters = getattr(dialog_filters, "filters", dialog_filters if isinstance(dialog_filters, list) else [])
            used_ids = {f.id for f in filters if hasattr(f, "id")}
            new_id = 2
            while new_id in used_ids:
                new_id += 1
            folder_id = new_id

        include_peers = []
        for cid in included_chat_ids:
            try:
                peer = await resolve_chat_entity(client, account_id, int(cid))
                include_peers.append(peer)
            except Exception:
                pass

        exclude_peers = []
        for cid in excluded_chat_ids:
            try:
                peer = await resolve_chat_entity(client, account_id, int(cid))
                exclude_peers.append(peer)
            except Exception:
                pass

        pinned_peers = []
        for cid in pinned_chat_ids:
            try:
                peer = await resolve_chat_entity(client, account_id, int(cid))
                pinned_peers.append(peer)
            except Exception:
                pass

        filter_obj = types.DialogFilter(
            id=int(folder_id),
            title=title,
            include_peers=include_peers,
            exclude_peers=exclude_peers,
            pinned_peers=pinned_peers,
        )
        await client(UpdateDialogFilterRequest(id=int(folder_id), filter=filter_obj))
        return {"success": True, "folder_id": folder_id}

    elif action == "delete_dialog_filter":
        from telethon.tl.functions.messages import UpdateDialogFilterRequest

        folder_id = params["folder_id"]
        await client(UpdateDialogFilterRequest(id=int(folder_id), filter=None))
        return {"success": True}

    else:
        raise NotImplementedError(f"Unsupported action: {action}")


async def process_single_command(raw_payload: str) -> None:
    """Parse, execute, and respond to a single Telegram RPC command."""
    try:
        payload = json.loads(raw_payload)
    except Exception as parse_err:
        logger.error("Failed to parse command JSON: %s (raw=%s)", parse_err, raw_payload[:200])
        return

    request_id = payload.get("request_id")
    account_id = payload.get("account_id")
    action = payload.get("action")
    params = payload.get("params", {})
    res_key = f"{TELEGRAM_RESPONSE_PREFIX}{request_id}"

    if not request_id or not action:
        logger.warning("Invalid command payload missing request_id or action: %s", payload)
        return

    logger.info("Executing Telegram RPC command '%s' (req=%s, acc=%s)", action, request_id, account_id)

    res_payload: dict[str, Any] = {
        "request_id": request_id,
        "status": "error",
        "data": None,
        "error": None,
    }

    client = None
    account = None

    try:
        # Resolve target account and client
        if account_id:
            account = await _get_account_by_id(account_id)
            if not account or not account.session_string:
                raise ValueError(f"Account {account_id} not found or has no active session")
            client = await borrow_client(account, receive_updates=True)
            if not client:
                raise RuntimeError(f"Could not connect client for account {account_id}")

        # Execute action
        result_data = await _handle_command_action(client, account_id, action, params)
        res_payload["status"] = "success"
        res_payload["data"] = result_data

    except FloodWaitError as fwe:
        logger.warning("FloodWaitError on action '%s' for %s: %ds", action, account_id, fwe.seconds)
        res_payload["error"] = {
            "code": "FLOOD_WAIT",
            "message": f"A wait of {fwe.seconds} seconds is required by Telegram",
            "wait_seconds": fwe.seconds,
        }
    except (SessionRevokedError, AuthKeyUnregisteredError, UserDeactivatedBanError) as sess_err:
        logger.error("Dead session on action '%s' for %s: %s", action, account_id, sess_err)
        res_payload["error"] = {
            "code": "DEAD_SESSION",
            "message": "This Telegram account session was revoked or deactivated.",
        }
    except RPCError as rpc_err:
        logger.warning("Telegram RPCError on action '%s' for %s: %s", action, account_id, rpc_err)
        res_payload["error"] = {
            "code": type(rpc_err).__name__,
            "message": str(rpc_err),
        }
    except Exception as exc:
        logger.exception("Unexpected error executing action '%s' for %s: %s", action, account_id, exc)
        res_payload["error"] = {
            "code": type(exc).__name__,
            "message": str(exc),
        }
    finally:
        if account and client:
            try:
                await release_client(account)
            except Exception as rel_err:
                logger.warning("Error releasing client for account %s: %s", account_id, rel_err)

        # Publish response to caller via Redis
        try:
            raw_res = json.dumps(res_payload, default=str)
            await redis_client.rpush(res_key, raw_res)
            await redis_client.expire(res_key, 60)
        except Exception as res_err:
            logger.error("Failed to write RPC response to %s: %s", res_key, res_err)


async def telegram_command_consumer_loop(
    shutdown_event: asyncio.Event,
    queue_name: str | None = None,
) -> None:
    """Continuously consume and process commands from the web server."""
    settings = get_settings()
    if queue_name is None:
        queue_name = get_shard_command_queue(settings.SHARD_INDEX)

    queues_to_watch = [queue_name]
    if queue_name != DEFAULT_CMD_QUEUE:
        queues_to_watch.append(DEFAULT_CMD_QUEUE)

    logger.info(
        "Telegram command consumer loop started (Shard %d/%d, listening on %s)",
        settings.SHARD_INDEX,
        settings.TOTAL_SHARDS,
        ", ".join(queues_to_watch),
    )
    while not shutdown_event.is_set():
        try:
            item = await redis_client.blpop(queues_to_watch, timeout=2)
            if not item:
                continue

            _, data_raw = item
            # Spawn processing asynchronously so commands do not block each other
            asyncio.create_task(process_single_command(data_raw))

        except asyncio.CancelledError:
            logger.info("Telegram command consumer cancelled")
            break
        except Exception as loop_err:
            if not shutdown_event.is_set():
                logger.warning("Error in command consumer loop: %s. Continuing...", loop_err)
                await asyncio.sleep(1)
