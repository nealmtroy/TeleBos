"""Free-tier broadcast entitlement: watermark rendering and daily allowance."""

import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services import broadcast_entitlement as ent


class FakeResult:
    def __init__(self, rows):
        self._rows = rows

    def scalars(self):
        return self

    def all(self):
        return self._rows

    def scalar_one_or_none(self):
        return self._rows[0] if self._rows else None


class FakeDB:
    """Minimal session double keyed on the query the service issues.

    SQLAlchemy renders bound parameters as ``:param_1`` rather than inlining the
    literal, so settings are matched on the compiled parameter values rather
    than on the statement text.
    """

    def __init__(self, settings=None, details_by_job=None, jobs=None):
        self.settings = settings or {}
        self.details_by_job = details_by_job or []
        self.jobs = jobs if jobs is not None else []
        self.queries = []

    def _bound_values(self, stmt):
        try:
            return list(stmt.compile().params.values())
        except Exception:
            return []

    async def execute(self, stmt):
        text = str(stmt)
        self.queries.append(text)
        params = self._bound_values(stmt)

        if "smm_settings" in text:
            key = next((p for p in params if p in self.settings), None)
            row = self.settings.get(key) if key else None
            return FakeResult([row] if row is not None else [])

        if "broadcast_logs" in text:
            return FakeResult(self.details_by_job)

        if "broadcast_jobs" in text:
            return FakeResult(self.jobs)

        return FakeResult([])


def setting(key, value):
    return SimpleNamespace(key=key, value=value)


# ── Role gating ──────────────────────────────────────────────────────────────

@pytest.mark.parametrize("role", ["pro", "premium", "owner"])
def test_paid_roles_are_never_watermarked(role):
    assert ent.requires_watermark(role) is False


@pytest.mark.parametrize("role", ["basic", "pro", "premium", "owner"])
def test_only_the_free_role_requires_a_watermark(role):
    assert ent.requires_watermark(role) is (role == "basic")


def test_unknown_role_is_treated_as_free_rather_than_privileged():
    # Failing open here would let a misconfigured role broadcast unwatermarked.
    assert ent.requires_watermark("some_new_tier") is True


# ── Watermark rendering ──────────────────────────────────────────────────────

async def test_watermark_template_expands_the_official_channel():
    db = FakeDB(
        settings={
            ent.SETTING_WATERMARK_ENABLED: setting(ent.SETTING_WATERMARK_ENABLED, "true"),
            ent.SETTING_WATERMARK_TEXT: setting(ent.SETTING_WATERMARK_TEXT, "Bot by @{official}"),
        }
    )

    enabled, template = await ent.get_watermark_config(db)
    assert enabled is True
    assert ent.render_watermark(template) == "Bot by @telebos_official"


async def test_watermark_is_disabled_when_the_owner_turns_it_off():
    db = FakeDB(
        settings={
            ent.SETTING_WATERMARK_ENABLED: setting(ent.SETTING_WATERMARK_ENABLED, "false"),
        }
    )

    enabled, _template = await ent.get_watermark_config(db)
    assert enabled is False


async def test_watermark_defaults_apply_when_no_setting_exists():
    db = FakeDB()

    enabled, template = await ent.get_watermark_config(db)
    assert enabled is True
    assert ent.render_watermark(template) == "Bot by @telebos_official"


async def test_non_numeric_daily_limit_falls_back_to_five_hours():
    db = FakeDB(
        settings={ent.SETTING_FREE_DAILY_SECONDS: setting(ent.SETTING_FREE_DAILY_SECONDS, "abc")}
    )

    assert await ent.get_free_daily_limit(db) == 5 * 60 * 60


# ── Daily allowance ──────────────────────────────────────────────────────────

def _log_details(*entries):
    return entries


async def test_allowance_starts_at_the_full_limit_with_no_history():
    db = FakeDB(settings={}, details_by_job=[])

    assert await ent.get_remaining_broadcast_seconds(db, str(uuid.uuid4())) == 5 * 60 * 60


async def test_allowance_subtracts_only_successful_send_time():
    user_id = str(uuid.uuid4())
    db = FakeDB(
        details_by_job=[
            _log_details(
                {"status": "success", "send_ms": 400},
                {"status": "success", "send_ms": 600},
                # Failures and skipped targets must not consume the budget.
                {"status": "error", "send_ms": 900},
                {"status": "success"},
            )
        ]
    )

    remaining = await ent.get_remaining_broadcast_seconds(db, user_id)
    assert remaining == 5 * 60 * 60 - 1


async def test_allowance_never_goes_negative():
    user_id = str(uuid.uuid4())
    db = FakeDB(
        settings={
            ent.SETTING_FREE_DAILY_SECONDS: setting(ent.SETTING_FREE_DAILY_SECONDS, "10")
        },
        details_by_job=[_log_details({"status": "success", "send_ms": 99_000})],
    )

    assert await ent.get_remaining_broadcast_seconds(db, user_id) == 0


async def test_paid_roles_are_always_allowed():
    user = SimpleNamespace(id=uuid.uuid4(), role="premium")

    # A premium user with no history and an exhausted limit still passes.
    await ent.enforce_broadcast_allowance(MagicMock(), user)


async def test_free_role_is_refused_once_the_budget_is_spent():
    user = SimpleNamespace(id=uuid.uuid4(), role="basic")
    db = FakeDB(
        settings={
            ent.SETTING_FREE_DAILY_SECONDS: setting(ent.SETTING_FREE_DAILY_SECONDS, "5")
        },
        details_by_job=[_log_details({"status": "success", "send_ms": 9_000})],
    )

    with pytest.raises(ValueError, match="free daily broadcast time is used up"):
        await ent.enforce_broadcast_allowance(db, user)


async def test_free_role_with_budget_left_is_allowed():
    user = SimpleNamespace(id=uuid.uuid4(), role="basic")
    db = FakeDB(details_by_job=[_log_details({"status": "success", "send_ms": 1_000})])

    await ent.enforce_broadcast_allowance(db, user)


# ── Send-path helper (pure, no I/O) ──────────────────────────────────────────

def test_watermark_is_appended_once_per_message():
    from app.services.broadcast_service import _watermark_for_job

    result = _watermark_for_job("Bot by @telebos_official", "Hello groups")
    assert result == "Hello groups\n\nBot by @telebos_official"


def test_no_watermark_template_leaves_text_untouched():
    from app.services.broadcast_service import _watermark_for_job

    assert _watermark_for_job(None, "Hello groups") == "Hello groups"


def test_watermark_is_not_applied_twice_to_the_same_message():
    from app.services.broadcast_service import _watermark_for_job

    once = _watermark_for_job("Bot by @telebos_official", "Hello groups")
    assert _watermark_for_job("Bot by @telebos_official", once) == once


def test_empty_message_is_never_watermarked():
    from app.services.broadcast_service import _watermark_for_job

    assert _watermark_for_job("Bot by @telebos_official", "") == ""
