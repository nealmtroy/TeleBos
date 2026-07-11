"""Sanitize exception messages for safe API responses.

Prevents raw Python exception details (file paths, connection params,
session fragments, library internals) from leaking to API consumers.
Full exceptions are logged server-side for debugging.
"""

import logging

logger = logging.getLogger(__name__)

# Max length for any error detail returned to clients
_MAX_DETAIL_LEN = 200


def sanitize_exception(exc: Exception, *, context: str = "") -> str:
    """Return a user-safe error message, logging the full exception server-side.

    - ValueError / RuntimeError: raised intentionally by service code with
      user-facing messages — pass through (truncated).
    - All other exceptions: return a generic message and log the raw error.
    """
    if isinstance(exc, (ValueError, RuntimeError)):
        msg = str(exc)
        if len(msg) > _MAX_DETAIL_LEN:
            msg = msg[:_MAX_DETAIL_LEN] + "…"
        return msg

    # Unknown / potentially leaky exception — log full details and suppress
    logger.error(
        "Unhandled exception in API%s: %s: %s",
        f" ({context})" if context else "",
        type(exc).__name__,
        exc,
        exc_info=True,
    )
    return "An unexpected error occurred. Please try again."
