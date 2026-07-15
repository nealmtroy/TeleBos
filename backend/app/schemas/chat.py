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


class DeleteMessageRequest(BaseModel):
    revoke: bool = True


class BatchDeleteMessagesRequest(BaseModel):
    message_ids: list[int]
    revoke: bool = True



class EditMessageRequest(BaseModel):
    text: str


class ForwardMessagesRequest(BaseModel):
    message_ids: list[int]
    to_chat_ids: list[int]


class SendReactionRequestSchema(BaseModel):
    reaction: str | None = None


class PinMessageRequest(BaseModel):
    silent: bool = False
    pm_oneside: bool = False


class PromoteMemberRequest(BaseModel):
    change_info: bool | None = None
    post_messages: bool | None = None
    edit_messages: bool | None = None
    delete_messages: bool | None = None
    ban_users: bool | None = None
    invite_users: bool | None = None
    pin_messages: bool | None = None
    add_admins: bool | None = None
    anonymous: bool | None = None
    manage_call: bool | None = None
    manage_topics: bool | None = None
    rank: str | None = None


class UpdateGroupPermissionsRequest(BaseModel):
    view_messages: bool | None = None
    send_messages: bool | None = None
    send_media: bool | None = None
    send_stickers: bool | None = None
    send_gifs: bool | None = None
    send_games: bool | None = None
    send_inline: bool | None = None
    embed_links: bool | None = None
    send_polls: bool | None = None
    change_info: bool | None = None
    invite_users: bool | None = None
    pin_messages: bool | None = None
    manage_topics: bool | None = None
    send_photos: bool | None = None
    send_videos: bool | None = None
    send_roundvideos: bool | None = None
    send_audios: bool | None = None
    send_voices: bool | None = None
    send_docs: bool | None = None
    send_plain: bool | None = None


class MuteChatRequest(BaseModel):
    duration: int | None = None  # seconds, None = indefinite


class EditChatInfoRequest(BaseModel):
    title: str | None = None
    about: str | None = None


class SharedMediaItem(BaseModel):
    message_id: int
    media_type: str
    media_filename: str | None = None
    file_size: int | None = None
    mime_type: str | None = None
    date: datetime
    text: str | None = None
    stripped_thumb: str | None = None


class SharedMediaResponse(BaseModel):
    items: list[SharedMediaItem]
    has_more: bool
    next_offset_id: int


class ChatSearchResponse(BaseModel):
    chats: list[ChatItem]
    messages: list[MessageItem]


class GroupMemberItem(BaseModel):
    user_id: int
    first_name: str | None = None
    last_name: str | None = None
    username: str | None = None
    phone: str | None = None
    is_bot: bool = False
    is_admin: bool = False
    is_creator: bool = False
    rank: str | None = None


class GroupMemberListResponse(BaseModel):
    members: list[GroupMemberItem]
    total: int


class GroupPermissionsResponse(BaseModel):
    view_messages: bool
    send_messages: bool
    send_media: bool
    send_stickers: bool
    send_gifs: bool
    send_games: bool
    send_inline: bool
    embed_links: bool
    send_polls: bool
    change_info: bool
    invite_users: bool
    pin_messages: bool
    manage_topics: bool
    send_photos: bool
    send_videos: bool
    send_roundvideos: bool
    send_audios: bool
    send_voices: bool
    send_docs: bool
    send_plain: bool


class StickerPackItem(BaseModel):
    id: str
    title: str
    short_name: str
    count: int
    archived: bool
    official: bool


class StickerPacksResponse(BaseModel):
    packs: list[StickerPackItem]


class InviteLinkItem(BaseModel):
    link: str
    title: str | None = None
    creator_id: int | None = None
    date: datetime
    expire_date: datetime | None = None
    usage_limit: int | None = None
    usage: int | None = None
    request_needed: bool = False
    revoked: bool = False
    permanent: bool = False


class InviteLinkListResponse(BaseModel):
    links: list[InviteLinkItem]


class CreateInviteLinkRequest(BaseModel):
    title: str | None = None
    expire_date: int | None = None  # UNIX timestamp or None
    usage_limit: int | None = None


class CreatePollRequest(BaseModel):
    question: str
    options: list[str]
    is_anonymous: bool = True
    is_quiz: bool = False
    correct_option_idx: int | None = None


class VotePollRequest(BaseModel):
    options: list[str]


class StickerItem(BaseModel):
    id: str
    access_hash: str
    file_reference: str
    width: int
    height: int
    mime_type: str
    file_size: int


class StickerSetResponse(BaseModel):
    set_id: str
    access_hash: str
    title: str
    short_name: str
    stickers: list[StickerItem]


class SendStickerRequest(BaseModel):
    document_id: str
    access_hash: str
    file_reference: str | None = None


class SendScheduledMessageRequest(BaseModel):
    text: str
    schedule_date: int
    reply_to: int | None = None


class GifItem(BaseModel):
    id: str
    access_hash: str
    file_reference: str
    width: int | None = None
    height: int | None = None
    thumb_url: str | None = None


class GifListResponse(BaseModel):
    gifs: list[GifItem]
    next_offset: str | None = None


class SaveGifRequest(BaseModel):
    document_id: str
    access_hash: str
    unsave: bool = False


class SendGifRequest(BaseModel):
    document_id: str
    access_hash: str
    file_reference: str


class StickerSearchResponse(BaseModel):
    stickers: list[StickerItem]
    sets: list[StickerSetResponse]




