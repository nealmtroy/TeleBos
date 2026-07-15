import logging
import uuid
from typing import Any
from datetime import datetime, timezone
import datetime as dt_module

from sqlalchemy import select, func, update, delete
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.telegram_account import TelegramAccount
from app.models.chat_folder import ChatFolder
from app.models.telegram_chat import TelegramChat
from app.services.telegram_client import client_pool
from app.utils.encryption import decrypt
from app.services.chat_service import resolve_chat_entity

logger = logging.getLogger(__name__)

async def get_messages(
    account: TelegramAccount, chat_id: int, *, limit: int = 50, offset_id: int = 0
) -> tuple[list[dict], bool]:
    """Fetch message history for a specific chat.

    Returns:
        Tuple of (messages_list, has_more).
    """
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")

    entity = await resolve_chat_entity(client, account.id, chat_id)
    me = await client.get_me()
    my_id = me.id

    messages = await client.get_messages(
        entity, limit=limit + 1, offset_id=offset_id
    )

    has_more = len(messages) > limit
    if has_more:
        messages = messages[:limit]

    result = []
    for msg in reversed(messages):  # oldest first
        sender_name = None
        sender_id = None

        if msg.sender:
            sender_id = msg.sender_id
            if hasattr(msg.sender, "first_name"):
                first = msg.sender.first_name or ""
                last = getattr(msg.sender, "last_name", "") or ""
                sender_name = f"{first} {last}".strip() or str(sender_id)
            elif hasattr(msg.sender, "title"):
                sender_name = msg.sender.title
            else:
                sender_name = str(sender_id)

        # Determine media type
        media_type = None
        media_filename = None
        if msg.media:
            media_type = _classify_media(msg.media)
            if hasattr(msg.media, "document") and msg.media.document:
                for attr in getattr(msg.media.document, "attributes", []):
                    if hasattr(attr, "file_name"):
                        media_filename = attr.file_name
                        break

        # Reply preview
        reply_preview = None
        reply_to_msg_id = None
        if msg.reply_to:
            reply_to_msg_id = getattr(msg.reply_to, "reply_to_msg_id", None)

        # Extract stripped thumbnail
        stripped_thumb_base64 = None
        if msg.media:
            from telethon.tl.types import MessageMediaPhoto, MessageMediaDocument
            from telethon.utils import stripped_photo_to_jpg
            import base64
            
            stripped_bytes = None
            if isinstance(msg.media, MessageMediaPhoto) and msg.media.photo:
                for size in getattr(msg.media.photo, "sizes", []) or []:
                    if type(size).__name__ == "PhotoStrippedSize":
                        stripped_bytes = size.bytes
                        break
            elif isinstance(msg.media, MessageMediaDocument) and msg.media.document:
                for size in getattr(msg.media.document, "thumbs", []) or []:
                    if type(size).__name__ == "PhotoStrippedSize":
                        stripped_bytes = size.bytes
                        break
                        
            if stripped_bytes:
                try:
                    jpeg_bytes = stripped_photo_to_jpg(stripped_bytes)
                    stripped_thumb_base64 = "data:image/jpeg;base64," + base64.b64encode(jpeg_bytes).decode('utf-8')
                except Exception as e:
                    logger.warning("Failed to decode stripped thumbnail for message %s: %s", msg.id, e)

        # Extract voice waveform levels
        waveform_levels = []
        if media_type == "voice" and msg.media and hasattr(msg.media, "document") and msg.media.document:
            from telethon.utils import decode_waveform
            for attr in getattr(msg.media.document, "attributes", []) or []:
                if type(attr).__name__ == "DocumentAttributeAudio" and getattr(attr, "voice", False):
                    raw_wave = getattr(attr, "waveform", None)
                    if raw_wave:
                        try:
                            waveform_levels = list(decode_waveform(raw_wave))
                        except Exception as e:
                            logger.warning("Failed to decode waveform for message %s: %s", msg.id, e)
                    break

        # Extract file size and mime_type
        file_size = None
        mime_type = None
        if msg.media and hasattr(msg.media, "document") and msg.media.document:
            file_size = msg.media.document.size
            mime_type = msg.media.document.mime_type
        elif msg.media and hasattr(msg.media, "photo") and msg.media.photo:
            sizes = getattr(msg.media.photo, "sizes", [])
            if sizes:
                largest = sizes[-1]
                file_size = getattr(largest, "size", None)
            mime_type = "image/jpeg"

        # Parse poll details if type is poll
        poll_info = None
        if media_type == "poll" and msg.media:
            poll_obj = getattr(msg.media, "poll", None)
            results_obj = getattr(msg.media, "results", None)
            if poll_obj:
                voters_map = {}
                if results_obj and getattr(results_obj, "results", []):
                    for v in results_obj.results:
                        opt_id = v.option.decode("utf-8") if isinstance(v.option, bytes) else str(v.option)
                        voters_map[opt_id] = v.voters
                
                chosen_options = []
                if results_obj and getattr(results_obj, "results", []):
                    for v in results_obj.results:
                        if getattr(v, "chosen", False):
                            chosen_options.append(v.option.decode("utf-8") if isinstance(v.option, bytes) else str(v.option))

                correct_answers = getattr(results_obj, "correct_answers", []) or []
                correct_options = [c.decode("utf-8") if isinstance(c, bytes) else str(c) for c in correct_answers]

                options = []
                for i, ans in enumerate(getattr(poll_obj, "answers", [])):
                    opt_id = ans.option.decode("utf-8") if isinstance(ans.option, bytes) else str(ans.option)
                    options.append({
                        "text": ans.text,
                        "voters": voters_map.get(opt_id, 0),
                        "chosen": opt_id in chosen_options or str(i) in chosen_options,
                        "correct": opt_id in correct_options or str(i) in correct_options,
                    })
                
                poll_info = {
                    "question": poll_obj.question,
                    "options": options,
                    "total_voters": getattr(results_obj, "total_voters", 0) if results_obj else 0,
                    "closed": bool(poll_obj.closed),
                    "is_quiz": bool(poll_obj.quiz),
                }

        # Service message detection
        is_service = False
        service_text = None
        if type(msg).__name__ == "MessageService" or getattr(msg, "action", None):
            is_service = True
            action_name = type(msg.action).__name__ if getattr(msg, "action", None) else "MessageAction"
            subj = sender_name or "Someone"
            if action_name == "MessageActionChatCreate":
                service_text = f"Group '{msg.action.title}' was created"
            elif action_name == "MessageActionChatAddUser":
                service_text = f"{subj} joined the group"
            elif action_name == "MessageActionChatDeleteUser":
                service_text = f"{subj} left the group"
            elif action_name == "MessageActionPinMessage":
                service_text = f"{subj} pinned a message"
            elif action_name == "MessageActionChatEditTitle":
                service_text = f"{subj} changed group name to '{msg.action.title}'"
            elif action_name == "MessageActionChatEditPhoto":
                service_text = f"{subj} changed group photo"
            elif action_name == "MessageActionChatDeletePhoto":
                service_text = f"{subj} removed group photo"
            else:
                service_text = f"Service message"

        result.append({
            "id": msg.id,
            "sender_id": sender_id,
            "sender_name": sender_name,
            "text": msg.text or "",
            "date": msg.date.isoformat() if msg.date else None,
            "is_outgoing": sender_id == my_id if sender_id else msg.out,
            "reply_to_msg_id": reply_to_msg_id,
            "reply_preview": reply_preview,
            "media_type": media_type,
            "media_filename": media_filename,
            "stripped_thumb": stripped_thumb_base64,
            "waveform_levels": waveform_levels,
            "file_size": file_size,
            "mime_type": mime_type,
            "poll": poll_info,
            "is_service": is_service,
            "service_text": service_text,
        })

    return result, has_more


def _classify_media(media: Any) -> str:
    """Classify Telethon media into a human-readable type string."""
    from telethon.tl.types import (
        MessageMediaPhoto,
        MessageMediaDocument,
        MessageMediaGeo,
        MessageMediaContact,
        MessageMediaPoll,
        MessageMediaWebPage,
    )

    if isinstance(media, MessageMediaPhoto):
        return "photo"
    if isinstance(media, MessageMediaDocument):
        doc = media.document
        if doc:
            mime = getattr(doc, "mime_type", "") or ""
            for attr in getattr(doc, "attributes", []):
                cls_name = type(attr).__name__
                if "Sticker" in cls_name:
                    return "sticker"
                if "Video" in cls_name:
                    if "round" in str(getattr(attr, "round_message", "")):
                        return "video_note"
                    return "video"
                if "Audio" in cls_name:
                    if getattr(attr, "voice", False):
                        return "voice"
                    return "audio"
                if "Animated" in cls_name:
                    return "animation"
            if "video" in mime:
                return "video"
            if "audio" in mime or "ogg" in mime:
                return "voice"
            return "document"
    if isinstance(media, MessageMediaGeo):
        return "location"
    if isinstance(media, MessageMediaContact):
        return "contact"
    if isinstance(media, MessageMediaPoll):
        return "poll"
    if isinstance(media, MessageMediaWebPage):
        return "link"
    return "other"



async def send_message(
    account: TelegramAccount,
    chat_id: int,
    text: str,
    reply_to: int | None = None,
) -> dict:
    """Send a text message to a chat."""
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")

    entity = await resolve_chat_entity(client, account.id, chat_id)
    msg = await client.send_message(entity, text, reply_to=reply_to)

    return {
        "id": msg.id,
        "text": msg.text,
        "date": msg.date.isoformat() if msg.date else None,
    }


async def send_media(
    account: TelegramAccount,
    chat_id: int,
    file_bytes: bytes,
    filename: str,
    caption: str | None = None,
    reply_to: int | None = None,
) -> dict:
    """Send a media file (photo, video, document, etc.) to a chat."""
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")

    entity = await resolve_chat_entity(client, account.id, chat_id)
    
    import io
    file_io = io.BytesIO(file_bytes)
    file_io.name = filename
    
    msg = await client.send_file(
        entity,
        file_io,
        caption=caption,
        reply_to=reply_to,
    )

    media_type = None
    media_filename = None
    if msg.media:
        media_type = _classify_media(msg.media)
        if hasattr(msg.media, "document") and msg.media.document:
            for attr in getattr(msg.media.document, "attributes", []):
                if hasattr(attr, "file_name"):
                    media_filename = attr.file_name
                    break

    return {
        "id": msg.id,
        "text": msg.text,
        "date": msg.date.isoformat() if msg.date else None,
        "media_type": media_type,
        "media_filename": media_filename,
    }



async def delete_messages(account: TelegramAccount, chat_id: int, message_ids: list[int], revoke: bool = True) -> None:
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")
    entity = await resolve_chat_entity(client, account.id, chat_id)
    await client.delete_messages(entity, message_ids, revoke=revoke)


async def edit_message(account: TelegramAccount, chat_id: int, message_id: int, text: str) -> dict:
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")
    entity = await resolve_chat_entity(client, account.id, chat_id)
    msg = await client.edit_message(entity, message_id, text)
    return {
        "id": msg.id,
        "text": msg.text,
        "date": msg.date.isoformat() if msg.date else None,
    }



async def get_shared_media(
    account: TelegramAccount, chat_id: int, media_type: str | None = None, limit: int = 50, offset_id: int = 0
) -> tuple[list[dict], bool, int]:
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")
    
    entity = await resolve_chat_entity(client, account.id, chat_id)
    
    flt = None
    if media_type:
        from telethon.tl import types as tl_types
        mt = media_type.lower().strip()
        if mt in ("photo", "photos"):
            flt = tl_types.InputMessagesFilterPhotos()
        elif mt in ("video", "videos"):
            flt = tl_types.InputMessagesFilterVideo()
        elif mt in ("document", "documents", "file", "files"):
            flt = tl_types.InputMessagesFilterDocument()
        elif mt in ("url", "urls", "link", "links"):
            flt = tl_types.InputMessagesFilterUrl()
        elif mt in ("music", "audio"):
            flt = tl_types.InputMessagesFilterMusic()
        elif mt in ("voice", "voices"):
            flt = tl_types.InputMessagesFilterVoice()
        elif mt in ("gif", "gifs"):
            flt = tl_types.InputMessagesFilterGif()
        elif mt in ("round_video", "round_videos", "video_note", "video_notes"):
            flt = tl_types.InputMessagesFilterRoundVideo()
            
    messages = await client.get_messages(
        entity, limit=limit + 1, offset_id=offset_id, filter=flt
    )
    
    has_more = len(messages) > limit
    if has_more:
        messages = messages[:limit]
        
    items = []
    next_offset_id = 0
    
    for msg in messages:
        m_type = "other"
        m_filename = None
        stripped_thumb = None
        file_size = None
        mime_type = None
        
        if msg.media:
            m_type = _classify_media(msg.media)
            if hasattr(msg.media, "document") and msg.media.document:
                for attr in getattr(msg.media.document, "attributes", []):
                    if hasattr(attr, "file_name"):
                        m_filename = attr.file_name
                        break
                file_size = msg.media.document.size
                mime_type = msg.media.document.mime_type
            elif hasattr(msg.media, "photo") and msg.media.photo:
                sizes = getattr(msg.media.photo, "sizes", [])
                if sizes:
                    largest = sizes[-1]
                    file_size = getattr(largest, "size", None)
                mime_type = "image/jpeg"
                
            from telethon.tl.types import MessageMediaPhoto, MessageMediaDocument
            from telethon.utils import stripped_photo_to_jpg
            import base64
            
            stripped_bytes = None
            if isinstance(msg.media, MessageMediaPhoto) and msg.media.photo:
                for size in getattr(msg.media.photo, "sizes", []) or []:
                    if type(size).__name__ == "PhotoStrippedSize":
                        stripped_bytes = size.bytes
                        break
            elif isinstance(msg.media, MessageMediaDocument) and msg.media.document:
                for size in getattr(msg.media.document, "thumbs", []) or []:
                    if type(size).__name__ == "PhotoStrippedSize":
                        stripped_bytes = size.bytes
                        break
            if stripped_bytes:
                try:
                    jpeg_bytes = stripped_photo_to_jpg(stripped_bytes)
                    stripped_thumb = "data:image/jpeg;base64," + base64.b64encode(jpeg_bytes).decode('utf-8')
                except Exception:
                    pass
        
        items.append({
            "message_id": msg.id,
            "media_type": m_type,
            "media_filename": m_filename,
            "file_size": file_size,
            "mime_type": mime_type,
            "date": msg.date.isoformat() if msg.date else None,
            "text": msg.text or "",
            "stripped_thumb": stripped_thumb,
        })
        next_offset_id = msg.id
        
    return items, has_more, next_offset_id



async def _format_telethon_messages(client, messages, my_id) -> list:
    import base64
    from telethon.tl.types import (
        MessageMediaPhoto,
        MessageMediaDocument,
        MessageMediaPoll,
        MessageMediaWebPage,
        PeerUser,
        PeerChat,
        PeerChannel
    )
    from telethon.utils import decode_waveform, stripped_photo_to_jpg
    
    result = []
    for msg in messages:
        if not hasattr(msg, "id"):
            continue
            
        sender_name = "Unknown"
        sender_id = None
        if msg.sender_id:
            sender_id = msg.sender_id
            try:
                sender_entity = await client.get_entity(msg.sender_id)
                sender_name = getattr(sender_entity, "first_name", "") or ""
                if getattr(sender_entity, "last_name", None):
                    sender_name += " " + sender_entity.last_name
                if not sender_name:
                    sender_name = getattr(sender_entity, "title", "Unknown")
            except Exception:
                sender_name = f"User {msg.sender_id}"

        media_type = _classify_media(msg.media) if msg.media else None
        
        media_filename = None
        if msg.media and hasattr(msg.media, "document") and msg.media.document:
            for attr in getattr(msg.media.document, "attributes", []) or []:
                if type(attr).__name__ == "DocumentAttributeFilename":
                    media_filename = attr.file_name
                    break
            if not media_filename:
                media_filename = f"file_{msg.media.document.id}"
                
        stripped_thumb_base64 = None
        if msg.media:
            stripped_bytes = None
            if isinstance(msg.media, MessageMediaPhoto) and msg.media.photo:
                for size in getattr(msg.media.photo, "sizes", []) or []:
                    if type(size).__name__ == "PhotoStrippedSize":
                        stripped_bytes = size.bytes
                        break
            elif isinstance(msg.media, MessageMediaDocument) and msg.media.document:
                for size in getattr(msg.media.document, "thumbs", []) or []:
                    if type(size).__name__ == "PhotoStrippedSize":
                        stripped_bytes = size.bytes
                        break
            if stripped_bytes:
                try:
                    jpeg_bytes = stripped_photo_to_jpg(stripped_bytes)
                    stripped_thumb_base64 = "data:image/jpeg;base64," + base64.b64encode(jpeg_bytes).decode('utf-8')
                except Exception:
                    pass

        waveform_levels = []
        if media_type == "voice" and msg.media and hasattr(msg.media, "document") and msg.media.document:
            for attr in getattr(msg.media.document, "attributes", []) or []:
                if type(attr).__name__ == "DocumentAttributeAudio" and getattr(attr, "voice", False):
                    raw_wave = getattr(attr, "waveform", None)
                    if raw_wave:
                        try:
                            waveform_levels = list(decode_waveform(raw_wave))
                        except Exception:
                            pass
                    break

        file_size = None
        mime_type = None
        if msg.media and hasattr(msg.media, "document") and msg.media.document:
            file_size = msg.media.document.size
            mime_type = msg.media.document.mime_type
        elif msg.media and hasattr(msg.media, "photo") and msg.media.photo:
            sizes = getattr(msg.media.photo, "sizes", [])
            if sizes:
                file_size = getattr(sizes[-1], "size", None)
            mime_type = "image/jpeg"

        poll_info = None
        if media_type == "poll" and msg.media:
            poll_obj = getattr(msg.media, "poll", None)
            results_obj = getattr(msg.media, "results", None)
            if poll_obj:
                voters_map = {}
                if results_obj and getattr(results_obj, "results", []):
                    for v in results_obj.results:
                        opt_id = v.option.decode("utf-8") if isinstance(v.option, bytes) else str(v.option)
                        voters_map[opt_id] = v.voters
                chosen_options = []
                if results_obj and getattr(results_obj, "results", []):
                    for v in results_obj.results:
                        if getattr(v, "chosen", False):
                            chosen_options.append(v.option.decode("utf-8") if isinstance(v.option, bytes) else str(v.option))
                correct_answers = getattr(results_obj, "correct_answers", []) or []
                correct_options = [c.decode("utf-8") if isinstance(c, bytes) else str(c) for c in correct_answers]
                options = []
                for i, ans in enumerate(getattr(poll_obj, "answers", [])):
                    opt_id = ans.option.decode("utf-8") if isinstance(ans.option, bytes) else str(ans.option)
                    options.append({
                        "text": ans.text,
                        "voters": voters_map.get(opt_id, 0),
                        "chosen": opt_id in chosen_options or str(i) in chosen_options,
                        "correct": opt_id in correct_options or str(i) in correct_options,
                    })
                poll_info = {
                    "question": poll_obj.question,
                    "options": options,
                    "total_voters": getattr(results_obj, "total_voters", 0) if results_obj else 0,
                    "closed": bool(poll_obj.closed),
                    "is_quiz": bool(poll_obj.quiz),
                }

        # Service message detection
        is_service = False
        service_text = None
        if type(msg).__name__ == "MessageService" or getattr(msg, "action", None):
            is_service = True
            action_name = type(msg.action).__name__ if getattr(msg, "action", None) else "MessageAction"
            subj = sender_name or "Someone"
            if action_name == "MessageActionChatCreate":
                service_text = f"Group '{msg.action.title}' was created"
            elif action_name == "MessageActionChatAddUser":
                service_text = f"{subj} joined the group"
            elif action_name == "MessageActionChatDeleteUser":
                service_text = f"{subj} left the group"
            elif action_name == "MessageActionPinMessage":
                service_text = f"{subj} pinned a message"
            elif action_name == "MessageActionChatEditTitle":
                service_text = f"{subj} changed group name to '{msg.action.title}'"
            elif action_name == "MessageActionChatEditPhoto":
                service_text = f"{subj} changed group photo"
            elif action_name == "MessageActionChatDeletePhoto":
                service_text = f"{subj} removed group photo"
            else:
                service_text = f"Service message"

        result.append({
            "id": msg.id,
            "sender_id": sender_id,
            "sender_name": sender_name,
            "text": msg.text or "",
            "date": msg.date.isoformat() if msg.date else None,
            "is_outgoing": sender_id == my_id if sender_id else msg.out,
            "reply_to_msg_id": getattr(msg, "reply_to_msg_id", None) or (getattr(msg.reply_to, "reply_to_msg_id", None) if getattr(msg, "reply_to", None) else None),
            "reply_preview": None,
            "media_type": media_type,
            "media_filename": media_filename,
            "stripped_thumb": stripped_thumb_base64,
            "waveform_levels": waveform_levels,
            "file_size": file_size,
            "mime_type": mime_type,
            "poll": poll_info,
            "is_service": is_service,
            "service_text": service_text,
        })
    return result



async def search_messages(
    account: TelegramAccount,
    chat_id: int,
    query: str | None = None,
    media_type: str | None = None,
    date_from: int | None = None,
    date_to: int | None = None
) -> list:
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")
    entity = await resolve_chat_entity(client, account.id, chat_id)
    
    from telethon.tl.functions.messages import SearchRequest
    from telethon.tl.types import (
        InputMessagesFilterEmpty,
        InputMessagesFilterPhotos,
        InputMessagesFilterVideo,
        InputMessagesFilterDocument,
        InputMessagesFilterVoice,
        InputMessagesFilterMusic,
        InputMessagesFilterUrl,
        InputMessagesFilterGif
    )
    import datetime
    
    msg_filter = InputMessagesFilterEmpty()
    if media_type == "photo":
        msg_filter = InputMessagesFilterPhotos()
    elif media_type == "video":
        msg_filter = InputMessagesFilterVideo()
    elif media_type == "document":
        msg_filter = InputMessagesFilterDocument()
    elif media_type == "voice":
        msg_filter = InputMessagesFilterVoice()
    elif media_type == "music":
        msg_filter = InputMessagesFilterMusic()
    elif media_type == "url":
        msg_filter = InputMessagesFilterUrl()
    elif media_type == "gif":
        msg_filter = InputMessagesFilterGif()
        
    min_date = None
    if date_from:
        min_date = datetime.datetime.fromtimestamp(date_from, tz=datetime.timezone.utc)
    max_date = None
    if date_to:
        max_date = datetime.datetime.fromtimestamp(date_to, tz=datetime.timezone.utc)
        
    res = await client(SearchRequest(
        peer=entity,
        q=query or "",
        filter=msg_filter,
        min_date=min_date,
        max_date=max_date,
        offset_id=0,
        add_offset=0,
        limit=50,
        max_id=0,
        min_id=0,
        hash=0
    ))
    
    me = await client.get_me()
    my_id = me.id if me else None
    return await _format_telethon_messages(client, getattr(res, "messages", []), my_id)


async def search_global_messages(account: TelegramAccount, query: str) -> list:
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")
        
    from telethon.tl.functions.messages import SearchGlobalRequest
    from telethon.tl.types import InputMessagesFilterEmpty, InputPeerEmpty
    
    res = await client(SearchGlobalRequest(
        q=query,
        filter=InputMessagesFilterEmpty(),
        min_date=None,
        max_date=None,
        offset_rate=0,
        offset_peer=InputPeerEmpty(),
        offset_id=0,
        limit=50
    ))
    
    me = await client.get_me()
    my_id = me.id if me else None
    return await _format_telethon_messages(client, getattr(res, "messages", []), my_id)


async def get_scheduled_messages(account: TelegramAccount, chat_id: int) -> list:
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")
    entity = await resolve_chat_entity(client, account.id, chat_id)
    
    from telethon.tl.functions.messages import GetScheduledHistoryRequest
    res = await client(GetScheduledHistoryRequest(peer=entity, hash=0))
    
    me = await client.get_me()
    my_id = me.id if me else None
    return await _format_telethon_messages(client, getattr(res, "messages", []), my_id)


async def send_scheduled_message(
    account: TelegramAccount,
    chat_id: int,
    text: str,
    schedule_date: int,
    reply_to: int | None = None
) -> dict:
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")
    entity = await resolve_chat_entity(client, account.id, chat_id)
    
    import datetime
    dt = datetime.datetime.fromtimestamp(schedule_date, tz=datetime.timezone.utc)
    res = await client.send_message(entity, text, schedule=dt, reply_to=reply_to)
    
    return {
        "id": res.id,
        "text": res.message or "",
        "date": res.date.isoformat() if res.date else None,
    }


async def delete_scheduled_messages(account: TelegramAccount, chat_id: int, message_ids: list[int]) -> None:
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")
    entity = await resolve_chat_entity(client, account.id, chat_id)
    
    from telethon.tl.functions.messages import DeleteScheduledMessagesRequest
    await client(DeleteScheduledMessagesRequest(peer=entity, id=message_ids))


async def send_voice_note(account: TelegramAccount, chat_id: int, file_path: str) -> dict:
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")
    entity = await resolve_chat_entity(client, account.id, chat_id)
    
    res = await client.send_file(entity, file_path, voice_note=True)
    return {
        "id": res.id,
        "text": res.message or "",
        "date": res.date.isoformat() if res.date else None,
    }


