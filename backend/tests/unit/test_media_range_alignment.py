"""Telegram media streaming must use request-size-aligned offsets (PYTHON-FASTAPI-13/14)."""

import pytest


def _align(start: int, request_size: int) -> tuple[int, int]:
    """Mirror the alignment logic in the video stream endpoint."""
    aligned = (start // request_size) * request_size
    return aligned, start - aligned


@pytest.mark.parametrize("request_size", [128 * 1024])
def test_aligned_start_is_a_multiple_of_request_size(request_size: int):
    """Telegram rejects a GetFileRequest whose offset is not a multiple."""
    for start in (0, 1, 12345, 128 * 1024, 128 * 1024 + 7, 5 * 1024 * 1024 + 999):
        aligned, _ = _align(start, request_size)
        assert aligned % request_size == 0
        assert aligned <= start


@pytest.mark.parametrize("request_size", [128 * 1024])
def test_skip_is_bounded_by_the_aligned_chunk(request_size: int):
    """We can only discard the leading bytes of the first aligned chunk."""
    for start in (0, 1, 12345, 128 * 1024 + 7, 999 * 1024 * 1024):
        _, skip = _align(start, request_size)
        assert 0 <= skip < request_size
    assert _align(0, request_size)[1] == 0
    assert _align(128 * 1024, request_size)[1] == 0


def test_skip_plus_aligned_offset_reconstructs_start():
    request_size = 128 * 1024
    for start in (0, 1, 999, 128 * 1024 + 513, 7 * 1024 * 1024):
        aligned, skip = _align(start, request_size)
        assert aligned + skip == start


def test_discarding_leading_bytes_yields_exactly_the_requested_range():
    """Simulates the generator: bytes yielded must equal [start, end]."""
    request_size = 128 * 1024
    file_bytes = bytes(range(256)) * 4096  # 1 MiB
    start, end = 5000, 20000

    aligned, skip = _align(start, request_size)
    skip_remaining = skip
    out = bytearray()
    # Chunks as the aligned stream would deliver them, starting at `aligned`.
    for i in range(aligned, len(file_bytes), request_size):
        chunk = file_bytes[i : i + request_size]
        if skip_remaining:
            drop = min(skip_remaining, len(chunk))
            chunk = chunk[drop:]
            skip_remaining -= drop
            if not chunk:
                continue
        out += chunk
        if len(out) >= (end - start + 1):
            break

    assert bytes(out[: end - start + 1]) == file_bytes[start : end + 1]
