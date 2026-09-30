"""Worker startup must wait for the schema instead of crashing (PYTHON-FASTAPI-T)."""

from unittest.mock import AsyncMock, patch

import pytest

from app.services import broadcast_service, invite_service
from app.workers.async_worker import resume_jobs_when_schema_ready


def _missing_table_exc() -> Exception:
    return type("ProgrammingError", (Exception,), {})('relation "broadcast_jobs" does not exist')


def _session_factory_patch(mock_factory):
    mock_factory.return_value.__aenter__.return_value = AsyncMock()
    return mock_factory


@pytest.mark.asyncio
async def test_retries_until_table_exists_then_resumes():
    """A missing table on first startup must be retried, not fatal."""
    with (
        patch("app.workers.async_worker.async_session_factory") as mock_factory,
        patch.object(
            broadcast_service,
            "resume_running_broadcasts_on_startup",
            new=AsyncMock(side_effect=[_missing_table_exc(), _missing_table_exc(), 3]),
        ) as mock_broadcast,
        patch.object(
            invite_service, "resume_running_invites_on_startup", new=AsyncMock(return_value=1)
        ) as mock_invite,
        patch("asyncio.sleep", new=AsyncMock()) as mock_sleep,
    ):
        _session_factory_patch(mock_factory)

        await resume_jobs_when_schema_ready()

    assert mock_broadcast.await_count == 3
    assert mock_invite.await_count == 1  # only called once the schema was ready
    assert mock_sleep.await_count == 2
    mock_sleep.assert_awaited_with(2.0)


@pytest.mark.asyncio
async def test_gives_up_and_exits_when_schema_never_appears():
    """After exhausting attempts the worker exits so compose restarts it."""
    with (
        patch("app.workers.async_worker.async_session_factory") as mock_factory,
        patch.object(
            broadcast_service,
            "resume_running_broadcasts_on_startup",
            new=AsyncMock(side_effect=_missing_table_exc()),
        ),
        patch("asyncio.sleep", new=AsyncMock()) as mock_sleep,
    ):
        _session_factory_patch(mock_factory)

        with pytest.raises(SystemExit):
            await resume_jobs_when_schema_ready(max_attempts=3)

    assert mock_sleep.await_count == 2  # no sleep after the final attempt


@pytest.mark.asyncio
async def test_raises_on_non_schema_startup_failure():
    """A genuine fault must fail loudly rather than retry for a minute."""
    with (
        patch("app.workers.async_worker.async_session_factory") as mock_factory,
        patch.object(
            broadcast_service,
            "resume_running_broadcasts_on_startup",
            new=AsyncMock(side_effect=RuntimeError("connection refused")),
        ),
        patch("asyncio.sleep", new=AsyncMock()) as mock_sleep,
    ):
        _session_factory_patch(mock_factory)

        with pytest.raises(RuntimeError, match="connection refused"):
            await resume_jobs_when_schema_ready()

    mock_sleep.assert_not_awaited()  # never retried


@pytest.mark.asyncio
async def test_first_attempt_success_does_not_sleep():
    """The normal path must not pay a startup delay."""
    with (
        patch("app.workers.async_worker.async_session_factory") as mock_factory,
        patch.object(
            broadcast_service,
            "resume_running_broadcasts_on_startup",
            new=AsyncMock(return_value=5),
        ),
        patch.object(
            invite_service, "resume_running_invites_on_startup", new=AsyncMock(return_value=2)
        ),
        patch("asyncio.sleep", new=AsyncMock()) as mock_sleep,
    ):
        _session_factory_patch(mock_factory)

        await resume_jobs_when_schema_ready()

    mock_sleep.assert_not_awaited()
