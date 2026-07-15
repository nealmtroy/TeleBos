import logging
from typing import Any

from telethon.tl.functions.messages import GetSavedGifsRequest, SaveGifRequest, GetInlineBotResultsRequest
from telethon.tl.types import InputDocument, InputPeerEmpty, DocumentAttributeVideo, DocumentAttributeImageSize
from app.models.telegram_account import TelegramAccount
from app.services.telegram_client import client_pool
from app.utils.encryption import decrypt
from app.services.chat_service import resolve_chat_entity

logger = logging.getLogger(__name__)

async def get_saved_gifs(account: TelegramAccount) -> list[dict]:
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")

    # Call messages.getSavedGifs
    from telethon.tl.functions.messages import GetSavedGifsRequest
    res = await client(GetSavedGifsRequest(hash=0))
    
    gifs = []
    # res is MessagesSavedGifs
    for doc in getattr(res, "gifs", []):
        w, h = None, None
        for attr in getattr(doc, "attributes", []) or []:
            if isinstance(attr, DocumentAttributeVideo):
                w, h = attr.w, attr.h
            elif isinstance(attr, DocumentAttributeImageSize):
                w, h = attr.w, attr.h
        
        gifs.append({
            "id": str(doc.id),
            "access_hash": str(doc.access_hash),
            "file_reference": getattr(doc, "file_reference", b"").hex(),
            "width": w,
            "height": h,
            "thumb_url": None  # Will be requested via download endpoint
        })
    return gifs


async def search_gifs(account: TelegramAccount, query: str, offset: str = "") -> dict:
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")

    # Resolve @gif inline bot
    try:
        bot = await client.get_input_entity('gif')
    except Exception as e:
        logger.warning(f"Failed to resolve @gif bot input entity: {e}, attempting fallback get_entity")
        bot = await client.get_entity('gif')

    # Query inline bot results
    res = await client(GetInlineBotResultsRequest(
        bot=bot,
        peer=InputPeerEmpty(),
        query=query,
        offset=offset
    ))
    
    gifs = []
    for r in getattr(res, "results", []):
        doc = getattr(r, "document", None)
        if doc:
            w, h = None, None
            for attr in getattr(doc, "attributes", []) or []:
                if isinstance(attr, DocumentAttributeVideo):
                    w, h = attr.w, attr.h
                elif isinstance(attr, DocumentAttributeImageSize):
                    w, h = attr.w, attr.h
            
            gifs.append({
                "id": str(doc.id),
                "access_hash": str(doc.access_hash),
                "file_reference": getattr(doc, "file_reference", b"").hex(),
                "width": w,
                "height": h,
                "thumb_url": None
            })
            
    return {
        "gifs": gifs,
        "next_offset": getattr(res, "next_offset", None)
    }


async def save_gif(account: TelegramAccount, document_id: int | str, access_hash: int | str, unsave: bool = False) -> None:
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")

    document_id = int(document_id)
    access_hash = int(access_hash)
    doc = InputDocument(id=document_id, access_hash=access_hash, file_reference=b'')
    
    await client(SaveGifRequest(id=doc, unsave=unsave))


async def download_gif(account: TelegramAccount, document_id: int | str, access_hash: int | str, file_reference: str | None = None) -> tuple[bytes, str]:
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
        raise RuntimeError("Failed to download GIF media.")
        
    # Standard Telegram GIFs are typically returned as video/mp4
    return file_bytes, "video/mp4"


async def send_gif(account: TelegramAccount, chat_id: int, document_id: int | str, access_hash: int | str, file_reference: str | None = None) -> dict:
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")
    entity = await resolve_chat_entity(client, account.id, chat_id)
    
    document_id = int(document_id)
    access_hash = int(access_hash)
    file_ref_bytes = bytes.fromhex(file_reference) if file_reference else b''
    
    doc = InputDocument(id=document_id, access_hash=access_hash, file_reference=file_ref_bytes)
    res = await client.send_file(entity, doc)
    return {
        "id": res.id,
        "text": res.message or "",
        "date": res.date.isoformat() if res.date else None,
    }
