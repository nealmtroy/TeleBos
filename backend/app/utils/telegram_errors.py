"""Telegram error classification for broadcast and invite logs."""

import re
from telethon.errors import (
    FloodWaitError,
    ChatWriteForbiddenError,
    ChatAdminRequiredError,
    UserBannedInChannelError,
    UsernameInvalidError,
    UsernameNotOccupiedError,
    InviteHashExpiredError,
    InviteHashInvalidError,
    SlowModeWaitError,
    ChannelPrivateError,
    UserNotParticipantError,
    PhoneNumberBannedError,
    MessageTooLongError,
    MessageEmptyError,
    AuthKeyUnregisteredError,
    AuthKeyDuplicatedError,
    SessionRevokedError,
    UserDeactivatedBanError,
    ChatForbiddenError,
)

# Invite-specific errors — import with fallback for older Telethon versions
try:
    from telethon.errors import UserPrivacyRestrictedError
except ImportError:
    UserPrivacyRestrictedError = None

try:
    from telethon.errors import PeerFloodError
except ImportError:
    PeerFloodError = None

try:
    from telethon.errors import UserChannelsTooMuchError
except ImportError:
    UserChannelsTooMuchError = None

try:
    from telethon.errors import InputUserDeactivatedError
except ImportError:
    InputUserDeactivatedError = None

try:
    from telethon.errors import UserNotMutualContactError
except ImportError:
    UserNotMutualContactError = None

try:
    from telethon.errors import UserAlreadyParticipantError
except ImportError:
    UserAlreadyParticipantError = None

try:
    from telethon.errors import InviteRequestSentError
except ImportError:
    InviteRequestSentError = None

try:
    from telethon.errors import UserAlreadyInvitedError
except ImportError:
    UserAlreadyInvitedError = None

try:
    from telethon.errors import ChatAdminInviteRequiredError
except ImportError:
    ChatAdminInviteRequiredError = None

try:
    from telethon.errors import InviteForbiddenWithJoinasError
except ImportError:
    InviteForbiddenWithJoinasError = None

try:
    from telethon.errors import UserKickedError
except ImportError:
    UserKickedError = None

try:
    from telethon.errors import ChatGuestSendForbiddenError
except ImportError:
    ChatGuestSendForbiddenError = None


# ── AddChatUserRequest / InviteToChannelRequest specific errors ────────
try:
    from telethon.errors import ChatIdInvalidError
except ImportError:
    ChatIdInvalidError = None

try:
    from telethon.errors import UserIdInvalidError
except ImportError:
    UserIdInvalidError = None

try:
    from telethon.errors import PeerIdInvalidError
except ImportError:
    PeerIdInvalidError = None

try:
    from telethon.errors import UsersTooMuchError
except ImportError:
    UsersTooMuchError = None

try:
    from telethon.errors import ChannelIdInvalidError
except ImportError:
    ChannelIdInvalidError = None

try:
    from telethon.errors import ChannelInvalidError
except ImportError:
    ChannelInvalidError = None

try:
    from telethon.errors import ChannelTooBigError
except ImportError:
    ChannelTooBigError = None

try:
    from telethon.errors import ChannelsTooMuchError as ChannelsTooMuchError_
except ImportError:
    ChannelsTooMuchError_ = None


def classify_telegram_error(exc: Exception) -> tuple[str, str]:
    """
    Classify a Telegram exception into an error_type and a human-readable message.

    Returns:
        Tuple of (error_type, error_message)
    """
    if isinstance(exc, FloodWaitError):
        wait = exc.seconds if hasattr(exc, "seconds") else "unknown"
        return ("flood", f"Flood wait: {wait} seconds")

    if isinstance(exc, SlowModeWaitError):
        wait = exc.seconds if hasattr(exc, "seconds") else "unknown"
        return ("slowmode", f"Slowmode wait: {wait} seconds")

    if isinstance(exc, ChatWriteForbiddenError):
        # This is the base "CHAT_WRITE_FORBIDDEN" classification.
        # But Telethon also has ChatGuestSendForbiddenError — check that first.
        return ("admin_only", "Only admins can send messages in this group")

    if ChatGuestSendForbiddenError and isinstance(exc, ChatGuestSendForbiddenError):
        return ("guest_restricted", "Account not yet joined or guest restricted — may need to join first or wait for new-member probation to end")

    if isinstance(exc, ChatAdminRequiredError):
        return ("admin_only", "Admin privileges required to perform this action")

    if isinstance(exc, UserBannedInChannelError):
        return ("banned", "User is banned from this group/channel")

    if isinstance(exc, (UsernameInvalidError, UsernameNotOccupiedError)):
        return ("invalid_username", "Username does not exist or is invalid")

    if isinstance(exc, (InviteHashExpiredError, InviteHashInvalidError)):
        return ("invalid_link", "Invite link is expired or invalid")

    if isinstance(exc, ChannelPrivateError):
        return ("private_channel", "Channel is private and account is not a member")

    if isinstance(exc, UserNotParticipantError):
        return ("not_member", "Account is not a member of this group/channel")

    if isinstance(exc, PhoneNumberBannedError):
        return ("phone_banned", "Phone number is banned from Telegram")

    if isinstance(exc, MessageTooLongError):
        return ("message_too_long", "Message text is too long for Telegram (limit is 4096 characters)")

    if isinstance(exc, MessageEmptyError):
        return ("message_empty", "Message text is empty")

    if isinstance(exc, (AuthKeyUnregisteredError, AuthKeyDuplicatedError, SessionRevokedError)):
        return ("session_revoked", "Telegram session has been revoked or expired")

    if isinstance(exc, UserDeactivatedBanError):
        return ("user_deactivated", "The sending account has been banned/deactivated by Telegram")

    if isinstance(exc, ChatForbiddenError):
        return ("channel_forbidden", "Account was kicked from or is forbidden to access this channel")

    # ── Invite-specific errors ────────────────────────────────────────────
    if UserPrivacyRestrictedError and isinstance(exc, UserPrivacyRestrictedError):
        return ("privacy_restricted", "User's privacy settings prevent adding them to groups")

    if PeerFloodError and isinstance(exc, PeerFloodError):
        return ("peer_flood", "Too many invite requests — Telegram rate limit (PeerFlood)")

    if UserAlreadyParticipantError and isinstance(exc, UserAlreadyParticipantError):
        return ("already_member", "User is already a member of the destination group")

    if UserChannelsTooMuchError and isinstance(exc, UserChannelsTooMuchError):
        return ("too_many_channels", "User has joined too many channels/groups")

    if InputUserDeactivatedError and isinstance(exc, InputUserDeactivatedError):
        return ("deactivated", "User account has been deactivated")

    if UserNotMutualContactError and isinstance(exc, UserNotMutualContactError):
        return ("not_mutual_contact", "User is not a mutual contact — cannot invite")

    if UserKickedError and isinstance(exc, UserKickedError):
        return ("user_kicked", "User was previously kicked from the group")

    # ── New invite-related errors that were missing ──────────────────────────
    if InviteRequestSentError and isinstance(exc, InviteRequestSentError):
        return ("invite_request_sent", "Invite request sent to admins for approval")

    if UserAlreadyInvitedError and isinstance(exc, UserAlreadyInvitedError):
        return ("already_invited", "User was already invited (pending approval)")

    if ChatAdminInviteRequiredError and isinstance(exc, ChatAdminInviteRequiredError):
        return ("admin_invite_only", "Only admins can add members to this group/channel")

    if InviteForbiddenWithJoinasError and isinstance(exc, InviteForbiddenWithJoinasError):
        return ("invite_forbidden", "Cannot invite — group/channel does not allow direct invites")

    # ── Chat/Channel ID & validation errors ────────────────────────────────────
    if ChatIdInvalidError and isinstance(exc, ChatIdInvalidError):
        return ("bad_request", "Invalid chat ID — make sure it's a basic group, not a channel/supergroup")

    if UserIdInvalidError and isinstance(exc, UserIdInvalidError):
        return ("user_id_invalid", "Invalid user ID — cannot invite this user (deleted/restricted)")

    if PeerIdInvalidError and isinstance(exc, PeerIdInvalidError):
        return ("bad_request", "Invalid peer ID — make sure the user/chat exists")

    if UsersTooMuchError and isinstance(exc, UsersTooMuchError):
        return ("too_many_users", "Destination group has reached the maximum number of users")

    if ChannelIdInvalidError and isinstance(exc, ChannelIdInvalidError):
        return ("bad_request", "Invalid channel ID — make sure the channel exists")

    if ChannelInvalidError and isinstance(exc, ChannelInvalidError):
        return ("bad_request", "Invalid channel object — make sure you're using the right request type")

    if ChannelTooBigError and isinstance(exc, ChannelTooBigError):
        return ("channel_too_big", "Channel is too large to add more members")

    if ChannelsTooMuchError_ and isinstance(exc, ChannelsTooMuchError_):
        return ("too_many_channels", "Account has joined too many channels/groups")

    # Generic fallback: try to parse common RPC errors
    msg = str(exc)
    if "FLOOD_WAIT" in msg:
        match = re.search(r"FLOOD_WAIT_(\d+)", msg)
        seconds = match.group(1) if match else "?"
        return ("flood", f"Flood wait: {seconds} seconds")

    if "CHAT_WRITE_FORBIDDEN" in msg:
        return ("admin_only", "Only admins can send messages here")

    if "USER_BANNED" in msg:
        return ("banned", "User is banned from this chat")

    if "USERNAME_NOT_OCCUPIED" in msg:
        return ("invalid_username", "Username does not exist")

    if "SLOWMODE_WAIT" in msg:
        return ("slowmode", "Slowmode active in this group")

    if "USER_PRIVACY_RESTRICTED" in msg:
        return ("privacy_restricted", "User's privacy settings prevent adding them")

    if "PEER_FLOOD" in msg:
        return ("peer_flood", "Too many requests — PeerFlood")

    if "USER_ALREADY_PARTICIPANT" in msg:
        return ("already_member", "User is already a member")

    if "CHAT_ID_INVALID" in msg:
        return ("bad_request", "Invalid chat ID — wrong request type for this entity")

    if "CHANNEL_INVALID" in msg:
        return ("bad_request", "Invalid channel object — wrong request type for this entity")

    if "PEER_ID_INVALID" in msg:
        return ("bad_request", "Invalid peer ID — the user or chat does not exist")

    if "USER_ID_INVALID" in msg:
        return ("bad_request", "Invalid user ID")

    if "USERS_TOO_MUCH" in msg:
        return ("too_many_users", "Destination has reached max capacity")

    if "CHANNEL_ID_INVALID" in msg:
        return ("bad_request", "Invalid channel ID")

    if "CHANNEL_TOO_BIG" in msg:
        return ("channel_too_big", "Channel is too large")

    if "CHANNELS_TOO_MUCH" in msg:
        return ("too_many_channels", "Account has joined too many channels/groups")

    if "USER_CHANNELS_TOO_MUCH" in msg:
        return ("too_many_channels", "User has joined too many channels")

    if "USER_NOT_MUTUAL_CONTACT" in msg:
        return ("not_mutual_contact", "Not a mutual contact")

    if "USER_KICKED" in msg:
        return ("user_kicked", "User was kicked from this group")

    if "INPUT_USER_DEACTIVATED" in msg:
        return ("deactivated", "User account is deactivated")

    if "CHAT_WRITE_FORBIDDEN" in msg:
        # Could be permanent admin_only or temporary new-member restriction.
        # Default to a softer "admin_only" so the caller decides retryability.
        if "need to join" in msg.lower() or "join the group" in msg.lower():
            return ("must_join_discussion", "You must join the discussion group before commenting")
        return ("admin_only", "Only admins can send messages in this group")

    if "JOIN_GROUP" in msg or "join the discussion" in msg.lower() or "before commenting" in msg.lower():
        return ("must_join_discussion", "You must join the discussion group before commenting")

    return ("unknown", msg[:500])

