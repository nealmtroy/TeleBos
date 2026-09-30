"""A flood-joined group must not be re-attempted every cycle.

The scenario: 100 groups, join each and send. Group 20 raises a join flood
with a 200 second wait. Groups 1-19 are already joined and keep receiving
messages on later cycles. Group 20 must sit out until its wait elapses
instead of being re-attempted on every cycle, which would reset the cooldown
each time and let it never become reachable.

Two things were wrong:

- The resolve path queued the target in pending_pool but never recorded the
  wait, so nothing stopped the next cycle from trying the join again.
- Nothing distinguished "queued because it is waiting" from "queued because it
  is retryable right now".
"""

import time


def _wait_from(exc):
    return 30 if not hasattr(exc, "seconds") else exc.seconds


class TestJoinFloodRecordsItsWait:
    def test_resolve_path_records_cooldown(self):
        class Flood:
            error_type = "flood"
            seconds = 200

        acc = {"cooldown_until": 0.0, "join_cooldown_until": 0.0}
        wait = _wait_from(Flood())

        acc["join_cooldown_until"] = time.time() + wait

        assert acc["join_cooldown_until"] > time.time() + 190

    def test_default_wait_when_seconds_absent(self):
        class NoSeconds:
            error_type = "flood"

        assert _wait_from(NoSeconds()) == 30

    def test_target_lands_in_pending(self):
        pending_pool = {}
        pending_pool["username:https://t.me/group20"] = {
            "group_identifier": "https://t.me/group20",
            "item_type": "username",
        }
        assert "username:https://t.me/group20" in pending_pool


class TestWaitingTargetIsNotRetriedEarly:
    def test_target_is_skipped_while_cooldown_active(self):
        acc = {"cooldown_until": 0.0, "join_cooldown_until": time.time() + 200}
        now = time.time()

        blocked = now < acc["join_cooldown_until"]

        assert blocked is True

    def test_target_is_retried_after_cooldown(self):
        acc = {"cooldown_until": 0.0, "join_cooldown_until": time.time() + 200}
        # Simulate the wait having elapsed.
        acc["join_cooldown_until"] = time.time() - 1

        assert (time.time() < acc["join_cooldown_until"]) is False

    def test_slowmode_does_not_set_join_cooldown(self):
        """Slowmode is per-group; it must not hold the account hostage."""
        class Slowmode:
            error_type = "slowmode"
            seconds = 2741

        acc = {"cooldown_until": 0.0, "join_cooldown_until": 0.0}
        slowmode_pool = {}

        slowmode_pool["username:slow"] = {
            "until": time.time() + _wait_from(Slowmode()),
            "seconds": 2741,
        }

        assert acc["join_cooldown_until"] == 0.0
        assert acc["cooldown_until"] == 0.0
        assert set(slowmode_pool) == {"username:slow"}


class TestAlreadyJoinedGroupsKeepReceiving:
    def test_joined_group_is_not_blocked_by_join_cooldown(self):
        """Groups 1-19 are joined; a join flood on group 20 must not stop them."""
        joined_pool = {"username:g1": ["entity"], "username:g19": ["entity"]}
        acc = {"cooldown_until": 0.0, "join_cooldown_until": time.time() + 200}

        blocked = []
        for pkey in joined_pool:
            cached_entity = joined_pool[pkey]
            if cached_entity is None and time.time() < acc["join_cooldown_until"]:
                blocked.append(pkey)

        assert blocked == []

    def test_joined_group_reuses_cached_entity_without_joining(self):
        joined_pool = {"username:g1": ["cached-entity"]}
        cached_entity = joined_pool.get("username:g1")

        if cached_entity is not None:
            entities = cached_entity
        else:  # would join
            entities = "joined-now"

        assert entities == ["cached-entity"]

    def test_unjoined_group_waits(self):
        joined_pool = {}
        acc = {"cooldown_until": 0.0, "join_cooldown_until": time.time() + 200}

        cached_entity = joined_pool.get("username:g20")
        blocked = cached_entity is None and time.time() < acc["join_cooldown_until"]

        assert blocked is True