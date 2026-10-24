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
    PhoneNumberInvalidError,
    PhoneNumberFloodError,
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

try:
    from telethon.errors import FreshResetAuthorisationForbiddenError
except ImportError:
    FreshResetAuthorisationForbiddenError = None

try:
    from telethon.errors import SendCodeUnavailableError
except ImportError:
    SendCodeUnavailableError = None

try:
    from telethon.errors import (
        TopicClosedError,
        TopicDeletedError,
        ForumClosedError,
        ChatSendMediaForbiddenError,
        ChatSendStickersForbiddenError,
        ChatSendGifsForbiddenError,
        ChatRestrictedError,
        UserIsBlockedError,
        SessionExpiredError,
        UserDeactivatedError,
    )
except ImportError:
    TopicClosedError = None
    TopicDeletedError = None
    ForumClosedError = None
    ChatSendMediaForbiddenError = None
    ChatSendStickersForbiddenError = None
    ChatSendGifsForbiddenError = None
    ChatRestrictedError = None
    UserIsBlockedError = None
    SessionExpiredError = None
    UserDeactivatedError = None



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

try:
    from telethon.errors import FrozenMethodInvalidError
except ImportError:
    FrozenMethodInvalidError = None


class TelegramRateLimitError(RuntimeError):
    """A Telegram rate-limit surfaced by a service wrapper as a RuntimeError.

    Helpers such as ``join_chat`` catch telethon's ``FloodWaitError`` /
    ``PeerFloodError`` and re-raise a ``RuntimeError`` so HTTP callers return a
    400 rather than a 500. That rewrite previously erased the classification —
    ``classify_telegram_error`` only matched the telethon types — so worker jobs
    (auto-join) could not back off. This type preserves the kind and the
    requested wait so the classifier still recovers them.
    """

    def __init__(self, error_type: str, seconds: float = 0, message: str | None = None):
        self.error_type = error_type
        self.seconds = int(seconds or 0)
        super().__init__(message or f"{error_type}: wait {self.seconds}s")


def classify_telegram_error(exc: Exception) -> tuple[str, str]:
    """
    Classify a Telegram exception into an error_type and a human-readable message.

    Returns:
        Tuple of (error_type, error_message)
    """
    # FrozenMethodInvalidError subclasses FloodError, not FloodWaitError, so it
    # must be checked before the FloodWaitError branch below or it is missed.
    # It means Telegram froze this account and disabled the specific method
    # (PYTHON-FASTAPI-12).
    if FrozenMethodInvalidError and isinstance(exc, FrozenMethodInvalidError):
        return (
            "account_frozen",
            "This Telegram account is frozen by Telegram and this action is "
            "temporarily unavailable. Wait a few hours and try again.",
        )

    # Check both the outer exception and any wrapped cause
    cause_exc = getattr(exc, "__cause__", None)
    for candidate in (exc, cause_exc):
        if candidate is None:
            continue
        if isinstance(candidate, FloodWaitError):
            wait = candidate.seconds if hasattr(candidate, "seconds") else "unknown"
            return ("flood", f"Flood wait: {wait} seconds")
        if isinstance(candidate, TelegramRateLimitError):
            if candidate.error_type == "peer_flood":
                return ("peer_flood", str(candidate))
            return ("flood", f"Flood wait: {candidate.seconds} seconds")

    if isinstance(exc, SlowModeWaitError):
        wait = exc.seconds if hasattr(exc, "seconds") else "unknown"
        return ("slowmode", f"Slowmode wait: {wait} seconds")

    if isinstance(exc, ChatWriteForbiddenError):
        # This is the base "CHAT_WRITE_FORBIDDEN" classification.
        # But Telethon also has ChatGuestSendForbiddenError — check that first.
        return ("admin_only", "Only admins can send messages in this group")

    if ChatGuestSendForbiddenError and isinstance(exc, ChatGuestSendForbiddenError):
        return ("guest_restricted", "Account not yet joined or guest restricted — may need to join first or wait for new-member probation to end")

    if FreshResetAuthorisationForbiddenError and isinstance(exc, FreshResetAuthorisationForbiddenError):
        return ("fresh_reset_forbidden", "The current session is too new and cannot be used to reset other authorizations yet. Please wait a few hours or days before trying again.")


    if isinstance(exc, ChatAdminRequiredError):
        return ("admin_only", "Admin privileges required to perform this action")

    if isinstance(exc, UserBannedInChannelError):
        return ("banned", "Account is restricted by Telegram Spambot or banned from this group/channel")

    if isinstance(exc, (UsernameInvalidError, UsernameNotOccupiedError)):
        return ("invalid_username", "Username does not exist or is invalid")

    if isinstance(exc, (InviteHashExpiredError, InviteHashInvalidError)):
        return ("invalid_link", "Invite link is expired or invalid")

    if isinstance(exc, ChannelPrivateError):
        return (
            "private_channel",
            "Channel is private or account has been banned/kicked from this group by admin/bot",
        )

    if isinstance(exc, UserNotParticipantError):
        return ("not_member", "Account is not a member of this group/channel")

    if isinstance(exc, PhoneNumberBannedError):
        return ("phone_banned", "Phone number is banned from Telegram")

    if isinstance(exc, PhoneNumberInvalidError):
        return ("phone_invalid", "The phone number is invalid")

    if isinstance(exc, PhoneNumberFloodError):
        return ("phone_flood", "Too many verification requests for this phone number. Please try again later.")

    # Raised by ResendCodeRequest when Telegram has exhausted every delivery
    # option for this number (flash-call, then SMS, ...). It is an expected
    # login-flow state, not a bug — classify it so resend-code returns a
    # readable message instead of a generic "unexpected error" (PYTHON-FASTAPI-3H).
    if SendCodeUnavailableError and isinstance(exc, SendCodeUnavailableError):
        return (
            "code_unavailable",
            "Telegram can't resend the login code to this number right now — all "
            "delivery options are used up. Wait a few minutes and try again, or "
            "restart the login.",
        )

    if isinstance(exc, MessageTooLongError):
        return ("message_too_long", "Message text is too long for Telegram (limit is 4096 characters)")

    if isinstance(exc, MessageEmptyError):
        return ("message_empty", "Message text is empty")

    if isinstance(exc, (AuthKeyUnregisteredError, AuthKeyDuplicatedError, SessionRevokedError)) or (
        SessionExpiredError and isinstance(exc, SessionExpiredError)
    ):
        return ("session_revoked", "Telegram session has been revoked or expired")

    if isinstance(exc, UserDeactivatedBanError) or (
        UserDeactivatedError and isinstance(exc, UserDeactivatedError)
    ):
        return ("user_deactivated", "The sending account has been banned/deactivated by Telegram")

    if (TopicClosedError and isinstance(exc, TopicClosedError)) or (
        ForumClosedError and isinstance(exc, ForumClosedError)
    ):
        return ("topic_closed", "This forum topic is closed by group admins")

    if TopicDeletedError and isinstance(exc, TopicDeletedError):
        return ("topic_closed", "This forum topic has been deleted")

    if (ChatSendMediaForbiddenError and isinstance(exc, ChatSendMediaForbiddenError)) or (
        ChatSendStickersForbiddenError and isinstance(exc, ChatSendStickersForbiddenError)
    ) or (ChatSendGifsForbiddenError and isinstance(exc, ChatSendGifsForbiddenError)):
        return ("media_forbidden", "Group policy restricts sending media/stickers/links for members")

    if UserIsBlockedError and isinstance(exc, UserIsBlockedError):
        return ("user_blocked", "Account is blocked by the user or bot")

    if ChatRestrictedError and isinstance(exc, ChatRestrictedError):
        return ("banned", "Account is restricted in this chat")

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
    if "PHONE_NUMBER_INVALID" in msg:
        return ("phone_invalid", "The phone number is invalid")

    if "PHONE_NUMBER_BANNED" in msg:
        return ("phone_banned", "Phone number is banned from Telegram")

    if "PHONE_NUMBER_FLOOD" in msg:
        return ("phone_flood", "Too many verification requests for this phone number. Please try again later.")

    if "SEND_CODE_UNAVAILABLE" in msg.upper():
        return (
            "code_unavailable",
            "Telegram can't resend the login code to this number right now — all "
            "delivery options are used up. Wait a few minutes and try again, or "
            "restart the login.",
        )

    if (
        "USER_DEACTIVATED" in msg.upper()
        or "USER DEACTIVATED" in msg.upper()
        or "HAS BEEN DEACTIVATED" in msg.upper()
    ):
        return ("user_deactivated", "The sending account has been banned/deactivated by Telegram")

    if "SESSION_REVOKED" in msg or "AUTH_KEY_UNREGISTERED" in msg or "AUTH_KEY_DUPLICATED" in msg:
        return ("session_revoked", "Telegram session has been revoked or expired")

    if "MESSAGE_EMPTY" in msg.upper() or "message text is empty" in msg.lower() or "message is empty" in msg.lower():
        return ("message_empty", "Message text is empty")

    if "FROZEN_METHOD_INVALID" in msg or "frozen accounts" in msg.lower():
        return (
            "account_frozen",
            "This Telegram account is frozen by Telegram and this action is "
            "temporarily unavailable. Wait a few hours and try again.",
        )

    flood_match = re.search(r"(?:FLOOD_WAIT_|A wait of\s+)(\d+)", msg, re.IGNORECASE)
    if flood_match or "FLOOD_WAIT" in msg:
        match = flood_match or re.search(r"(\d+)", msg)
        seconds = match.group(1) if match else "?"
        return ("flood", f"Flood wait: {seconds} seconds")

    if "muted" in msg.lower() or "you are muted" in msg.lower():
        clean_msg = re.sub(r"^CHAT_WRITE_FORBIDDEN:\s*", "", msg, flags=re.IGNORECASE).strip()
        if "temporary" in msg.lower() or "sementara" in msg.lower() or "remaining" in msg.lower():
            return ("muted_temporary", clean_msg)
        return ("muted_permanent", "Account is permanently muted in this group by admin")

    if "CHAT_WRITE_FORBIDDEN" in msg:
        if "need to join" in msg.lower() or "join the group" in msg.lower():
            return ("must_join_discussion", "You must join the discussion group before commenting")
        return ("admin_only", "Only admins can send messages in this group")

    if "CHANNEL_PRIVATE" in msg:
        return (
            "private_channel",
            "Channel is private or account has been banned/kicked from this group by admin/bot",
        )

    if "CHAT_ADMIN_REQUIRED" in msg:
        return ("admin_only", "Admin privileges required to perform this action")

    if "INVITE_HASH_EXPIRED" in msg or "INVITE_HASH_INVALID" in msg:
        return ("invalid_link", "Invite link is expired or invalid")

    if "TOPIC_CLOSED" in msg or "FORUM_CLOSED" in msg:
        return ("topic_closed", "This forum topic is closed by group admins")

    if "TOPIC_DELETED" in msg:
        return ("topic_closed", "This forum topic has been deleted")

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

    if "JOIN_GROUP" in msg or "join the discussion" in msg.lower() or "before commenting" in msg.lower():
        return ("must_join_discussion", "You must join the discussion group before commenting")

    if (
        "FRESH_RESET_AUTHORISATION_FORBIDDEN" in msg
        or "FRESH_RESET_AUTHORIZATION_FORBIDDEN" in msg
        or "fresh reset" in msg.lower()
        # Telegram sends the message text, not the RPC error code, when this
        # arrives via a wrapped exception (PYTHON-FASTAPI-15). Note the
        # British "authorisations" spelling used in the message text.
        or "too new and cannot be used to reset" in msg.lower()
    ):
        return ("fresh_reset_forbidden", "The current session is too new and cannot be used to reset other authorizations yet. Please wait a few hours or days before trying again.")

    if "only admins" in msg.lower():
        return ("admin_only", "Only admins can send messages in this group")

    if "no user has" in msg.lower() and "as username" in msg.lower():
        return ("invalid_link", "Invite link is expired or invalid")

    return ("unknown", msg[:500])


