"""Path security and traversal prevention utilities.

Provides centralized helpers for path validation, canonicalization containment,
safe path joining, and untrusted filename sanitization across API routes,
file responses, and storage helpers.
"""

import os
import re
from pathlib import Path

_SAFE_ID_RE = re.compile(r"^[a-zA-Z0-9_-]+$")


def validate_safe_id(identifier: str, max_length: int = 64) -> str:
    """Validate that an ID (account_id, chat_id, job_id, etc.) contains only safe chars.

    Rejects paths containing path separators ('/', '\\'), dot-dot traversal ('..'),
    null bytes, whitespace, or special characters.
    Raises ValueError if invalid.
    """
    if not identifier or not isinstance(identifier, str):
        raise ValueError("Identifier must be a non-empty string")
    
    clean_id = identifier.strip()
    if len(clean_id) > max_length:
        raise ValueError(f"Identifier exceeds max length of {max_length}")
    
    if not _SAFE_ID_RE.match(clean_id):
        raise ValueError(f"Invalid characters in identifier: {identifier!r}")
    
    return clean_id


def sanitize_filename(filename: str | None, fallback: str = "file", max_length: int = 255) -> str:
    """Sanitize an untrusted filename (from multipart uploads or Telegram attributes).

    - Cross-platform normalization: replaces backslashes with forward slashes so
      Windows paths in uploads do not bypass basename stripping on Linux hosts.
    - Strips directory components (only keeps the base file name).
    - Removes null bytes, control characters, CRLF, and double quotes.
    - Prevents traversal names like '.', '..'.
    - Enforces length limit while preserving extension.
    """
    if not filename or not isinstance(filename, str):
        return fallback

    # Normalize Windows backslashes so basename works consistently across platforms
    normalized = filename.replace("\\", "/")
    # Extract only the base filename
    base = os.path.basename(normalized)
    
    # Strip null bytes and control chars (CRLF, quotes, etc.)
    cleaned = re.sub(r'[\x00-\x1f\x7f"<>\r\n:*?|]', '', base).strip(". ")
    
    if not cleaned or cleaned in (".", ".."):
        return fallback

    # Truncate if too long, preserving extension
    if len(cleaned) > max_length:
        root, ext = os.path.splitext(cleaned)
        max_root = max_length - len(ext)
        if max_root > 0:
            cleaned = root[:max_root] + ext
        else:
            cleaned = cleaned[:max_length]

    return cleaned or fallback


def safe_join(base_dir: str, *paths: str) -> str:
    """Safely join subpaths to a base directory, guaranteeing containment.

    Ensures the resulting path is strictly located within `base_dir` and resolves
    any symbolic links and relative traversal components ('..').
    
    Raises ValueError if a path traversal attempt is detected.
    """
    if not base_dir:
        raise ValueError("base_dir must be specified")

    # Canonicalize base directory
    base_resolved = os.path.realpath(os.path.abspath(base_dir))

    cleaned_parts: list[str] = []
    for p in paths:
        if not p or not isinstance(p, str):
            continue
        
        # Reject null bytes immediately
        if "\x00" in p:
            raise ValueError("Null byte in path")

        # Reject drive letters (Windows)
        if re.match(r"^[a-zA-Z]:", p):
            raise ValueError(f"Absolute drive path not allowed: {p!r}")

        # Normalize slashes
        normalized = p.replace("\\", "/")

        # Reject absolute paths (starting with /)
        if normalized.startswith("/"):
            raise ValueError(f"Absolute path not allowed: {p!r}")

        # Check for traversal segments '..'
        segments = normalized.split("/")
        if ".." in segments:
            raise ValueError(f"Path traversal segment '..' not allowed: {p!r}")

        cleaned_parts.append(normalized)

    # Resolve target path
    target = os.path.realpath(os.path.abspath(os.path.join(base_resolved, *cleaned_parts)))

    # Strict containment check using commonpath
    try:
        common = os.path.commonpath([base_resolved, target])
    except ValueError:
        # Happens on Windows if paths are on different drives
        raise ValueError(f"Path traversal detected: {target} is outside {base_resolved}")

    if common != base_resolved:
        raise ValueError(f"Path traversal detected: {target} is outside {base_resolved}")

    return target


def is_path_contained(base_dir: str, target_path: str) -> bool:
    """Check if target_path is strictly within base_dir without raising an exception."""
    try:
        if not base_dir or not target_path:
            return False
        base_resolved = os.path.realpath(os.path.abspath(base_dir))
        target_resolved = os.path.realpath(os.path.abspath(target_path))
        common = os.path.commonpath([base_resolved, target_resolved])
        return common == base_resolved
    except (ValueError, TypeError):
        return False


def get_base_uploads_dir() -> str:
    """Return the absolute, canonical base uploads directory."""
    # backend/app/utils -> backend/app -> backend
    backend_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    uploads_dir = os.path.join(backend_root, "uploads")
    return os.path.realpath(os.path.abspath(uploads_dir))
