"""Flood waits must be respected, and the throttled member retried.

Two related bugs this guards against:

1. get_delay() was gated on an *expired* cooldown, so while an account was
   cooling down the flood wait was discarded and the loop fell back to the
   ordinary inter-invite delay — inviting straight into the throttle.
2. A flood wrote the member off as failed and moved on, so the member the
   server asked us to wait for was never attempted again.
"""

import time

from app.utils.flood_control import FloodController


def _fresh_controller() -> FloodController:
    return FloodController()


def test_get_delay_returns_remaining_cooldown():
    """While cooling down, get_delay must report the time left, not the base."""
    fc = _fresh_controller()
    fc.record_flood("acc-1", 120)

    delay = fc.get_delay("acc-1")

    # Should reflect the ~120s requested, not the 5s base delay.
    assert delay > 60, f"expected remaining cooldown, got {delay}"


def test_get_delay_ignores_no_cooldown_account():
    fc = _fresh_controller()
    assert fc.get_delay("cold-account") == fc._accounts["cold-account"].current_delay


def test_cooldown_expires():
    fc = _fresh_controller()
    fc.record_flood("acc-1", 0)
    # record_flood enforces COOLDOWN_AFTER_FLOOD (60s) minimum.
    assert fc._accounts["acc-1"].cooldown_until > time.time()

    # Manually expire it.
    fc._accounts["acc-1"].cooldown_until = time.time() - 1
    remaining = fc.get_delay("acc-1")
    assert remaining == fc._accounts["acc-1"].current_delay


def test_repeated_floods_escalate_delay():
    """current_delay compounds across floods; get_delay reports it once cooled."""
    fc = _fresh_controller()
    first = fc.get_delay("acc-1")
    fc.record_flood("acc-1", 10)
    second = fc.get_delay("acc-1")
    fc.record_flood("acc-1", 10)
    third = fc.get_delay("acc-1")

    # While the (60s minimum) cooldown is active, get_delay is dominated by the
    # remaining cooldown, so the escalation is observed in current_delay.
    assert second >= first
    assert third >= second
    assert fc._accounts["acc-1"].current_delay > fc._accounts["acc-1"].base_delay


def test_success_reduces_delay():
    fc = _fresh_controller()
    fc.record_flood("acc-1", 60)
    peak = fc._accounts["acc-1"].current_delay

    fc.record_success("acc-1")
    assert fc._accounts["acc-1"].current_delay < peak


def test_delay_capped_at_max():
    """current_delay compounds but is capped.

    The cooldown itself is not capped: get_delay returns max(remaining,
    current_delay), and Telegram's requested wait must be honoured in full.
    """
    fc = _fresh_controller()
    for _ in range(20):
        fc.record_flood("acc-1", 600)
    assert fc._accounts["acc-1"].current_delay <= FloodController.MAX_DELAY


def test_reset_clears_state():
    fc = _fresh_controller()
    fc.record_flood("acc-1", 600)
    fc.reset("acc-1")
    assert "acc-1" not in fc._accounts


def test_per_account_isolation():
    """One account flooding must not throttle a different one."""
    fc = _fresh_controller()
    fc.record_flood("acc-1", 600)
    assert fc.get_delay("acc-2") == fc._accounts["acc-2"].current_delay