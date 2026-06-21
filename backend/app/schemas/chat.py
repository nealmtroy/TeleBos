"""Chat-related Pydantic schemas."""

from datetime import datetime
from uuid import UUID
from pydantic import BaseModel
from typing import Any


class ChatItem(BaseModel):
    chat_id: int
    title: str | None
    username: str | None
    chat_type: str  # user, group, supergroup, channel, bot
    last_message: str | None
    last_message_time: datetime | None
    unread_count: int = 0
    photo: Any | None = None
    is_muted: bool = False
    is_pinned: bool = False
    folder_id: int | None = None  # 0=main, 1=archived, >=2=custom folder
    is_archived: bool = False
    is_creator: bool = False


class ChatListResponse(BaseModel):
    chats: list[ChatItem]
    total: int
    page: int
    page_size: int


# ── Messages ─────────────────────────────────────────────────────────────────


class MessageItem(BaseModel):
    id: int
    sender_id: int | None = None
    sender_name: str | None = None
    text: str | None = None
    date: datetime
    is_outgoing: bool = False
    reply_to_msg_id: int | None = None
    reply_preview: str | None = None
    media_type: str | None = None  # photo, video, document, sticker, voice, etc.
    media_filename: str | None = None


class MessageListResponse(BaseModel):
    messages: list[MessageItem]
    chat_id: int
    has_more: bool = False


class SendMessageRequest(BaseModel):
    text: str
    reply_to: int | None = None


class SendMessageResponse(BaseModel):
    id: int
    text: str | None
    date: datetime
    media_type: str | None = None
    media_filename: str | None = None


# ── Folders ──────────────────────────────────────────────────────────────────


class FolderCreate(BaseModel):
    title: str
    emoji: str | None = None
    color: int | None = None
    included_chat_ids: list[int] = []
    excluded_chat_ids: list[int] = []
    pinned_chat_ids: list[int] = []


class FolderUpdate(BaseModel):
    title: str | None = None
    emoji: str | None = None
    color: int | None = None
    included_chat_ids: list[int] | None = None
    excluded_chat_ids: list[int] | None = None
    pinned_chat_ids: list[int] | None = None


class FolderResponse(BaseModel):
    id: UUID
    account_id: UUID
    folder_id: int
    title: str
    emoji: str | None
    color: int | None
    included_chat_ids: list[int]
    excluded_chat_ids: list[int]
    pinned_chat_ids: list[int]

    model_config = {"from_attributes": True}


class FolderListResponse(BaseModel):
    folders: list[FolderResponse]


# ── Join Chat ──────────────────────────────────────────────────────────────────


class JoinChatRequest(BaseModel):
    """Request to join a Telegram group or channel."""
    identifier: str
    """Username (with or without @) or invite link (t.me/+xxx, t.me/joinchat/xxx)."""


class JoinChatResponse(BaseModel):
    chat_id: int
    title: str
    username: str | None = None
    chat_type: str


# ── Batch actions ──────────────────────────────────────────────────────────────


class BatchChatActionRequest(BaseModel):
    chat_ids: list[int]
