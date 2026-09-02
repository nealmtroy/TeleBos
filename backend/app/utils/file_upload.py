"""Secure file upload helpers to prevent in-memory buffer exhaustion (DoS)."""

from fastapi import HTTPException, UploadFile, status


async def read_file_chunked(
    file: UploadFile,
    max_size: int,
    chunk_size: int = 64 * 1024,
    detail: str | None = None,
) -> bytes:
    """Read an UploadFile stream in chunks, aborting immediately if it exceeds max_size.

    Prevents unbounded in-memory allocations when receiving large payloads.
    """
    total = 0
    chunks: list[bytes] = []
    error_msg = detail or f"File too large (max {max_size // (1024 * 1024)}MB)"

    while chunk := await file.read(chunk_size):
        total += len(chunk)
        if total > max_size:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=error_msg,
            )
        chunks.append(chunk)

    return b"".join(chunks)
