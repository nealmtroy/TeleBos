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

async def send_poll(
    account: TelegramAccount,
    chat_id: int,
    question: str,
    options: list[str],
    is_anonymous: bool = True,
    is_quiz: bool = False,
    correct_option_idx: int | None = None
) -> dict:
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")
    entity = await resolve_chat_entity(client, account.id, chat_id)
    
    import random
    from telethon.tl.types import InputMediaPoll, Poll, PollAnswer
    
    answers = [PollAnswer(text=opt, option=bytes([i])) for i, opt in enumerate(options)]
    poll = Poll(
        id=random.randint(1, 100000000),
        question=question,
        answers=answers,
        closed=False,
        public_voters=not is_anonymous,
        multiple_choice=False,
        quiz=is_quiz
    )
    
    correct_answers = None
    if is_quiz and correct_option_idx is not None:
        correct_answers = [bytes([correct_option_idx])]
        
    media = InputMediaPoll(poll=poll, correct_answers=correct_answers)
    res = await client.send_message(entity, file=media)
    
    return {
        "id": res.id,
        "text": res.message or "",
        "date": res.date.isoformat() if res.date else None,
    }


async def vote_poll(account: TelegramAccount, chat_id: int, msg_id: int, options: list[str]) -> None:
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")
    entity = await resolve_chat_entity(client, account.id, chat_id)
    
    from telethon.tl.functions.messages import SendVoteRequest
    opt_bytes = [opt.encode("utf-8") if isinstance(opt, str) else opt for opt in options]
    await client(SendVoteRequest(peer=entity, msg_id=msg_id, options=opt_bytes))


