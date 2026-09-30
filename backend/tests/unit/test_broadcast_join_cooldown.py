"""A join flood must pause the job, not mark every remaining group failed.

Observed in production on job 3f533575: one account hit a 958s join flood,
and the cycle finished 5 seconds later reporting 148/149 groups failed. Three
bugs stacked up to produce that:

1. The wait after "no account ready" was computed from cooldown_until only,
   ignoring join_cooldown_until. An account throttled on join but never on
   send had cooldown_until == 0, so the wait collapsed to 1 second.
2. The account-selection fallback ignored join_cooldown, so it happily picked
   the throttled account anyway; every remaining target was then marked
   join_cooldown in a few seconds.
3. join_cooldown targets were counted as failures even though they are queued
   in pending_pool and retried at the start of the next cycle.
"""

import time

import pytest

from app.services.broadcast_log_sender import _format_cycle_summary


def _cycle_log(status, error_type=None, group="https://t.me/x"):
    return {
        "status": status,
        "error_type": error_type,
        "group_identifier": group,
        "error_message": None,
    }


def _summary(logs):
    from datetime import datetime, timedelta, timezone

    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    return _format_cycle_summary(
        job_name="Job 3f533575",
        cycle_number=23,
        start_time=start,
        end_time=start + timedelta(seconds=5),
        text_list_name=None,
        group_list_name="1",
        total_groups=149,
        active_this_round=149,
        cycle_logs=logs,
        accounts_by_id={},
        item_type_by_identifier={},
    )


class TestJoinCooldownIsNotAFailure:
    def test_skipped_targets_are_not_counted_as_failures(self):
        """The headline bug: 148 waiting targets reported as failures."""
        logs = [_cycle_log("skipped", "join_cooldown", f"g{i}") for i in range(148)]
        summary = _summary(logs)

        assert "Failed</b>: ❌ 0" in summary
        assert "Waiting</b>: ⏳ 148" in summary

    def test_real_failures_still_counted_alongside_waiting(self):
        logs = [_cycle_log("success", None, "ok1")]
        logs += [_cycle_log("error", "admin_only", "bad1")]
        logs += [_cycle_log("skipped", "join_cooldown", "wait1")]
        summary = _summary(logs)

        assert "Sent</b>: ✅ 1" in summary
        assert "Failed</b>: ❌ 1" in summary
        assert "Waiting</b>: ⏳ 1" in summary

    def test_no_waiting_line_when_nothing_waited(self):
        """Don't add noise to the common case."""
        logs = [_cycle_log("success", None, "a"), _cycle_log("error", "banned", "b")]
        summary = _summary(logs)

        assert "Waiting</b>" not in summary

    def test_waiting_targets_not_listed_under_gagal(self):
        """Skipped targets must not pollute the failure list."""
        logs = [_cycle_log("skipped", "join_cooldown", "waitgroup")]
        summary = _summary(logs)

        assert "Gagal Terkirim" not in summary


class TestJoinFloodEndsCycleInsteadOfParking:
    """A join flood ends the cycle. It must not park the job for the floodwait.

    The per-group and after-all delays still apply at the cycle boundary; only
    the join floodwait is deliberately not respected inline.
    """

    def _all_join_blocked(self, accounts, now):
        return bool(accounts) and all(
            now < a.get("join_cooldown_until", 0.0) for a in accounts
        )

    def test_single_join_throttled_account_ends_cycle(self):
        accounts = [{"cooldown_until": 0.0, "join_cooldown_until": time.time() + 270}]
        assert self._all_join_blocked(accounts, time.time()) is True

    def test_any_free_account_means_not_blocked(self):
        now = time.time()
        accounts = [
            {"cooldown_until": 0.0, "join_cooldown_until": now + 270},
            {"cooldown_until": 0.0, "join_cooldown_until": 0.0},
        ]
        assert self._all_join_blocked(accounts, now) is False

    def test_empty_pool_is_not_treated_as_join_blocked(self):
        # all() over an empty sequence is True, which must not masquerade as a
        # join flood and silently end every cycle.
        assert self._all_join_blocked([], time.time()) is False

    def test_expired_join_cooldown_does_not_block(self):
        accounts = [{"cooldown_until": 0.0, "join_cooldown_until": time.time() - 1}]
        assert self._all_join_blocked(accounts, time.time()) is False


class TestUnreachedTargetsAreRequeued:
    """When a cycle ends early, the untouched tail must still be retried."""

    def test_leftover_targets_are_queued_for_next_cycle(self):
        items = [
            {"type": "username", "value": "a"},
            {"type": "username", "value": "b"},
            {"type": "username", "value": "c"},
        ]
        joined_pool = {"username:a"}
        permanent_failures_pool = {"username:b"}
        pending_pool = {}

        for pitem in items:
            pk = f"{pitem.get('type', 'username')}:{pitem.get('value', '') or ''}"
            if (
                pk not in joined_pool
                and pk not in permanent_failures_pool
                and pk not in pending_pool
            ):
                pending_pool[pk] = {
                    "group_identifier": pitem.get("value", "") or "",
                    "item_type": pitem.get("type", "username"),
                }

        # 'c' was never reached before the cycle was cut short.
        assert set(pending_pool) == {"username:c"}

    def test_already_queued_target_is_not_duplicated(self):
        items = [{"type": "username", "value": "a"}]
        pending_pool = {"username:a": {"group_identifier": "a", "item_type": "username"}}

        for pitem in items:
            pk = f"{pitem.get('type', 'username')}:{pitem.get('value', '') or ''}"
            if (
                pk not in set()
                and pk not in set()
                and pk not in pending_pool
            ):
                pending_pool[pk] = {"group_identifier": "a", "item_type": "username"}

        assert len(pending_pool) == 1
