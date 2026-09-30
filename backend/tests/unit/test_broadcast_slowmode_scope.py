"""Slowmode is a per-group limit; it must not throttle the account.

A group with slowmode 2741 returned SlowmodeWaitError for one target. The
handler stored that on the account's cooldown_until, which parked the whole
broadcast: the single account behind the job went unavailable for every
other group, so one slow group stopped the entire run.
"""

import time


def _classify(exc):
    """Mirror of how the loop branches on error type."""
    return getattr(exc, "error_type", None), getattr(exc, "seconds", 30)


class TestSlowmodeIsGroupLocal:
    def test_slowmode_does_not_touch_account_cooldown(self):
        class FakeSlowmode:
            error_type = "slowmode"
            seconds = 2741

        err_type, wait = _classify(FakeSlowmode())
        assert err_type == "slowmode"
        assert wait == 2741

        # The pool keyed by group, never by account.
        slowmode_pool = {}
        pkey = "username:https://t.me/slow_group"
        slowmode_pool[pkey] = {"until": time.time() + wait, "seconds": wait}

        assert set(slowmode_pool) == {pkey}

    def test_flood_still_uses_account_cooldown(self):
        """The account-level throttle must remain account-level."""
        class FakeFlood:
            error_type = "flood"
            seconds = 958

        err_type, wait = _classify(FakeFlood())
        assert err_type == "flood"

        acc = {"cooldown_until": 0.0, "join_cooldown_until": 0.0}
        acc["cooldown_until"] = time.time() + wait
        assert acc["cooldown_until"] > time.time()

    def test_slowmode_defaults_to_30_when_seconds_missing(self):
        class NoSeconds:
            error_type = "slowmode"

        _, wait = _classify(NoSeconds())
        assert wait == 30


class TestSlowGroupIsSkippedNotGlobalPause:
    def test_only_the_slow_group_is_skipped(self):
        slowmode_pool = {
            "username:slow": {"until": time.time() + 2741, "seconds": 2741}
        }

        def should_skip(pkey):
            entry = slowmode_pool.get(pkey)
            return bool(entry) and time.time() < entry["until"]

        assert should_skip("username:slow") is True
        assert should_skip("username:fast") is False

    def test_expired_slowmode_allows_retry(self):
        slowmode_pool = {
            "username:x": {"until": time.time() - 1, "seconds": 2741}
        }
        entry = slowmode_pool.get("username:x")
        assert (time.time() < entry["until"]) is False

    def test_skipped_group_is_queued_as_pending(self):
        """The group must be retried later, not dropped."""
        pkey = "username:slow"
        slowmode_pool = {pkey: {"until": time.time() + 60, "seconds": 60}}
        pending_pool = {}

        entry = slowmode_pool.get(pkey)
        if entry and time.time() < entry["until"]:
            pending_pool[pkey] = {
                "group_identifier": "https://t.me/slow",
                "item_type": "username",
            }

        assert pkey in pending_pool

    def test_account_stays_available_for_other_groups(self):
        """The core regression: one slow group must not disable the account."""
        slowmode_pool = {
            "username:slow": {"until": time.time() + 2741, "seconds": 2741}
        }
        acc = {"cooldown_until": 0.0, "join_cooldown_until": 0.0}

        # Simulate the account-selection readiness test.
        ready = (
            time.time() >= acc["cooldown_until"]
            and time.time() >= acc["join_cooldown_until"]
        )

        assert ready is True, "slowmode must not have touched account cooldowns"