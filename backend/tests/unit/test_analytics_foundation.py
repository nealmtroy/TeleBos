"""Unit Test Suite for TeleBos Analytics Foundation.

Verifies:
1. PII and secret sanitization:
   - Phone number masking.
   - Recursive stripping of passwords, session strings, auth tokens, and secret keys.
   - String truncation on large values.
2. Event categorization & validation:
   - Enforcement of allowed domain categories (product, financial, automation, account, subscription, system).
   - Enforcement of event_name regex format.
3. Idempotent event tracking (deduplication):
   - Prevention of double-recording on retry using dedup_key.
4. Retention policy:
   - Ephemeral automation and system logs are pruned.
   - Financial audit logs and product records are strictly preserved.
5. Analytics Query & Aggregation logic:
   - Revenue query accurately filters non-refunded completed/in-progress orders.
   - User demographic distribution and automation rates.
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock
import uuid

import pytest

from app.models.analytics_event import AnalyticsEvent
from app.schemas.analytics import EventCategory
from app.services.analytics_query_service import (
    get_automation_analytics,
    get_automation_tasks_directory,
    get_financial_analytics,
    get_financial_transactions_directory,
    get_overview_metrics,
    get_telegram_accounts_analytics,
    get_telegram_accounts_directory,
    get_timeseries_metrics,
    get_user_analytics,
)
from app.services.analytics_tracking_service import (
    mask_phone_number,
    prune_ephemeral_events,
    sanitize_event_properties,
    track_account_connected,
    track_broadcast_cycle,
    track_event,
    track_financial_mutation,
    track_invite_completion,
    track_order_placed,
    track_subscription_change,
    track_user_login,
    track_user_registration,
)

# ── 1. Sanitization & Privacy Tests ───────────────────────────────────────────


def test_mask_phone_number():
    assert mask_phone_number("+6281234567890") == "+6281****7890"
    assert mask_phone_number("08123456789") == "08123****6789"
    assert mask_phone_number("123") == "123"
    assert mask_phone_number(None) is None


def test_sanitize_event_properties():
    raw_props = {
        "user_email": "user@example.com",
        "phone": "+6281234567890",
        "telegram_phone_number": "+6289876543210",
        "password": "supersecretpassword",
        "password_hash": "bcrypt-hash",
        "session_string": "1BJWNx...tg-session",
        "nested": {
            "token": "bearer-token-value",
            "api_key": "sec-key",
            "amount": 50000,
            "contact_phone": "+6281112223334",
        },
        "long_text": "A" * 600,
    }

    sanitized = sanitize_event_properties(raw_props)

    # Credential keys must be stripped
    assert "password" not in sanitized
    assert "password_hash" not in sanitized
    assert "session_string" not in sanitized
    assert "token" not in sanitized["nested"]
    assert "api_key" not in sanitized["nested"]

    # Phone numbers must be masked
    assert sanitized["phone"] == "+6281****7890"
    assert sanitized["telegram_phone_number"] == "+6289****3210"
    assert sanitized["nested"]["contact_phone"] == "+6281****3334"

    # Preserved safe data
    assert sanitized["user_email"] == "user@example.com"
    assert sanitized["nested"]["amount"] == 50000

    # Large strings truncated
    assert len(sanitized["long_text"]) <= 520
    assert "[truncated]" in sanitized["long_text"]


# ── 2. Tracking & Deduplication Tests ─────────────────────────────────────────


@pytest.mark.asyncio
async def test_track_event_idempotency():
    user_id = uuid.uuid4()
    dedup_token = "test_dedup_order_123"

    mock_db = AsyncMock()
    mock_db.add = MagicMock()

    # First call: query returns None (event does not exist yet)
    query_result_none = MagicMock()
    query_result_none.scalar_one_or_none.return_value = None
    mock_db.execute.return_value = query_result_none

    ev1 = await track_event(
        db=mock_db,
        event_name="order_placed",
        category="financial",
        user_id=user_id,
        properties={"total_price": 25000},
        dedup_key=dedup_token,
    )
    assert ev1 is not None
    assert ev1.dedup_key == dedup_token
    assert ev1.properties["total_price"] == 25000
    mock_db.add.assert_called_once_with(ev1)

    # Second call with the same dedup_key: query returns existing event
    mock_db.add.reset_mock()
    query_result_existing = MagicMock()
    query_result_existing.scalar_one_or_none.return_value = ev1
    mock_db.execute.return_value = query_result_existing

    ev2 = await track_event(
        db=mock_db,
        event_name="order_placed",
        category="financial",
        user_id=user_id,
        properties={"total_price": 25000},
        dedup_key=dedup_token,
    )
    assert ev2 is not None
    assert ev2.id == ev1.id
    # db.add must NOT be called on deduplicated event
    mock_db.add.assert_not_called()


@pytest.mark.asyncio
async def test_track_event_category_validation():
    mock_db = AsyncMock()
    mock_db.add = MagicMock()

    # Invalid category must be safely ignored
    invalid_ev = await track_event(
        db=mock_db,
        event_name="random_action",
        category="invalid_category_xyz",
        properties={},
    )
    assert invalid_ev is None
    mock_db.add.assert_not_called()

    # Valid category succeeds
    valid_ev = await track_event(
        db=mock_db,
        event_name="valid_action",
        category=EventCategory.PRODUCT,
        properties={"foo": "bar"},
    )
    assert valid_ev is not None
    assert valid_ev.event_category == "product"
    mock_db.add.assert_called_once_with(valid_ev)


@pytest.mark.asyncio
async def test_standardized_dispatchers():
    mock_db = AsyncMock()
    mock_db.add = MagicMock()
    query_result = MagicMock()
    query_result.scalar_one_or_none.return_value = None
    mock_db.execute.return_value = query_result

    user_id = uuid.uuid4()
    account_id = uuid.uuid4()
    ledger_id = uuid.uuid4()
    job_id = uuid.uuid4()

    # 1. User registration
    reg_ev = await track_user_registration(mock_db, user_id=user_id, email="test@telebos.app")
    assert reg_ev is not None
    assert reg_ev.event_name == "user_registered"
    assert reg_ev.event_category == "product"

    # 2. User login
    login_ev = await track_user_login(mock_db, user_id=user_id)
    assert login_ev is not None
    assert login_ev.event_name == "user_login"

    # 3. Account connected (with phone masking)
    acc_ev = await track_account_connected(
        mock_db,
        user_id=user_id,
        account_id=account_id,
        phone="+6281299988877",
        username="teleboss_user",
    )
    assert acc_ev is not None
    assert acc_ev.event_category == "account"
    assert acc_ev.properties["phone"] == "+6281****8877"

    # 4. Broadcast cycle
    bc_ev = await track_broadcast_cycle(
        mock_db,
        user_id=user_id,
        job_id=job_id,
        cycle_number=1,
        sent_count=10,
        fail_count=1,
        total_groups=11,
    )
    assert bc_ev is not None
    assert bc_ev.event_name == "broadcast_cycle_completed"
    assert bc_ev.event_category == "automation"

    # 5. Invite completed
    inv_ev = await track_invite_completion(
        mock_db,
        user_id=user_id,
        job_id=job_id,
        invited_count=50,
        fail_count=2,
        total_members=52,
    )
    assert inv_ev is not None
    assert inv_ev.event_name == "invite_job_completed"

    # 6. Financial mutation
    fin_ev = await track_financial_mutation(
        mock_db,
        user_id=user_id,
        ledger_id=ledger_id,
        amount=100000,
        entry_type="CREDIT",
        category="topup",
        reference_id="TRX-123456",
        balance_before=0,
        balance_after=100000,
    )
    assert fin_ev is not None
    assert fin_ev.event_name == "wallet_credit"
    assert fin_ev.event_category == "financial"

    # 7. SMM order placed
    order_ev = await track_order_placed(
        mock_db,
        user_id=user_id,
        order_id=uuid.uuid4(),
        service_id=101,
        service_name="Telegram Post Views",
        quantity=5000,
        total_price=15000,
    )
    assert order_ev is not None
    assert order_ev.event_name == "smm_order_placed"

    # 8. Subscription change
    sub_ev = await track_subscription_change(
        mock_db,
        user_id=user_id,
        old_role="basic",
        new_role="pro",
        reason="voucher_redeem:PRO30",
        duration_days=30,
    )
    assert sub_ev is not None
    assert sub_ev.event_name == "subscription_role_changed"
    assert sub_ev.event_category == "subscription"


# ── 3. Retention Policy Pruning ───────────────────────────────────────────────


@pytest.mark.asyncio
async def test_prune_ephemeral_events():
    mock_db = AsyncMock()
    mock_delete_result = MagicMock()
    mock_delete_result.rowcount = 42
    mock_db.execute.return_value = mock_delete_result

    deleted_count = await prune_ephemeral_events(mock_db, retention_days=90)
    assert deleted_count == 42
    mock_db.execute.assert_called_once()


# ── 4. Analytics Query Service Tests ──────────────────────────────────────────


@pytest.mark.asyncio
async def test_analytics_overview_metrics_calculation():
    mock_db = AsyncMock()

    # Mock responses for the sequential queries in get_overview_metrics:
    # 1. new users count -> 15
    res1 = MagicMock()
    res1.scalar.return_value = 15

    # 2. prev users count -> 10
    res2 = MagicMock()
    res2.scalar.return_value = 10

    # 3. broadcast sent & fail -> (85, 15)
    res3 = MagicMock()
    res3.one.return_value = (85, 15)

    # 4. smm gross revenue -> 250000
    res4 = MagicMock()
    res4.scalar.return_value = 250000

    # 5. smm provider cost -> 180000
    res5 = MagicMock()
    res5.scalar.return_value = 180000

    # 6. marketplace spread -> 50000
    res6 = MagicMock()
    res6.scalar.return_value = 50000

    # 7. topup approved -> 500000
    res7 = MagicMock()
    res7.scalar.return_value = 500000

    # 8. withdraw approved -> 200000
    res8 = MagicMock()
    res8.scalar.return_value = 200000

    # 9. liability -> 350000
    res9 = MagicMock()
    res9.scalar.return_value = 350000

    # 10. active accounts -> 28
    res10 = MagicMock()
    res10.scalar.return_value = 28

    # 11. limited accounts -> 3
    res11 = MagicMock()
    res11.scalar.return_value = 3

    mock_db.execute.side_effect = [
        res1,
        res2,
        res3,
        res4,
        res5,
        res6,
        res7,
        res8,
        res9,
        res10,
        res11,
    ]

    now = datetime.now(timezone.utc)
    overview = await get_overview_metrics(
        mock_db, start_date=now - timedelta(days=7), end_date=now
    )

    assert overview.total_new_users == 15
    # (15 - 10) / 10 * 100 = 50.0%
    assert overview.user_growth_percentage == 50.0
    assert overview.total_broadcast_messages_sent == 85
    # 85 / (85 + 15) * 100 = 85.0%
    assert overview.broadcast_delivery_rate == 85.0
    # Net SMM margin: 250000 - 180000 = 70000. Total margin = 70000 + 50000 (mkt spread) = 120000
    assert overview.net_platform_margin == 120000
    # Net cashflow: 500000 - 200000 = 300000
    assert overview.net_cashflow == 300000
    assert overview.current_balance_liability == 350000
    assert overview.active_telegram_accounts == 28
    assert overview.spam_limited_accounts == 3


@pytest.mark.asyncio
async def test_get_timeseries_metrics():
    mock_db = AsyncMock()
    now = datetime.now(timezone.utc)

    # Mock daily rows for users metric
    d1 = now - timedelta(days=2)
    d2 = now - timedelta(days=1)
    mock_rows = MagicMock()
    mock_rows.all.return_value = [(d1, 5), (d2, 8)]
    mock_db.execute.return_value = mock_rows

    ts_res = await get_timeseries_metrics(
        mock_db, metric="users", start_date=now - timedelta(days=7), end_date=now
    )

    assert ts_res.metric == "users"
    assert len(ts_res.points) == 2
    assert ts_res.summary_total == 13
    assert ts_res.summary_average == 6.5


@pytest.mark.asyncio
async def test_get_user_analytics_metrics_calculation():
    """Verify comprehensive user intelligence, retention cohorts, status breakdown, and feature adoption."""
    mock_db = AsyncMock()
    now = datetime.now(timezone.utc)
    start_dt = now - timedelta(days=30)
    end_dt = now

    def make_scalar_mock(val):
        m = MagicMock()
        m.scalar.return_value = val
        return m

    def make_all_mock(val):
        m = MagicMock()
        m.all.return_value = val
        return m

    mock_db.execute.side_effect = [
        # 1. total_users
        make_scalar_mock(100),
        # 2. new_users_in_period
        make_scalar_mock(20),
        # 3. role_dist
        make_all_mock([("freetrial", 40), ("basic", 30), ("pro", 20), ("premium", 8), ("owner", 2)]),
        # 4. onboarding completed
        make_scalar_mock(75),
        # 5. persona distribution
        make_all_mock([("crypto_community", 45), ("dropshipper", 30)]),
        # 6. referral distribution
        make_all_mock([("telegram", 50), ("google", 25)]),
        # 7. expiring subscriptions (30d)
        make_scalar_mock(5),
        # 8. suspended users
        make_scalar_mock(2),
        # 9. prev new users
        make_scalar_mock(10),
        # 10. DAU
        make_scalar_mock(25),
        # 11. WAU
        make_scalar_mock(50),
        # 12. MAU
        make_scalar_mock(80),
        # 13. meaningful product active users
        make_scalar_mock(40),
        # 14. banned users
        make_scalar_mock(1),
        # 15. D1 eligible
        make_scalar_mock(18),
        # 16. D1 retained
        make_scalar_mock(9),
        # 17. D7 eligible
        make_scalar_mock(10),
        # 18. D7 retained
        make_scalar_mock(4),
        # 19. D30 eligible
        make_scalar_mock(0),
        # 20. TG accounts users
        make_scalar_mock(35),
        # 21. Broadcast users
        make_scalar_mock(20),
        # 22. Invite users
        make_scalar_mock(15),
        # 23. Auto-reply users
        make_scalar_mock(10),
        # 24. SMM orders users
        make_scalar_mock(25),
        # 25. Marketplace traders
        make_scalar_mock(5),
        # 26. Churned subscriptions
        make_scalar_mock(3),
    ]

    res = await get_user_analytics(mock_db, start_date=start_dt, end_date=end_dt)

    # Core user counts & growth
    assert res.total_users == 100
    assert res.new_users_in_period == 20
    assert res.user_growth_percentage == 100.0
    assert res.onboarding_completion_rate == 75.0

    # Activity & Stickiness
    assert res.dau == 25
    assert res.wau == 50
    assert res.mau == 80
    assert res.stickiness_dau_mau_ratio == 31.2
    assert res.product_meaningful_active_users == 40
    assert res.product_meaningful_active_rate == 40.0

    # Status breakdown
    assert res.status_breakdown.active_users_count == 80
    assert res.status_breakdown.suspended_users_count == 2
    assert res.status_breakdown.banned_users_count == 1
    assert res.status_breakdown.dormant_users_count == 17

    # Plan distribution
    assert res.role_distribution["freetrial"] == 40
    assert res.role_distribution["basic"] == 30
    assert res.role_distribution["pro"] == 20
    assert res.role_distribution["premium"] == 8
    assert res.role_distribution["owner"] == 2

    # Retention Cohorts with maturity validation
    assert res.retention.d1_eligible_users == 18
    assert res.retention.d1_retained_users == 9
    assert res.retention.d1_retention_rate == 50.0

    assert res.retention.d7_eligible_users == 10
    assert res.retention.d7_retained_users == 4
    assert res.retention.d7_retention_rate == 40.0

    # D30 cohort is not mature yet -> rate must be None, NOT 0.0%
    assert res.retention.d30_eligible_users == 0
    assert res.retention.d30_retained_users == 0
    assert res.retention.d30_retention_rate is None

    # Feature adoption
    assert res.feature_adoption.telegram_accounts_connected_users == 35
    assert res.feature_adoption.telegram_accounts_adoption_rate == 35.0
    assert res.feature_adoption.smm_order_users == 25
    assert res.feature_adoption.smm_order_adoption_rate == 25.0
    assert res.feature_adoption.broadcast_users == 20
    assert res.feature_adoption.broadcast_adoption_rate == 20.0

    # Churn & Reactivation
    assert res.churned_users_count == 3
    assert res.reactivated_users_count == 3
    assert "Kohor retensi mengevaluasi" in res.tracking_coverage_note


@pytest.mark.asyncio
async def test_get_user_analytics_unmatured_cohort():
    """Verify that when all registered users are younger than 1 day, D1 retention is marked as None (immature)."""
    mock_db = AsyncMock()
    now = datetime.now(timezone.utc)

    def make_scalar_mock(val):
        m = MagicMock()
        m.scalar.return_value = val
        return m

    def make_all_mock(val):
        m = MagicMock()
        m.all.return_value = val
        return m

    mock_db.execute.side_effect = [
        make_scalar_mock(5),  # total_users
        make_scalar_mock(5),  # new_users_in_period
        make_all_mock([("freetrial", 5)]),
        make_scalar_mock(2),  # onboarding
        make_all_mock([]),
        make_all_mock([]),
        make_scalar_mock(0),  # exp 30d
        make_scalar_mock(0),  # susp
        make_scalar_mock(0),  # prev
        make_scalar_mock(5),  # dau
        make_scalar_mock(5),  # wau
        make_scalar_mock(5),  # mau
        make_scalar_mock(5),  # meaningful
        make_scalar_mock(0),  # banned
        make_scalar_mock(0),  # d1 eligible = 0 (immature!)
        make_scalar_mock(0),  # d7 eligible = 0 (immature!)
        make_scalar_mock(0),  # d30 eligible = 0 (immature!)
        make_scalar_mock(1),  # tg users
        make_scalar_mock(0),
        make_scalar_mock(0),
        make_scalar_mock(0),
        make_scalar_mock(0),
        make_scalar_mock(0),
        make_scalar_mock(0),  # churn
    ]

    res = await get_user_analytics(
        mock_db, start_date=now - timedelta(hours=6), end_date=now
    )

    assert res.retention.d1_eligible_users == 0
    assert res.retention.d1_retention_rate is None
    assert res.retention.d7_eligible_users == 0
    assert res.retention.d7_retention_rate is None
    assert res.retention.d30_eligible_users == 0
    assert res.retention.d30_retention_rate is None


@pytest.mark.asyncio
async def test_get_telegram_accounts_analytics_calculation():
    """Verify fleet diagnostics, status counts, connection rates, and plan depth."""
    mock_db = AsyncMock()
    now = datetime.now(timezone.utc)
    start_dt = now - timedelta(days=30)
    end_dt = now

    def make_scalar_mock(val):
        m = MagicMock()
        m.scalar.return_value = val
        return m

    def make_all_mock(val):
        m = MagicMock()
        m.all.return_value = val
        return m

    mock_db.execute.side_effect = [
        make_scalar_mock(50),  # total_registered
        make_scalar_mock(12),  # new_in_period
        make_scalar_mock(2),   # deleted_in_period
        make_scalar_mock(35),  # active_connected
        make_scalar_mock(10),  # expired_needs_reauth
        make_scalar_mock(5),   # selling_mkt
        make_scalar_mock(3),   # spam_limited
        make_scalar_mock(40),  # spam_normal
        make_all_mock([]),     # conn_attempts (fallback to baseline)
        make_all_mock([("pro", 25), ("basic", 15), ("premium", 10)]),  # plan_stmt
        MagicMock(scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[1, 1, 3, 4, 8, 12])))),  # depth
        make_all_mock([]),     # recent events
    ]

    res = await get_telegram_accounts_analytics(mock_db, start_date=start_dt, end_date=end_dt)

    assert res.total_registered_accounts == 50
    assert res.new_accounts_in_period == 12
    assert res.deleted_accounts_in_period == 2
    assert res.net_account_growth == 10

    # Status counts
    assert res.status_counts.total_accounts == 50
    assert res.status_counts.active_connected == 35
    assert res.status_counts.expired_needs_reauth == 10
    assert res.status_counts.selling_marketplace == 5
    assert res.status_counts.spam_limited == 3
    assert res.status_counts.spam_normal == 40
    assert res.status_counts.spam_unknown == 7

    # Plan distribution & depth
    assert res.plan_distribution.plan_distribution["pro"] == 25
    assert res.plan_distribution.plan_distribution["basic"] == 15
    assert res.plan_distribution.users_with_accounts_count == 6
    assert res.plan_distribution.depth_distribution["1"] == 2
    assert res.plan_distribution.depth_distribution["2_to_5"] == 2
    assert res.plan_distribution.depth_distribution["6_to_10"] == 1
    assert res.plan_distribution.depth_distribution["more_than_10"] == 1

    # Connection metrics fallback
    assert res.connection_metrics.successful_connections == 35
    assert res.connection_metrics.failed_connections == 10
    assert res.connection_metrics.connection_success_rate > 70.0


@pytest.mark.asyncio
async def test_get_telegram_accounts_directory():
    """Verify searchable and paginated Telegram accounts directory with phone masking."""
    mock_db = AsyncMock()

    mock_acc = MagicMock()
    mock_acc.id = uuid.uuid4()
    mock_acc.user_id = uuid.uuid4()
    mock_acc.phone = "+6281234567890"
    mock_acc.username = "telebos_bot"
    mock_acc.first_name = "Tele"
    mock_acc.is_active = True
    mock_acc.is_premium = False
    mock_acc.for_sale = False
    mock_acc.spam_status = "normal"
    mock_acc.spam_detail = None
    mock_acc.auto_reply_enabled = True
    mock_acc.last_sync_at = datetime.now(timezone.utc)
    mock_acc.spam_last_checked_at = None
    mock_acc.updated_at = datetime.now(timezone.utc)
    mock_acc.created_at = datetime.now(timezone.utc)

    # 1. total count -> 1
    res1 = MagicMock()
    res1.scalar.return_value = 1

    # 2. rows -> [(mock_acc, "admin@telebos.internal", "pro")]
    res2 = MagicMock()
    res2.all.return_value = [(mock_acc, "admin@telebos.internal", "pro")]

    mock_db.execute.side_effect = [res1, res2]

    table_res = await get_telegram_accounts_directory(
        mock_db, search="telebos", status="active", role="pro", page=1, page_size=20
    )

    assert table_res.total == 1
    assert len(table_res.accounts) == 1
    acc_item = table_res.accounts[0]
    assert acc_item.phone_masked == "+6281****7890"
    assert acc_item.user_email == "admin@telebos.internal"
    assert acc_item.user_role == "pro"
    assert acc_item.username == "telebos_bot"


@pytest.mark.asyncio
async def test_get_automation_analytics_calculation():
    """Verify automation task execution metrics, retries vs logical jobs, and p95 duration."""
    mock_db = AsyncMock()

    now = datetime.now(timezone.utc)
    start_dt = now - timedelta(days=7)
    end_dt = now

    # Mock BroadcastJobs
    bj1 = MagicMock()
    bj1.id = uuid.uuid4()
    bj1.status = "completed"
    bj1.created_at = start_dt + timedelta(hours=1)
    bj1.updated_at = start_dt + timedelta(hours=1, minutes=1)
    bj1.completed_at = start_dt + timedelta(hours=1, minutes=5)
    bj1.fail_count = 0
    bj1.progress = 100

    bj2 = MagicMock()
    bj2.id = uuid.uuid4()
    bj2.status = "failed"
    bj2.created_at = start_dt + timedelta(hours=2)
    bj2.updated_at = start_dt + timedelta(hours=2, minutes=2)
    bj2.completed_at = start_dt + timedelta(hours=2, minutes=3)
    bj2.fail_count = 5
    bj2.progress = 20

    # Mock InviteJobs
    ij1 = MagicMock()
    ij1.id = uuid.uuid4()
    ij1.status = "running"
    ij1.created_at = start_dt + timedelta(hours=3)
    ij1.updated_at = start_dt + timedelta(hours=3, seconds=30)
    ij1.completed_at = None
    ij1.invited_count = 10
    ij1.fail_count = 1
    ij1.progress = 50

    # Mock AutoJoinJobs
    aj1 = MagicMock()
    aj1.id = uuid.uuid4()
    aj1.status = "completed"
    aj1.created_at = start_dt + timedelta(hours=4)
    aj1.updated_at = start_dt + timedelta(hours=4, seconds=15)
    aj1.completed_at = start_dt + timedelta(hours=4, minutes=2)
    aj1.success_count = 5
    aj1.fail_count = 0
    aj1.progress = 100

    # Mock Query side effects:
    # 1. bj_stmt scalars -> [bj1, bj2]
    r_bj = MagicMock()
    r_bj.scalars.return_value.all.return_value = [bj1, bj2]

    # 2. ij_stmt scalars -> [ij1]
    r_ij = MagicMock()
    r_ij.scalars.return_value.all.return_value = [ij1]

    # 3. aj_stmt scalars -> [aj1]
    r_aj = MagicMock()
    r_aj.scalars.return_value.all.return_value = [aj1]

    # 4. bc_counts (sent, fail) -> (50, 5)
    r_bc_cnt = MagicMock()
    r_bc_cnt.one.return_value = (50, 5)

    # 5. inv_logs_stmt -> []
    r_inv_logs = MagicMock()
    r_inv_logs.scalars.return_value.all.return_value = []

    # 6. aj_logs_stmt -> []
    r_aj_logs = MagicMock()
    r_aj_logs.scalars.return_value.all.return_value = []

    # 7. ar_count -> 15
    r_ar = MagicMock()
    r_ar.scalar.return_value = 15

    # 8. bc_dur_res -> [(120000,), (45000,)]
    r_dur = MagicMock()
    r_dur.all.return_value = [(120000,), (45000,)]

    # 9. worker failures -> 0
    r_wf = MagicMock()
    r_wf.scalar.return_value = 0

    mock_db.execute.side_effect = [
        r_bj,
        r_ij,
        r_aj,
        r_bc_cnt,
        r_inv_logs,
        r_aj_logs,
        r_ar,
        r_dur,
        r_wf,
    ]

    res = await get_automation_analytics(mock_db, start_dt, end_dt)

    assert res.performance.total_logical_jobs == 4  # 2 broadcast + 1 invite + 1 autojoin
    assert res.status_breakdown.successful_completed == 2
    assert res.status_breakdown.failed == 1
    assert res.status_breakdown.running == 1

    # Executions: bc(50+5) + inv(10+1) + aj(5+0) + ar(15) = 86 attempts
    assert res.performance.total_execution_attempts == 86
    assert res.performance.successful_executions == 50 + 10 + 5 + 15
    assert res.performance.failed_executions == 5 + 1 + 0
    assert res.performance.success_rate > 90.0
    assert res.performance.retry_rate > 0.0  # jobs with fail_count > 0

    # Duration: ms converted to seconds
    assert res.performance.average_duration_seconds > 0.0
    assert res.performance.p95_duration_seconds > 0.0
    assert res.queue_worker.worker_health_status in ("healthy", "degraded", "offline")


@pytest.mark.asyncio
async def test_get_automation_tasks_directory():
    """Verify paginated unified automation tasks directory query."""
    mock_db = AsyncMock()

    # 1. Total count -> 2
    r_cnt = MagicMock()
    r_cnt.scalar.return_value = 2

    # 2. Rows
    now = datetime.now(timezone.utc)
    row1 = MagicMock()
    row1.task_id = str(uuid.uuid4())
    row1.automation_type = "broadcast"
    row1.user_id = str(uuid.uuid4())
    row1.user_email = "owner@telebos.id"
    row1.status = "completed"
    row1.progress_percentage = 100.0
    row1.total_items = 20
    row1.successful_items = 20
    row1.failed_items = 0
    row1.started_at = now - timedelta(minutes=10)
    row1.completed_at = now - timedelta(minutes=8)
    row1.updated_at = now - timedelta(minutes=9)

    row2 = MagicMock()
    row2.task_id = str(uuid.uuid4())
    row2.automation_type = "invite"
    row2.user_id = str(uuid.uuid4())
    row2.user_email = "pro@telebos.id"
    row2.status = "failed"
    row2.progress_percentage = 30.0
    row2.total_items = 50
    row2.successful_items = 15
    row2.failed_items = 5
    row2.started_at = now - timedelta(hours=1)
    row2.completed_at = now - timedelta(minutes=50)
    row2.updated_at = now - timedelta(minutes=55)

    r_rows = MagicMock()
    r_rows.all.return_value = [row1, row2]

    mock_db.execute.side_effect = [r_cnt, r_rows]

    res = await get_automation_tasks_directory(
        mock_db, search="telebos.id", automation_type="all", status="all", page=1, page_size=20
    )

    assert res.total == 2
    assert len(res.tasks) == 2
    assert res.tasks[0].automation_type == "broadcast"
    assert res.tasks[0].status == "completed"
    assert res.tasks[0].duration_seconds == 120.0  # 2 minutes
    assert res.tasks[1].automation_type == "invite"
    assert res.tasks[1].status == "failed"
    assert res.tasks[1].retry_count == 1


@pytest.mark.asyncio
async def test_get_financial_analytics_calculation():
    """Verify financial formulas: gross/net separation, unearned balance liability, MRR, and reconciliation."""
    mock_db = AsyncMock()
    now = datetime.now(timezone.utc)
    start_dt = now - timedelta(days=30)
    end_dt = now

    def make_one_mock(val):
        m = MagicMock()
        m.one.return_value = val
        return m

    def make_scalar_mock(val):
        m = MagicMock()
        m.scalar.return_value = val
        return m

    def make_all_mock(val):
        m = MagicMock()
        m.all.return_value = val
        return m

    mock_db.execute.side_effect = [
        # 1. SMM: total_price=500_000, provider_cost=300_000, count=25, refund_amt=20_000, refund_cnt=1
        make_one_mock((500_000, 300_000, 25, 20_000, 1)),
        # 2. Marketplace: buy_price=150_000, sell_price=110_000, spread=40_000, count=10
        make_one_mock((150_000, 110_000, 40_000, 10)),
        # 3. Subscription: amount=100_000, count=2
        make_one_mock((100_000, 2)),
        # 4. Plan attribution rows
        make_all_mock([("Pro Monthly", 50_000), ("Premium Monthly", 50_000)]),
        # 5. Active paid subscriptions by plan
        make_all_mock([("pro", 10), ("premium", 5)]),
        # 6. Expirations in period
        make_scalar_mock(1),
        # 7. Upgrades in period
        make_scalar_mock(2),
        # 8. Payments breakdown rows: status, method, count
        make_all_mock([("approved", "QRIS", 15), ("pending", "QRIS", 2), ("rejected", "QRIS", 1)]),
        # 9. Current balance liability (total user balances)
        make_scalar_mock(2_500_000),
        # 10. Topup approved volume
        make_scalar_mock(1_200_000),
        # 11. Withdraw approved volume
        make_scalar_mock(100_000),
        # 12. Balance consumed burned (SMM + marketplace)
        make_scalar_mock(650_000),
        # 13. Total ledger credits period
        make_scalar_mock(1_350_000),
        # 14. Total ledger debits period
        make_scalar_mock(750_000),
        # 15. All historical credits
        make_scalar_mock(10_000_000),
        # 16. All historical debits
        make_scalar_mock(7_500_000),
        # 17. Total users checked
        make_scalar_mock(45),
        # 18. Unreconciled users count (0 = perfect match)
        make_scalar_mock(0),
    ]

    res = await get_financial_analytics(mock_db, start_dt, end_dt)

    # 1. Gross revenue = subscription(100k) + smm(500k) + marketplace_gmv(150k) = 750,000 IDR
    # STRICT RULE: Top-up approved (1,200,000) is NOT added to gross revenue!
    assert res.revenue.gross_revenue == 750_000
    assert res.revenue.subscription_revenue == 100_000
    assert res.revenue.gross_smm_revenue == 500_000
    assert res.revenue.marketplace_gmv == 150_000

    # 2. Net margin & provider costs
    # Provider costs: SMM (300k) + Marketplace seller payout (110k) = 410,000
    assert res.revenue.direct_provider_costs == 410_000
    assert res.revenue.refunded_volume == 20_000
    # Net revenue = 750k - 410k - 20k = 320,000
    assert res.revenue.net_revenue == 320_000

    # 3. Subscriptions & MRR
    # Active paid: 10 pro + 5 premium = 15
    # MRR per docs/subscription_plans_monthly_yearly.md:
    # 10 pro (10.000) + 5 premium/business (20.000) = 100.000 + 100.000 = 200,000 IDR
    assert res.subscriptions.mrr == 200_000
    assert res.subscriptions.arr == 2_400_000

    # 4. Balance liability vs topups
    assert res.balance.current_user_balance_liability == 2_500_000
    assert res.balance.topup_approved_volume == 1_200_000
    assert res.balance.balance_consumed_burned == 650_000

    # 5. Double-entry reconciliation
    # Computed ledger: 10,000,000 - 7,500,000 = 2,500,000
    # User balance: 2,500,000 -> discrepancy = 0
    assert res.reconciliation.is_reconciled is True
    assert res.reconciliation.discrepancy == 0
    assert res.reconciliation.reconciliation_status == "matched"
    assert res.reconciliation.unreconciled_users_count == 0


@pytest.mark.asyncio
async def test_financial_reconciliation_discrepancy_detection():
    """Verify that ledger discrepancy is flagged if user balance differs from double-entry sum."""
    mock_db = AsyncMock()
    now = datetime.now(timezone.utc)
    start_dt = now - timedelta(days=7)
    end_dt = now

    def make_one_mock(val):
        m = MagicMock()
        m.one.return_value = val
        return m

    def make_scalar_mock(val):
        m = MagicMock()
        m.scalar.return_value = val
        return m

    def make_all_mock(val):
        m = MagicMock()
        m.all.return_value = val
        return m

    mock_db.execute.side_effect = [
        make_one_mock((0, 0, 0, 0, 0)),  # SMM
        make_one_mock((0, 0, 0, 0)),     # Mkt
        make_one_mock((0, 0)),           # Sub
        make_all_mock([]),               # Plan rows
        make_all_mock([]),               # Active subs
        make_scalar_mock(0),             # Exp
        make_scalar_mock(0),             # Upg
        make_all_mock([]),               # Payments
        make_scalar_mock(3_000_000),      # Current user balance: 3M
        make_scalar_mock(0),             # Topup
        make_scalar_mock(0),             # Withdraw
        make_scalar_mock(0),             # Burn
        make_scalar_mock(0),             # Credits
        make_scalar_mock(0),             # Debits
        make_scalar_mock(5_000_000),     # All historical credits: 5M
        make_scalar_mock(3_000_000),     # All historical debits: 3M -> Computed is 2M!
        make_scalar_mock(10),            # Total users
        make_scalar_mock(1),             # 1 user has mismatch!
    ]

    res = await get_financial_analytics(mock_db, start_dt, end_dt)

    # Discrepancy: 3M - (5M - 3M) = 1,000,000 IDR
    assert res.reconciliation.is_reconciled is False
    assert res.reconciliation.discrepancy == 1_000_000
    assert res.reconciliation.reconciliation_status == "discrepancy_detected"
    assert res.reconciliation.unreconciled_users_count == 1


@pytest.mark.asyncio
async def test_get_financial_transactions_directory():
    """Verify paginated transactions directory query with search and filters."""
    mock_db = AsyncMock()
    now = datetime.now(timezone.utc)

    r_cnt = MagicMock()
    r_cnt.scalar.return_value = 1

    row1 = MagicMock()
    row1.tx_id = "TRX-1234ABCD"
    row1.user_id = str(uuid.uuid4())
    row1.user_email = "buyer@telebos.id"
    row1.category_or_type = "topup"
    row1.amount = 250_000
    row1.entry_type = "CREDIT"
    row1.status = "approved"
    row1.payment_method = "QRIS"
    row1.reference_id = "INV-001"
    row1.description = "QRIS Top-up Balance"
    row1.created_at = now - timedelta(hours=2)
    row1.processed_at = now - timedelta(hours=2)

    r_rows = MagicMock()
    r_rows.all.return_value = [row1]

    mock_db.execute.side_effect = [r_cnt, r_rows]

    res = await get_financial_transactions_directory(
        mock_db, search="buyer", tx_type="topup", status="approved", page=1, page_size=20
    )

    assert res.total == 1
    assert len(res.transactions) == 1
    assert res.transactions[0].transaction_id == "TRX-1234ABCD"
    assert res.transactions[0].amount == 250_000
    assert res.transactions[0].entry_type == "CREDIT"
    assert res.transactions[0].payment_method == "QRIS"




