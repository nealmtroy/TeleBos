"""Unit tests for adaptive broadcast flood control."""

from app.utils import flood_control


def test_flood_escalates_delay_and_applies_cooldown(monkeypatch):
    now = 1_000.0
    monkeypatch.setattr(flood_control.time, "time", lambda: now)
    controller = flood_control.FloodController()

    controller.record_flood("account-1", wait_seconds=30)

    state = controller._accounts["account-1"]
    assert state.consecutive_floods == 1
    assert state.current_delay == 7.5
    assert state.cooldown_until == 1_060.0
    assert controller.get_delay("account-1") == 60.0


def test_success_recovers_base_delay_after_cooldown_and_reset_removes_state(monkeypatch):
    clock = [1_000.0]
    monkeypatch.setattr(flood_control.time, "time", lambda: clock[0])
    controller = flood_control.FloodController()
    controller.record_flood("account-1", wait_seconds=60)

    controller.record_success("account-1")
    clock[0] += 61

    assert controller._accounts["account-1"].consecutive_floods == 0
    assert controller.get_delay("account-1") == 5.0
    controller.reset("account-1")
    assert "account-1" not in controller._accounts


def test_delay_never_exceeds_maximum(monkeypatch):
    monkeypatch.setattr(flood_control.time, "time", lambda: 1_000.0)
    controller = flood_control.FloodController()

    for _ in range(20):
        controller.record_flood("account-1", wait_seconds=0)

    assert controller._accounts["account-1"].current_delay == controller.MAX_DELAY


def test_cleanup_removes_only_stale_accounts(monkeypatch):
    clock = [1_000.0]
    monkeypatch.setattr(flood_control.time, "time", lambda: clock[0])
    controller = flood_control.FloodController()
    controller.get_delay("stale")
    clock[0] += flood_control.STALE_TIMEOUT + 1
    controller._last_cleanup = clock[0]
    controller.get_delay("fresh")

    assert controller.cleanup_stale() == 1
    assert "stale" not in controller._accounts
    assert "fresh" in controller._accounts
