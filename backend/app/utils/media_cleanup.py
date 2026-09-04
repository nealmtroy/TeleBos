"""Background utility to clean up cached message media files and prevent disk bloat."""

import asyncio
import logging
import os
import time

logger = logging.getLogger(__name__)

# Default retention: 48 hours (172,800 seconds)
DEFAULT_MAX_AGE_SECONDS = 48 * 3600
# Default max storage cap for message media cache: 1000 MB (1 GB)
DEFAULT_MAX_CACHE_MB = 1000


def cleanup_old_message_media(
    base_dir: str | None = None,
    max_age_seconds: int = DEFAULT_MAX_AGE_SECONDS,
    max_cache_mb: int = DEFAULT_MAX_CACHE_MB,
) -> dict[str, int]:
    """Prune cached message media files older than *max_age_seconds* and enforce size cap.

    Returns a summary dict: {"deleted_files": count, "freed_bytes": bytes}.
    """
    if base_dir is None:
        # Resolve backend root dir
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

    media_dir = os.path.join(base_dir, "uploads", "message_media")
    if not os.path.exists(media_dir):
        return {"deleted_files": 0, "freed_bytes": 0}

    now = time.time()
    deleted_files = 0
    freed_bytes = 0

    files_with_stats: list[tuple[str, float, int]] = []

    # 1. Prune by age and collect remaining files
    for root, _, files in os.walk(media_dir):
        for f in files:
            file_path = os.path.join(root, f)
            try:
                stat = os.stat(file_path)
                mtime = stat.st_mtime
                size = stat.st_size

                if now - mtime > max_age_seconds:
                    os.remove(file_path)
                    deleted_files += 1
                    freed_bytes += size
                else:
                    files_with_stats.append((file_path, mtime, size))
            except (OSError, FileNotFoundError):
                continue

    # 2. Enforce total storage cap if still over limit (LRU: oldest first)
    total_remaining_bytes = sum(s for _, _, s in files_with_stats)
    max_allowed_bytes = max_cache_mb * 1024 * 1024

    if total_remaining_bytes > max_allowed_bytes:
        # Sort by mtime ascending (oldest first)
        files_with_stats.sort(key=lambda x: x[1])
        for file_path, _, size in files_with_stats:
            try:
                os.remove(file_path)
                deleted_files += 1
                freed_bytes += size
                total_remaining_bytes -= size
                if total_remaining_bytes <= max_allowed_bytes:
                    break
            except (OSError, FileNotFoundError):
                continue

    # 3. Clean up empty chat subdirectories
    for root, dirs, files in os.walk(media_dir, topdown=False):
        if root != media_dir and not dirs and not files:
            try:
                os.rmdir(root)
            except OSError:
                pass

    if deleted_files > 0:
        logger.info(
            "Cleaned up %d message media cache files (freed %.2f MB)",
            deleted_files,
            freed_bytes / (1024 * 1024),
        )

    return {"deleted_files": deleted_files, "freed_bytes": freed_bytes}


DEFAULT_CHAT_PHOTOS_MAX_AGE_SECONDS = 7 * 86400  # 7 days
DEFAULT_CHAT_PHOTOS_MAX_CACHE_MB = 500  # 500 MB


def cleanup_old_chat_photos(
    base_dir: str | None = None,
    max_age_seconds: int = DEFAULT_CHAT_PHOTOS_MAX_AGE_SECONDS,
    max_cache_mb: int = DEFAULT_CHAT_PHOTOS_MAX_CACHE_MB,
) -> dict[str, int]:
    """Prune cached chat photos older than *max_age_seconds* and enforce size cap (UBC-01).

    Returns a summary dict: {"deleted_files": count, "freed_bytes": bytes}.
    """
    if base_dir is None:
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

    photos_dir = os.path.join(base_dir, "uploads", "chat_photos")
    if not os.path.exists(photos_dir):
        return {"deleted_files": 0, "freed_bytes": 0}

    now = time.time()
    deleted_files = 0
    freed_bytes = 0
    files_with_stats: list[tuple[str, float, int]] = []

    # 1. Prune by age and collect remaining files
    for root, _, files in os.walk(photos_dir):
        for f in files:
            file_path = os.path.join(root, f)
            try:
                stat = os.stat(file_path)
                mtime = stat.st_mtime
                size = stat.st_size

                if now - mtime > max_age_seconds:
                    os.remove(file_path)
                    deleted_files += 1
                    freed_bytes += size
                else:
                    files_with_stats.append((file_path, mtime, size))
            except (OSError, FileNotFoundError):
                continue

    # 2. Enforce total storage cap if still over limit (LRU: oldest first)
    total_remaining_bytes = sum(s for _, _, s in files_with_stats)
    max_allowed_bytes = max_cache_mb * 1024 * 1024

    if total_remaining_bytes > max_allowed_bytes:
        files_with_stats.sort(key=lambda x: x[1])
        for file_path, _, size in files_with_stats:
            try:
                os.remove(file_path)
                deleted_files += 1
                freed_bytes += size
                total_remaining_bytes -= size
                if total_remaining_bytes <= max_allowed_bytes:
                    break
            except (OSError, FileNotFoundError):
                continue

    # 3. Clean up empty chat subdirectories
    for root, dirs, files in os.walk(photos_dir, topdown=False):
        if root != photos_dir and not dirs and not files:
            try:
                os.rmdir(root)
            except OSError:
                pass

    if deleted_files > 0:
        logger.info(
            "Cleaned up %d chat photos cache files (freed %.2f MB)",
            deleted_files,
            freed_bytes / (1024 * 1024),
        )

    return {"deleted_files": deleted_files, "freed_bytes": freed_bytes}


async def background_media_cleanup_loop(interval_seconds: int = 86400) -> None:
    """Runs daily in background to prune stale media cache and chat photos."""
    # Delay initial run by 5 minutes after startup
    await asyncio.sleep(300)
    while True:
        try:
            cleanup_old_message_media()
            cleanup_old_chat_photos()
        except Exception as exc:
            logger.warning("Error during background media cleanup: %s", exc)
        await asyncio.sleep(interval_seconds)
