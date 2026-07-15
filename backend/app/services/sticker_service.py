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

async def get_installed_sticker_packs(account: TelegramAccount) -> list:
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")
        
    from telethon.tl.functions.messages import GetAllStickersRequest
    res = await client(GetAllStickersRequest(hash=0))
    
    packs = []
    for s in getattr(res, "sets", []):
        packs.append({
            "id": str(s.id),
            "title": getattr(s, "title", "Stickers") or "Stickers",
            "short_name": getattr(s, "short_name", "") or "",
            "count": getattr(s, "count", 0) or 0,
            "archived": bool(getattr(s, "archived", False)),
            "official": bool(getattr(s, "official", False)),
        })
    return packs



async def get_sticker_set(account: TelegramAccount, short_name: str) -> dict:
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")
    from telethon.tl.functions.messages import GetStickerSetRequest
    from telethon.tl.types import InputStickerSetShortName, DocumentAttributeImageSize, DocumentAttributeVideo
    
    res = await client(GetStickerSetRequest(
        stickerset=InputStickerSetShortName(short_name=short_name),
        hash=0
    ))
    
    stickers = []
    for doc in getattr(res, "documents", []):
        w, h = 512, 512
        for attr in getattr(doc, "attributes", []):
            if isinstance(attr, DocumentAttributeImageSize):
                w, h = attr.w, attr.h
            elif isinstance(attr, DocumentAttributeVideo):
                w, h = attr.w, attr.h
        stickers.append({
            "id": str(doc.id),
            "access_hash": str(doc.access_hash),
            "file_reference": getattr(doc, "file_reference", b"").hex(),
            "width": w,
            "height": h,
            "mime_type": doc.mime_type,
            "file_size": doc.size,
        })
        
    s_set = getattr(res, "set", None)
    return {
        "set_id": str(getattr(s_set, "id", 0)) if s_set else "0",
        "access_hash": str(getattr(s_set, "access_hash", 0)) if s_set else "0",
        "title": getattr(s_set, "title", "") if s_set else "",
        "short_name": getattr(s_set, "short_name", "") if s_set else "",
        "stickers": stickers
    }


async def download_sticker(account: TelegramAccount, document_id: int | str, access_hash: int | str, file_reference: str | None = None) -> bytes:
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")
    
    document_id = int(document_id)
    access_hash = int(access_hash)
    file_ref_bytes = bytes.fromhex(file_reference) if file_reference else b''
    from telethon.tl.types import InputDocumentFileLocation
    doc = InputDocumentFileLocation(id=document_id, access_hash=access_hash, file_reference=file_ref_bytes, thumb_size='')
    file_bytes = await client.download_file(doc, file=bytes)
    if not file_bytes:
        raise RuntimeError("Failed to download sticker media.")
    return file_bytes



async def send_sticker(account: TelegramAccount, chat_id: int, document_id: int | str, access_hash: int | str, file_reference: str | None = None) -> dict:
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")
    entity = await resolve_chat_entity(client, account.id, chat_id)
    
    document_id = int(document_id)
    access_hash = int(access_hash)
    file_ref_bytes = bytes.fromhex(file_reference) if file_reference else b''
    from telethon.tl.types import InputDocument
    doc = InputDocument(id=document_id, access_hash=access_hash, file_reference=file_ref_bytes)
    res = await client.send_file(entity, doc)
    return {
        "id": res.id,
        "text": res.message or "",
        "date": res.date.isoformat() if res.date else None,
    }


async def search_stickers(account: TelegramAccount, query: str) -> dict:
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")
        
    from telethon.tl.functions.messages import GetStickersRequest, SearchStickerSetsRequest
    from telethon.tl.types import DocumentAttributeImageSize, DocumentAttributeVideo
    
    is_emoticon = False
    if query:
        first_char = ord(query[0])
        if first_char > 127:
            is_emoticon = True

    stickers = []
    sets = []
    
    if is_emoticon:
        res = await client(GetStickersRequest(emoticon=query, hash=0))
        for doc in getattr(res, "stickers", []):
            w, h = 512, 512
            for attr in getattr(doc, "attributes", []) or []:
                if isinstance(attr, DocumentAttributeImageSize):
                    w, h = attr.w, attr.h
                elif isinstance(attr, DocumentAttributeVideo):
                    w, h = attr.w, attr.h
            stickers.append({
                "id": str(doc.id),
                "access_hash": str(doc.access_hash),
                "file_reference": getattr(doc, "file_reference", b"").hex(),
                "width": w,
                "height": h,
                "mime_type": doc.mime_type,
                "file_size": doc.size,
            })
    else:
        res = await client(SearchStickerSetsRequest(q=query, hash=0))
        for covered in getattr(res, "sets", []):
            s_set = getattr(covered, "set", None)
            if s_set:
                cover_docs = []
                doc_list = []
                if hasattr(covered, "cover") and covered.cover:
                    doc_list.append(covered.cover)
                elif hasattr(covered, "covers") and covered.covers:
                    doc_list.extend(covered.covers)
                
                for doc in doc_list:
                    w, h = 512, 512
                    for attr in getattr(doc, "attributes", []) or []:
                        if isinstance(attr, DocumentAttributeImageSize):
                            w, h = attr.w, attr.h
                        elif isinstance(attr, DocumentAttributeVideo):
                            w, h = attr.w, attr.h
                    cover_docs.append({
                        "id": str(doc.id),
                        "access_hash": str(doc.access_hash),
                        "file_reference": getattr(doc, "file_reference", b"").hex(),
                        "width": w,
                        "height": h,
                        "mime_type": doc.mime_type,
                        "file_size": doc.size,
                    })

                sets.append({
                    "set_id": str(s_set.id),
                    "access_hash": str(s_set.access_hash),
                    "title": getattr(s_set, "title", ""),
                    "short_name": getattr(s_set, "short_name", ""),
                    "stickers": cover_docs
                })

    return {
        "stickers": stickers,
        "sets": sets
    }


