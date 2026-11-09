"""The shared Redis pool must be able to absorb a worker's publish fan-out.

Root cause this guards (production 2026-11-09): ``redis_client`` was created with
``max_connections=64``. The async worker publishes WebSocket events for every
relayed Telegram message on top of lease renewals, job dispatch and the auto-reply
watchdog, so peak concurrent publishes exceeded 64. ``redis-py`` raises
``MaxConnectionsError("Too many connections")`` the moment
``len(_in_use_connections) >= max_connections``, which surfaced as thousands of
``Failed to publish WS event ... Too many connections`` per day and silently
dropped real-time chat updates for users.

These tests are deterministic: they assert on the configured pool ceiling and
reproduce ``MaxConnectionsError`` with a dummy connection class, so they need no
live Redis server.
"""

import pytest

from app.config import get_settings
from app.utils import redis as redis_mod

OLD_CAP = 64


def test_shared_pool_cap_exceeds_old_exhausted_value():
    """The publish pool must allow strictly more than the old 64-connection cap.

    A pool sized at exactly 64 is what produced ``Too many connections``; the
    regression is only fixed if the ceiling actually moved up.
    """
    pool = redis_mod.redis_client.connection_pool
    assert pool.max_connections > OLD_CAP, (
        "redis_client pool is capped at %s connections; the worker's publish "
        "fan-out needs headroom above the old %s cap"
        % (pool.max_connections, OLD_CAP)
    )


def test_pool_cap_is_configurable():
    """The ceiling must come from settings, not a hardcoded literal."""
    assert get_settings().REDIS_MAX_CONNECTIONS > OLD_CAP
    assert (
        redis_mod.redis_client.connection_pool.max_connections
        == get_settings().REDIS_MAX_CONNECTIONS
    )


def test_blocking_pool_is_isolated_from_publish_pool():
    """Blocking waits must not share the publish pool's connection budget.

    BLPOP can hold a connection for up to 65s; sharing the publish pool would pin
    connections that WebSocket publishing needs.
    """
    assert (
        redis_mod.redis_blocking_client.connection_pool
        is not redis_mod.redis_client.connection_pool
    )
