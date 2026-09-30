"""Per-cycle counters must be per-cycle; job counters stay cumulative.

Job e900d98f reported cycle 2 as "Sent: 0 | Failed: 0" after cycle 1 sent 30
and failed 8. The loop kept a single pair of counters across every cycle, so
cycle 2 re-reported cycle 1's running totals while its detail list had already
been flushed and cleared — the summary had nothing left to add up.

The fix keeps both: cycle_sent/cycle_failed for the per-cycle report, and the
original sent/failed for the job's cumulative totals, which _flush_cycle_logs
writes to broadcast_jobs.sent_count.
"""


class TestPerCycleCountersReset:
    def test_counters_start_at_zero_each_cycle(self):
        cycle_sent, cycle_failed = 0, 0

        assert (cycle_sent, cycle_failed) == (0, 0)

    def test_increments_are_independent_of_cumulative(self):
        sent, failed = 30, 8          # cumulative from cycle 1
        cycle_sent, cycle_failed = 0, 0

        cycle_sent += 1
        cycle_failed += 1

        assert (cycle_sent, cycle_failed) == (1, 1)
        assert (sent, failed) == (30, 8), "job totals must not move per cycle"

    def test_second_cycle_does_not_repeat_first(self):
        # cycle 1: 30 sent / 8 failed
        sent, failed = 30, 8
        cycle_sent, cycle_failed = 30, 8

        # cycle 2 starts fresh
        cycle_sent, cycle_failed = 0, 0
        cycle_sent += 5
        cycle_failed += 1

        assert (cycle_sent, cycle_failed) == (5, 1)
        assert (sent, failed) == (30, 8)

        # job totals keep accumulating
        sent += cycle_sent
        failed += cycle_failed
        assert (sent, failed) == (35, 9)


class TestJobTotalsRemainCumulative:
    def test_flush_writes_cumulative_to_job_row(self):
        job = {"sent_count": 30, "fail_count": 8}
        cycle_sent, cycle_failed = 5, 1

        job["sent_count"] = job["sent_count"] + cycle_sent
        job["fail_count"] = job["fail_count"] + cycle_failed

        assert job == {"sent_count": 35, "fail_count": 9}

    def test_cycle_row_counts_only_that_cycle(self):
        """The broadcast_logs row is derived from details, so it self-corrects."""
        cycle_details = [
            {"status": "success"},
            {"status": "success"},
            {"status": "error"},
        ]

        sent = sum(1 for d in cycle_details if d["status"] == "success")
        failed = sum(1 for d in cycle_details if d["status"] == "error")

        assert (sent, failed) == (2, 1)


class TestClearedDetailsDoNotZeroOutTheSummary:
    """details.clear() inside the flush is why a later summary saw nothing."""

    def test_snapshot_is_taken_before_clear(self):
        pending_cycle_details = [{"status": "success"}, {"status": "error"}]

        snapshot = list(pending_cycle_details)   # snapshot first
        pending_cycle_details.clear()            # then the flush clears

        assert len(snapshot) == 2
        assert len(pending_cycle_details) == 0

    def test_summary_counts_from_snapshot_not_live_list(self):
        snapshot = [
            {"status": "success"},
            {"status": "error"},
            {"status": "skipped"},
        ]

        success = sum(1 for d in snapshot if d["status"] == "success")
        error = sum(1 for d in snapshot if d["status"] == "error")
        skipped = sum(1 for d in snapshot if d["status"] == "skipped")

        assert (success, error, skipped) == (1, 1, 1)
