"""Tests for the local Camoufox captcha solver and its 2captcha fallback.

The behaviour worth protecting is not "does the browser work" — that is the
solver container's job, exercised end-to-end in production. It is the decision
logic in the backend: which solver gets used, and that no solver failure is
allowed to break an appeal.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.services import captcha_solver

CAPTCHA_URL = "https://telegram.org/captcha?scope=sbot_spam&actor=abc123"


@pytest.fixture(autouse=True)
def _reset_client():
    """Each test gets a fresh module-level pool, and leaves none behind."""
    captcha_solver._CLIENT = None
    captcha_solver._CLIENT_URL = None
    yield
    captcha_solver._CLIENT = None
    captcha_solver._CLIENT_URL = None


def _settings(**overrides):
    s = MagicMock()
    s.CAMOUFOX_SOLVER_ENABLED = False
    s.CAMOUFOX_SOLVER_URL = "http://camoufox-solver:8000"
    for k, v in overrides.items():
        setattr(s, k, v)
    return s


# ── solver_enabled ──────────────────────────────────────────────────────────


def test_disabled_by_default():
    with patch.object(captcha_solver, "get_settings", return_value=_settings()):
        assert captcha_solver.solver_enabled() is False


def test_enabled_when_flag_set():
    with patch.object(
        captcha_solver,
        "get_settings",
        return_value=_settings(CAMOUFOX_SOLVER_ENABLED=True),
    ):
        assert captcha_solver.solver_enabled() is True


# ── solve_captcha_via_camoufox ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_disabled_solver_is_never_called():
    """A disabled solver must not open a socket at all."""
    with patch.object(
        captcha_solver, "get_settings", return_value=_settings()
    ), patch.object(captcha_solver, "_client", new=AsyncMock()) as client:
        assert await captcha_solver.solve_captcha_via_camoufox(CAPTCHA_URL) is None
        client.assert_not_awaited()


@pytest.mark.asyncio
async def test_returns_token_on_success():
    client = AsyncMock()
    client.post.return_value = httpx.Response(
        200,
        json={
            "ok": True,
            "token": "tok-abc",
            "elapsed_seconds": 3.2,
            "interactive": False,
        },
    )
    with patch.object(
        captcha_solver,
        "get_settings",
        return_value=_settings(CAMOUFOX_SOLVER_ENABLED=True),
    ), patch.object(captcha_solver, "_client", new=AsyncMock(return_value=client)):
        token = await captcha_solver.solve_captcha_via_camoufox(CAPTCHA_URL)

    assert token == "tok-abc"
    client.post.assert_awaited_once()
    assert client.post.await_args.kwargs["json"]["url"] == CAPTCHA_URL


@pytest.mark.asyncio
async def test_unreachable_solver_returns_none_not_raises():
    """An absent solver container must degrade quietly — this is the normal
    state for anyone who has not deployed it yet."""
    client = AsyncMock()
    client.post.side_effect = httpx.ConnectError("connection refused")
    with patch.object(
        captcha_solver,
        "get_settings",
        return_value=_settings(CAMOUFOX_SOLVER_ENABLED=True),
    ), patch.object(captcha_solver, "_client", new=AsyncMock(return_value=client)):
        assert await captcha_solver.solve_captcha_via_camoufox(CAPTCHA_URL) is None


@pytest.mark.asyncio
async def test_timeout_returns_none():
    client = AsyncMock()
    client.post.side_effect = httpx.ReadTimeout("too slow")
    with patch.object(
        captcha_solver,
        "get_settings",
        return_value=_settings(CAMOUFOX_SOLVER_ENABLED=True),
    ), patch.object(captcha_solver, "_client", new=AsyncMock(return_value=client)):
        assert await captcha_solver.solve_captcha_via_camoufox(CAPTCHA_URL) is None


@pytest.mark.asyncio
async def test_expired_url_reported_as_no_token():
    """The solver distinguishes an expired URL from a real failure. Either way
    the backend must get None so it can fall back."""
    client = AsyncMock()
    client.post.return_value = httpx.Response(
        200,
        json={
            "ok": False,
            "landed_url": "https://telegram.org/",
            "widget_rendered": False,
            "detail": "captcha URL appears expired",
        },
    )
    with patch.object(
        captcha_solver,
        "get_settings",
        return_value=_settings(CAMOUFOX_SOLVER_ENABLED=True),
    ), patch.object(captcha_solver, "_client", new=AsyncMock(return_value=client)):
        assert await captcha_solver.solve_captcha_via_camoufox(CAPTCHA_URL) is None


@pytest.mark.asyncio
async def test_interactive_downgrade_returns_none():
    """Cloudflare wanting a human is a proxy problem, not a retry problem."""
    client = AsyncMock()
    client.post.return_value = httpx.Response(
        200,
        json={
            "ok": False,
            "widget_rendered": True,
            "interactive": True,
            "detail": "this address is being downgraded",
        },
    )
    with patch.object(
        captcha_solver,
        "get_settings",
        return_value=_settings(CAMOUFOX_SOLVER_ENABLED=True),
    ), patch.object(captcha_solver, "_client", new=AsyncMock(return_value=client)):
        assert await captcha_solver.solve_captcha_via_camoufox(CAPTCHA_URL) is None


@pytest.mark.asyncio
async def test_http_error_status_returns_none():
    client = AsyncMock()
    client.post.return_value = httpx.Response(500, text="boom")
    with patch.object(
        captcha_solver,
        "get_settings",
        return_value=_settings(CAMOUFOX_SOLVER_ENABLED=True),
    ), patch.object(captcha_solver, "_client", new=AsyncMock(return_value=client)):
        assert await captcha_solver.solve_captcha_via_camoufox(CAPTCHA_URL) is None


@pytest.mark.asyncio
async def test_non_json_response_returns_none():
    client = AsyncMock()
    client.post.return_value = httpx.Response(200, text="<html>nope</html>")
    with patch.object(
        captcha_solver,
        "get_settings",
        return_value=_settings(CAMOUFOX_SOLVER_ENABLED=True),
    ), patch.object(captcha_solver, "_client", new=AsyncMock(return_value=client)):
        assert await captcha_solver.solve_captcha_via_camoufox(CAPTCHA_URL) is None


@pytest.mark.asyncio
async def test_poll_seconds_forwarded():
    client = AsyncMock()
    client.post.return_value = httpx.Response(200, json={"ok": True, "token": "t"})
    with patch.object(
        captcha_solver,
        "get_settings",
        return_value=_settings(CAMOUFOX_SOLVER_ENABLED=True),
    ), patch.object(captcha_solver, "_client", new=AsyncMock(return_value=client)):
        await captcha_solver.solve_captcha_via_camoufox(CAPTCHA_URL, poll_seconds=60)

    assert client.post.await_args.kwargs["json"]["poll_seconds"] == 60
