"""
Telegram session string converter — detect & convert foreign formats to Telethon.

Supports:
  - Telethon  (native StringSession)
  - GramJS    (dc_id:ip:port:auth_key_b64)
  - Pyrogram  (base64-encoded packed data, v1 & v2)
  - Raw       (bare base64-encoded 256-byte auth key)
"""

import base64
import enum
import logging
import re
import struct
from dataclasses import dataclass

from telethon.crypto import AuthKey
from telethon.sessions import StringSession

logger = logging.getLogger(__name__)

# Telegram data centre addresses (DC 1-5)
TELEGRAM_DC_MAP: dict[int, tuple[str, int]] = {
    1: ("149.154.175.50", 443),
    2: ("149.154.167.51", 443),
    3: ("149.154.175.100", 443),
    4: ("149.154.167.91", 443),
    5: ("149.154.171.5", 443),
}


class SessionFormat(enum.Enum):
    TELETHON = "telethon"
    GRAMJS = "gramjs"
    PYROGRAM = "pyrogram"
    RAW_AUTH_KEY = "raw_base64"
    UNKNOWN = "unknown"


@dataclass
class SessionInfo:
    """Parsed session information extracted from a session string."""

    format: SessionFormat
    dc_id: int
    auth_key: bytes
    server_address: str
    port: int
    user_id: int | None = None


# ---------------------------------------------------------------------------
# Base64 helpers
# ---------------------------------------------------------------------------

def _try_b64decode(s: str) -> bytes:
    """Try standard then URL-safe base64 decoding."""
    try:
        return base64.b64decode(s)
    except Exception:
        pass
    try:
        return base64.b64decode(s.replace("-", "+").replace("_", "/"))
    except Exception as exc:
        raise ValueError("Invalid base64 encoding in session string") from exc


# ---------------------------------------------------------------------------
# Format detection
# ---------------------------------------------------------------------------

# GramJS: dc_id:ip:port:base64_auth_key
_GRAMJS_RE = re.compile(
    r"^\d+:\d+\.\d+\.\d+\.\d+:\d+:[A-Za-z0-9+/=_-]+$"
)


def _is_valid_telethon_stringsession(s: str) -> bool:
    """Check if *s* is a genuine Telethon StringSession with valid fields.

    Telethon's ``StringSession`` constructor is lenient and will accept nearly
    any base64-ish string that starts with ``"1"``.  This helper goes a step
    further and verifies that the decoded dc_id is in the well-known range
    (1–5) and that an auth key was actually decoded.

    Also handles non-standard Telethon variants (used by GramJS/TDesktop) where
    the server address is stored as a length-prefixed ASCII string instead of a
    packed binary IP address, resulting in a variable-length IP field that the
    standard ``StringSession`` constructor cannot unpack.
    """
    # Try standard Telethon constructor first
    try:
        ss = StringSession(s)
    except Exception:
        # Fallback: try to parse the variable-length IP variant manually
        return _is_telethon_variant(s)

    dc_id = getattr(ss, "_dc_id", None)
    auth_key = getattr(ss, "_auth_key", None)
    auth_key_valid = (
        (isinstance(auth_key, AuthKey) and auth_key.key not in (None, b""))
        or (isinstance(auth_key, bytes) and len(auth_key) > 0)
    )
    return dc_id in (1, 2, 3, 4, 5) and auth_key_valid


def _is_telethon_variant(s: str) -> bool:
    """Check if *s* is a Telethon StringSession variant with string-length-prefixed IP.

    In this variant the IP field is stored as ``[2-byte length][ASCII address]``
    instead of a packed binary address, making the overall binary payload a size
    other than the 263 or 275 bytes that standard Telethon expects.
    """
    if not s.startswith("1"):
        return False
    try:
        from telethon.sessions.string import StringSession
        import base64
        import struct

        payload = StringSession.decode(s[1:])
        # Minimum layout: dc_id(1) + port(2) + auth_key(256) = 259 bytes
        if len(payload) < 259:
            return False
        # Last 258 bytes = port(2) + auth_key(256)
        auth_key_bytes = payload[-256:]
        if not any(auth_key_bytes):
            return False
        port = struct.unpack(">H", payload[-258:-256])[0]
        # First byte = dc_id
        dc_id = payload[0]
        if dc_id not in range(1, 6):
            return False
        # Remaining bytes between dc_id and port = IP data
        ip_data = payload[1:-258]
        if len(ip_data) < 2:
            return False
        # Try to extract a length-prefixed string
        ip_str_len = struct.unpack(">H", ip_data[:2])[0]
        if ip_str_len < 7 or ip_str_len > len(ip_data) - 2:
            return False
        ip_str = ip_data[2 : 2 + ip_str_len].decode("ascii")  # must be ASCII
        import ipaddress
        ipaddress.ip_address(ip_str)  # must be valid IP
        return True
    except Exception:
        return False


def detect_format(session_string: str) -> SessionFormat:
    """Detect the format of a Telegram session string.

    Order matters — more specific patterns are checked first to avoid false
    positives from lenient parsers such as Telethon's ``StringSession``.
    """
    s = session_string.strip()
    if not s:
        return SessionFormat.UNKNOWN

    # 1. GramJS — colon-separated with IP-like server_address (very specific)
    if _GRAMJS_RE.match(s):
        return SessionFormat.GRAMJS

    # 2. Telethon — check early before base64 decode to avoid false matches.
    #    Telethon's StringSession always starts with "1" and `_is_valid_telethon_stringsession`
    #    validates dc_id + auth_key, so this is safe even on arbitrary "1..." input.
    #    Doing this before base64 decode prevents a genuine Telethon session whose b64
    #    decoded length happens to fall in the Pyrogram range (268-1000) from being
    #    misidentified as Pyrogram.
    if s.startswith("1"):
        if _is_valid_telethon_stringsession(s):
            return SessionFormat.TELETHON
        # A string starting with "1" that is NOT a valid Telethon StringSession
        # cannot be Pyrogram or any other known format. Return UNKNOWN to avoid
        # a false Pyrogram match when base64-decoded length coincidentally falls
        # in the 268-1000 range.
        return SessionFormat.UNKNOWN

    # 3. Try base64 decode for remaining candidates (Pyrogram, Raw)
    try:
        decoded = _try_b64decode(s)
    except ValueError:
        return SessionFormat.UNKNOWN

    # 4. Raw auth key — exactly 256 bytes decoded
    if len(decoded) == 256:
        return SessionFormat.RAW_AUTH_KEY

    # 5. Pyrogram — structured data between ~268 and 1000 bytes
    if 268 <= len(decoded) <= 1000:
        return SessionFormat.PYROGRAM

    return SessionFormat.UNKNOWN


# ---------------------------------------------------------------------------
# Per-format parsers
# ---------------------------------------------------------------------------

def _parse_gramjs(session_string: str) -> SessionInfo:
    parts = session_string.split(":")
    if len(parts) != 4:
        raise ValueError(
            "GramJS session must have exactly 4 colon-separated parts: "
            "dc_id:server_address:port:auth_key_base64"
        )
    try:
        dc_id = int(parts[0])
        server_address = parts[1]
        port = int(parts[2])
        auth_key = _try_b64decode(parts[3])
    except (ValueError, IndexError) as exc:
        raise ValueError(f"Failed to parse GramJS session: {exc}") from exc

    if dc_id not in TELEGRAM_DC_MAP:
        raise ValueError(f"Unknown DC ID {dc_id} in GramJS session (expected 1-5)")

    return SessionInfo(
        format=SessionFormat.GRAMJS,
        dc_id=dc_id,
        auth_key=auth_key,
        server_address=server_address,
        port=port,
    )


def _parse_pyrogram(session_string: str) -> SessionInfo:
    data = _try_b64decode(session_string)

    # Pyrogram v1 — magic bytes BJJ (0x42 0x4A 0x4A)
    if len(data) > 3 and data[:3] == b"\x42\x4a\x4a":
        try:
            dc_id = struct.unpack("<i", data[3:7])[0]
            auth_key = data[8:264]  # skip test_mode byte after dc_id
            user_id = struct.unpack("<q", data[264:272])[0]
        except (struct.error, IndexError) as exc:
            raise ValueError(
                "Failed to parse Pyrogram v1 session string"
            ) from exc
        addr, port = TELEGRAM_DC_MAP.get(
            dc_id, ("149.154.167.51", 443)
        )
        return SessionInfo(
            format=SessionFormat.PYROGRAM,
            dc_id=dc_id,
            auth_key=auth_key,
            server_address=addr,
            port=port,
            user_id=user_id,
        )

    # Pyrogram v2 — no magic, starts with user_id (i64) then dc_id (i32)
    if len(data) > 268:
        try:
            user_id = struct.unpack("<q", data[0:8])[0]
            dc_id = struct.unpack("<i", data[8:12])[0]
            auth_key = data[12:268]
        except (struct.error, IndexError) as exc:
            raise ValueError(
                "Failed to parse Pyrogram v2 session string"
            ) from exc
        addr, port = TELEGRAM_DC_MAP.get(
            dc_id, ("149.154.167.51", 443)
        )
        return SessionInfo(
            format=SessionFormat.PYROGRAM,
            dc_id=dc_id,
            auth_key=auth_key,
            server_address=addr,
            port=port,
            user_id=user_id,
        )

    # Fallback: try with pyrogram library if installed
    try:
        from pyrogram.session import (  # type: ignore[import-untyped]
            StringSession as PyroStringSession,
        )

        pyro_ss = PyroStringSession(session_string)
        dc_id = pyro_ss.dc_id  # type: ignore[attr-defined]
        auth_key = pyro_ss.auth_key  # type: ignore[attr-defined]
        user_id = getattr(pyro_ss, "user_id", None)
        addr, port = TELEGRAM_DC_MAP.get(
            dc_id, ("149.154.167.51", 443)
        )
        return SessionInfo(
            format=SessionFormat.PYROGRAM,
            dc_id=dc_id,
            auth_key=auth_key,
            server_address=addr,
            port=port,
            user_id=user_id,
        )
    except ImportError:
        pass

    raise ValueError(
        "Could not parse Pyrogram session string. "
        "Install Pyrogram (`pip install pyrogram`) for better compatibility, "
        "or ensure the session string is not corrupted."
    )


def _parse_raw_base64(session_string: str) -> SessionInfo:
    auth_key = _try_b64decode(session_string)
    if len(auth_key) != 256:
        raise ValueError(
            f"Raw auth key must decode to exactly 256 bytes, got {len(auth_key)}"
        )
    # Default to DC 2 (Miami — most common default)
    dc_id = 2
    addr, port = TELEGRAM_DC_MAP[dc_id]
    return SessionInfo(
        format=SessionFormat.RAW_AUTH_KEY,
        dc_id=dc_id,
        auth_key=auth_key,
        server_address=addr,
        port=port,
    )


def _parse_telethon_variant(session_string: str) -> SessionInfo:
    """Parse a Telethon variant with a length-prefixed ASCII server address.

    In this variant (used by GramJS/TDesktop when exporting Telethon-format
    sessions), the IP address is stored as ``[2-byte length][ASCII string]``
    rather than as a packed 4 or 16 byte binary address.  The binary layout
    is::

        dc_id (1 byte) + ip_length (2 bytes) + ip_string (N bytes) +
        port (2 bytes) + auth_key (256 bytes)

    The standard ``StringSession`` cannot unpack this because it only tries
    ip_len = 4 (263-byte payload) or ip_len = 16 (275-byte payload).
    """
    from telethon.sessions.string import StringSession
    import base64
    import struct

    payload = StringSession.decode(session_string[1:])
    if len(payload) < 259:
        raise ValueError("Telethon variant: payload too short")

    dc_id = payload[0]
    if dc_id not in TELEGRAM_DC_MAP:
        raise ValueError(f"Unknown DC ID {dc_id} in Telethon variant session")

    port = struct.unpack(">H", payload[-258:-256])[0]
    auth_key_bytes = payload[-256:]

    # Between dc_id and port is the variable-length IP data
    ip_data = payload[1:-258]
    if len(ip_data) < 2:
        raise ValueError("Telethon variant: no IP data after dc_id")

    ip_str_len = struct.unpack(">H", ip_data[:2])[0]
    ip_str = ip_data[2 : 2 + ip_str_len].decode("ascii")

    return SessionInfo(
        format=SessionFormat.TELETHON,
        dc_id=dc_id,
        auth_key=auth_key_bytes,
        server_address=ip_str,
        port=port,
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def parse_session(session_string: str) -> SessionInfo:
    """Parse a session string in any supported format and return structured info.

    Raises ValueError if detection or parsing fails.
    """
    fmt = detect_format(session_string)

    if fmt == SessionFormat.TELETHON:
        # Try standard Telethon constructor first
        try:
            ss = StringSession(session_string)
        except Exception:
            # Fallback: parse the variant format (length-prefixed ASCII IP)
            return _parse_telethon_variant(session_string)

        dc_id = getattr(ss, "_dc_id", 2)
        auth_key = getattr(ss, "_auth_key", None)
        if isinstance(auth_key, AuthKey):
            auth_key = auth_key.key
        elif not isinstance(auth_key, bytes):
            auth_key = b""
        addr, port = TELEGRAM_DC_MAP.get(
            dc_id, ("149.154.167.51", 443)
        )
        return SessionInfo(
            format=SessionFormat.TELETHON,
            dc_id=dc_id,
            auth_key=auth_key,
            server_address=addr,
            port=port,
        )

    elif fmt == SessionFormat.GRAMJS:
        return _parse_gramjs(session_string)

    elif fmt == SessionFormat.PYROGRAM:
        return _parse_pyrogram(session_string)

    elif fmt == SessionFormat.RAW_AUTH_KEY:
        return _parse_raw_base64(session_string)

    else:
        raise ValueError(
            "Unable to detect session format. "
            "Supported formats:\n"
            "  • Telethon  – string starting with '1' (native)\n"
            "  • GramJS    – dc_id:ip:port:auth_key_base64\n"
            "  • Pyrogram  – base64-encoded session data\n"
            "  • Raw key   – bare base64-encoded 256-byte auth key"
        )


def convert_to_telethon(session_string: str) -> str:
    """Convert any supported session string format to Telethon's StringSession format.

    Returns the input unchanged if already in Telethon format.
    Raises ValueError if the format is unknown or parsing fails.
    """
    s = session_string.strip()
    if not s:
        raise ValueError("Session string is empty")

    fmt = detect_format(s)

    # Already native — pass through if it's a standard Telethon StringSession
    if fmt == SessionFormat.TELETHON:
        try:
            # Verify it's actually loadable by Telethon (not a variant format)
            StringSession(s)
            return s
        except Exception:
            # Variant format — fall through to parse-and-rebuild below
            pass

    info = parse_session(s)

    # Build a Telethon StringSession from parsed fields
    ss = StringSession()
    ss.set_dc(info.dc_id, info.server_address, info.port)
    ss._auth_key = AuthKey(info.auth_key)  # type: ignore[attr-defined]

    converted = ss.save()
    logger.info(
        "Converted %s session (DC %d) to Telethon format",
        info.format.value,
        info.dc_id,
    )
    return converted


# ---------------------------------------------------------------------------
# Display helpers
# ---------------------------------------------------------------------------


def format_label(fmt: SessionFormat) -> str:
    """Human-readable label for a session format."""
    labels = {
        SessionFormat.TELETHON: "Telethon",
        SessionFormat.GRAMJS: "GramJS",
        SessionFormat.PYROGRAM: "Pyrogram",
        SessionFormat.RAW_AUTH_KEY: "Raw Auth Key",
        SessionFormat.UNKNOWN: "Unknown",
    }
    return labels.get(fmt, "Unknown")


def format_color(fmt: SessionFormat) -> str:
    """Hex colour for a session format badge."""
    colors = {
        SessionFormat.TELETHON: "#0088cc",
        SessionFormat.GRAMJS: "#2CA5E0",
        SessionFormat.PYROGRAM: "#EF4437",
        SessionFormat.RAW_AUTH_KEY: "#6B7280",
        SessionFormat.UNKNOWN: "#EF4444",
    }
    return colors.get(fmt, "#EF4444")
