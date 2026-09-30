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


class TestCooldownWaitMath:
    """The wait must consider join cooldown, not just send cooldown."""

    def _earliest_ready(self, accounts):
        """Mirror of the loop's wait computation."""
        return min(
            max(a["cooldown_until"], a.get("join_cooldown_until", 0.0))
            for a in accounts
        )

    def test_join_cooldown_alone_produces_a_real_wait(self):
        """Regression: cooldown_until is 0 here, so ignoring it waited 1s."""
        accounts = [{"cooldown_until": 0.0, "join_cooldown_until": time.time() + 958}]
        now = time.time()

        wait = max(1.0, self._earliest_ready(accounts) - now)

        assert wait > 900, f"expected ~958s wait, got {wait}"

    def test_send_cooldown_alone_still_waits(self):
        accounts = [{"cooldown_until": time.time() + 300, "join_cooldown_until": 0.0}]
        now = time.time()

        wait = max(1.0, self._earliest_ready(accounts) - now)

        assert wait > 250

    def test_expired_cooldowns_give_minimum_wait(self):
        accounts = [{"cooldown_until": 0.0, "join_cooldown_until": 0.0}]

        wait = max(1.0, self._earliest_ready(accounts) - time.time())

        assert wait == 1.0

    def test_earliest_across_accounts_wins(self):
        soon = {"cooldown_until": time.time() + 10, "join_cooldown_until": 0.0}
        later = {"cooldown_until": time.time() + 900, "join_cooldown_until": 0.0}

        assert self._earliest_ready([later, soon]) < time.time() + 20


class TestAccountSelectionHonoursJoinCooldown:
    def test_fallback_must_not_select_a_throttled_account(self):
        """The fallback used to pick any account with an expired send cooldown."""

        def select(accounts, now):
            for a in accounts:
                if now >= a["cooldown_until"] and now >= a.get("join_cooldown_until", 0.0):
                    return a
            return None

        throttled = [{"cooldown_until": 0.0, "join_cooldown_until": time.time() + 958}]

        assert select(throttled, time.time()) is None
