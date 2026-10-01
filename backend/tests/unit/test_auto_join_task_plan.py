"""Auto-join task ordering and pacing.

The pacing rule is the one that matters: with three accounts against one group,
the run must take one pause for that group, not three. Delaying after every
individual join stalled the same group three times over.

This mirrors frontend autoJoinTaskPlan.ts so both sides agree.
"""

from app.services.auto_join_service import build_tasks, should_delay_before_next


ACCOUNTS = ["user1", "user2", "user3"]
GROUPS = [
    {"type": "username", "value": "group1"},
    {"type": "username", "value": "group2"},
    {"type": "username", "value": "group3"},
]


def test_all_mode_finishes_a_group_before_moving_on():
    tasks = build_tasks(GROUPS, ACCOUNTS, "all")

    assert [(a, t[1]) for a, t in ((x[0], x) for x in tasks)] == [
        ("user1", "group1"),
        ("user2", "group1"),
        ("user3", "group1"),
        ("user1", "group2"),
        ("user2", "group2"),
        ("user3", "group2"),
        ("user1", "group3"),
        ("user2", "group3"),
        ("user3", "group3"),
    ]


def test_all_mode_covers_every_pair():
    assert len(build_tasks(GROUPS, ACCOUNTS, "all")) == len(GROUPS) * len(ACCOUNTS)


def test_distribute_mode_gives_one_account_per_group():
    tasks = build_tasks(GROUPS, ACCOUNTS, "distribute")

    assert [(t[0], t[1]) for t in tasks] == [
        ("user1", "group1"),
        ("user2", "group2"),
        ("user3", "group3"),
    ]


def test_target_type_is_carried_through():
    tasks = build_tasks(
        [{"type": "link", "value": "https://t.me/+abc"}], ["user1"], "all"
    )

    assert tasks[0][2] == "link"


def test_missing_type_defaults_to_username():
    tasks = build_tasks([{"value": "group1"}], ["user1"], "all")

    assert tasks[0][2] == "username"


def test_no_pause_between_accounts_on_the_same_group():
    tasks = build_tasks(GROUPS, ACCOUNTS, "all")

    assert should_delay_before_next(tasks, 0) is False
    assert should_delay_before_next(tasks, 1) is False


def test_pause_when_moving_to_the_next_group():
    tasks = build_tasks(GROUPS, ACCOUNTS, "all")

    assert should_delay_before_next(tasks, 2) is True


def test_never_pauses_after_the_final_task():
    tasks = build_tasks(GROUPS, ACCOUNTS, "all")

    assert should_delay_before_next(tasks, len(tasks) - 1) is False


def test_distribute_mode_pauses_after_every_task():
    tasks = build_tasks(GROUPS, ACCOUNTS, "distribute")

    assert all(should_delay_before_next(tasks, i) for i in range(len(tasks) - 1))


def test_single_group_never_pauses():
    tasks = build_tasks([GROUPS[0]], ACCOUNTS, "all")

    assert not any(should_delay_before_next(tasks, i) for i in range(len(tasks)))


def test_empty_inputs_produce_no_tasks():
    assert build_tasks([], ACCOUNTS, "all") == []
    assert build_tasks(GROUPS, [], "all") == []