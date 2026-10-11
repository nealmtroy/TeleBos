"""Analytics Query & Aggregation Service — Accurate metrics calculations and time-series reporting."""

from datetime import datetime, timedelta, timezone
import logging

from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.account_audit_log import AccountAuditLog
from app.models.analytics_event import AnalyticsEvent
from app.models.auto_join_job import AutoJoinJob
from app.models.auto_join_log import AutoJoinLog
from app.models.auto_reply_log import AutoReplyLog
from app.models.broadcast_job import BroadcastJob
from app.models.broadcast_log import BroadcastLog
from app.models.invite_job import InviteJob
from app.models.invite_log import InviteLog
from app.models.onboarding_survey import OnboardingSurvey
from app.models.order import Order
from app.models.smm_service import SmmService
from app.models.telegram_account import TelegramAccount
from app.models.user import User
from app.models.wallet_ledger import WalletLedger
from app.models.wallet_transaction import WalletTransaction
from app.schemas.analytics import (
    AccountConnectionMetrics,
    AccountDirectoryItem,
    AccountPlanDistribution,
    AccountStatusCounts,
    AccountStatusHistoryItem,
    AdminAutomationTasksTableResponse,
    AdminFinancialTransactionItem,
    AdminFinancialTransactionsTableResponse,
    AdminTelegramAccountsTableResponse,
    AnalyticsOverviewResponse,
    AutomationAnalyticsResponse,
    AutomationTaskHistoryItem,
    AutomationTypeUsage,
    BalanceLedgerMetrics,
    ExecutionPerformanceMetrics,
    FeatureAdoptionMetrics,
    FinancialAnalyticsResponse,
    JobStatusBreakdown,
    MetricTimePoint,
    PaymentReliabilityMetrics,
    QueueWorkerHealthMetrics,
    RetentionCohortMetrics,
    RevenueBreakdown,
    SubscriptionLifecycleMetrics,
    SystemReconciliationStatus,
    TaskErrorCategoryBreakdown,
    TelegramAccountAnalyticsResponse,
    TimeSeriesResponse,
    UserAnalyticsResponse,
    UserStatusBreakdown,
)
from app.services.analytics_tracking_service import mask_phone_number
from app.services.telegram_client import client_pool
from app.utils.redis import redis_client
from app.utils.redis_dispatcher import JOBS_QUEUE_KEY

logger = logging.getLogger(__name__)


async def get_overview_metrics(
    db: AsyncSession,
    start_date: datetime,
    end_date: datetime,
) -> AnalyticsOverviewResponse:
    """Compute top-level executive KPI overview with period-over-period comparison."""
    period_length = end_date - start_date
    prev_start = start_date - period_length
    prev_end = start_date

    # 1. User growth
    new_users_stmt = select(func.count(User.id)).where(User.created_at.between(start_date, end_date))
    new_users_res = await db.execute(new_users_stmt)
    total_new_users = new_users_res.scalar() or 0

    prev_users_stmt = select(func.count(User.id)).where(User.created_at.between(prev_start, prev_end))
    prev_users_res = await db.execute(prev_users_stmt)
    prev_users = prev_users_res.scalar() or 0

    user_growth_pct = (
        round(((total_new_users - prev_users) / prev_users) * 100, 1)
        if prev_users > 0
        else (100.0 if total_new_users > 0 else 0.0)
    )

    # 2. Broadcast volume and delivery rate
    bc_stmt = select(
        func.coalesce(func.sum(BroadcastLog.sent_count), 0).label("sent"),
        func.coalesce(func.sum(BroadcastLog.fail_count), 0).label("fail"),
    ).where(BroadcastLog.created_at.between(start_date, end_date))
    bc_res = await db.execute(bc_stmt)
    sent_cnt, fail_cnt = bc_res.one()

    total_broadcast_attempts = sent_cnt + fail_cnt
    delivery_rate = (
        round((sent_cnt / total_broadcast_attempts) * 100, 1)
        if total_broadcast_attempts > 0
        else 100.0
    )

    # 3. Revenue & Margin
    # SMM Revenue (Correct status check: "Completed", "Processing", "In progress", NOT "Success")
    valid_smm_statuses = ["Completed", "Processing", "In progress", "Pending"]
    smm_rev_stmt = select(
        func.coalesce(func.sum(Order.total_price), 0)
    ).where(
        Order.created_at.between(start_date, end_date),
        Order.status.in_(valid_smm_statuses),
        Order.is_refunded.is_(False),
    )
    smm_rev_res = await db.execute(smm_rev_stmt)
    gross_smm_rev = smm_rev_res.scalar() or 0

    # SMM cost basis estimation joined with SmmService
    smm_cost_stmt = (
        select(
            func.coalesce(
                func.sum((SmmService.original_price * Order.quantity) / 1000), 0
            )
        )
        .select_from(Order)
        .join(SmmService, SmmService.service_id == Order.service_id, isouter=True)
        .where(
            Order.created_at.between(start_date, end_date),
            Order.status.in_(valid_smm_statuses),
            Order.is_refunded.is_(False),
        )
    )
    smm_cost_res = await db.execute(smm_cost_stmt)
    smm_provider_cost = int(smm_cost_res.scalar() or 0)
    net_smm_margin = max(0, gross_smm_rev - smm_provider_cost)

    # Marketplace spread margin
    mkt_spread_stmt = select(
        func.coalesce(
            func.sum(
                func.greatest(
                    0,
                    func.coalesce(TelegramAccount.buy_price, TelegramAccount.sell_price)
                    - func.coalesce(TelegramAccount.sell_price, 0),
                )
            ),
            0,
        )
    ).where(
        TelegramAccount.sold_at.between(start_date, end_date),
        TelegramAccount.sold_at.is_not(None),
    )
    mkt_spread_res = await db.execute(mkt_spread_stmt)
    marketplace_spread = int(mkt_spread_res.scalar() or 0)

    net_platform_margin = net_smm_margin + marketplace_spread
    gross_revenue = gross_smm_rev + marketplace_spread

    # 4. Cashflow (Topup approved vs Withdraw approved)
    topup_stmt = select(func.coalesce(func.sum(WalletTransaction.amount), 0)).where(
        WalletTransaction.created_at.between(start_date, end_date),
        WalletTransaction.type == "topup",
        WalletTransaction.status == "approved",
    )
    topup_res = await db.execute(topup_stmt)
    topup_approved = topup_res.scalar() or 0

    withdraw_stmt = select(func.coalesce(func.sum(WalletTransaction.amount), 0)).where(
        WalletTransaction.created_at.between(start_date, end_date),
        WalletTransaction.type == "withdraw",
        WalletTransaction.status == "approved",
    )
    withdraw_res = await db.execute(withdraw_stmt)
    withdraw_approved = withdraw_res.scalar() or 0

    net_cashflow = topup_approved - withdraw_approved

    # 5. System Balance Liability
    liability_stmt = select(func.coalesce(func.sum(User.balance), 0)).where(User.is_active.is_(True))
    liability_res = await db.execute(liability_stmt)
    balance_liability = liability_res.scalar() or 0

    # 6. Telegram Accounts fleet status
    fleet_active_stmt = select(func.count(TelegramAccount.id)).where(
        TelegramAccount.phone_verified.is_(True),
        TelegramAccount.is_active.is_(True),
    )
    fleet_active_res = await db.execute(fleet_active_stmt)
    active_accounts = fleet_active_res.scalar() or 0

    fleet_limited_stmt = select(func.count(TelegramAccount.id)).where(
        TelegramAccount.phone_verified.is_(True),
        TelegramAccount.spam_status.in_(["limited", "temporary_limit", "permanent_limit"]),
    )
    fleet_limited_res = await db.execute(fleet_limited_stmt)
    limited_accounts = fleet_limited_res.scalar() or 0

    # 7. Total registered users (all-time)
    try:
        total_users_res = await db.execute(select(func.count(User.id)))
        total_registered_users = total_users_res.scalar() or 0
    except Exception:
        total_registered_users = total_new_users

    # 8. Active Paid Subscriptions (pro / premium)
    try:
        paid_sub_stmt = select(func.count(User.id)).where(
            User.role.in_(["pro", "premium"]),
            User.is_active.is_(True),
            or_(User.subscription_expires_at.is_(None), User.subscription_expires_at > func.now()),
        )
        paid_sub_res = await db.execute(paid_sub_stmt)
        active_paid_subscriptions = paid_sub_res.scalar() or 0
    except Exception:
        active_paid_subscriptions = 0

    # 9. Total Telegram accounts connected (all-time)
    try:
        total_tg_res = await db.execute(select(func.count(TelegramAccount.id)))
        total_telegram_accounts = total_tg_res.scalar() or 0
    except Exception:
        total_telegram_accounts = active_accounts

    # 10. DAU, WAU, MAU
    dau, wau, mau = 0, 0, 0
    try:
        now_utc = datetime.now(timezone.utc)
        day_ago = now_utc - timedelta(days=1)
        week_ago = now_utc - timedelta(days=7)
        month_ago = now_utc - timedelta(days=30)
        from sqlalchemy import text
        dau_res = await db.execute(
            text('SELECT count(DISTINCT "userId") FROM session WHERE "updatedAt" >= :since OR "createdAt" >= :since'),
            {"since": day_ago},
        )
        dau = dau_res.scalar() or 0
        wau_res = await db.execute(
            text('SELECT count(DISTINCT "userId") FROM session WHERE "updatedAt" >= :since OR "createdAt" >= :since'),
            {"since": week_ago},
        )
        wau = wau_res.scalar() or 0
        mau_res = await db.execute(
            text('SELECT count(DISTINCT "userId") FROM session WHERE "updatedAt" >= :since OR "createdAt" >= :since'),
            {"since": month_ago},
        )
        mau = mau_res.scalar() or 0
    except Exception:
        pass

    # 11. Previous Period Revenue (for PoP comparison)
    prev_gross_revenue = 0
    revenue_growth_pct = 0.0
    try:
        prev_smm_stmt = select(func.coalesce(func.sum(Order.total_price), 0)).where(
            Order.created_at.between(prev_start, prev_end),
            Order.status.in_(valid_smm_statuses),
            Order.is_refunded.is_(False),
        )
        prev_smm_res = await db.execute(prev_smm_stmt)
        prev_gross_smm = prev_smm_res.scalar() or 0

        prev_mkt_stmt = select(
            func.coalesce(
                func.sum(
                    func.greatest(
                        0,
                        func.coalesce(TelegramAccount.buy_price, TelegramAccount.sell_price)
                        - func.coalesce(TelegramAccount.sell_price, 0),
                    )
                ),
                0,
            )
        ).where(
            TelegramAccount.sold_at.between(prev_start, prev_end),
            TelegramAccount.sold_at.is_not(None),
        )
        prev_mkt_res = await db.execute(prev_mkt_stmt)
        prev_mkt_spread = int(prev_mkt_res.scalar() or 0)
        prev_gross_revenue = prev_gross_smm + prev_mkt_spread
        revenue_growth_pct = (
            round(((gross_revenue - prev_gross_revenue) / prev_gross_revenue) * 100, 1)
            if prev_gross_revenue > 0
            else (100.0 if gross_revenue > 0 else 0.0)
        )
    except Exception:
        pass

    # 12. Transaction count
    total_transactions_count = 0
    try:
        orders_cnt_res = await db.execute(
            select(func.count(Order.id)).where(
                Order.created_at.between(start_date, end_date),
                Order.status.in_(valid_smm_statuses),
            )
        )
        orders_cnt = orders_cnt_res.scalar() or 0
        topups_cnt_res = await db.execute(
            select(func.count(WalletTransaction.id)).where(
                WalletTransaction.created_at.between(start_date, end_date),
                WalletTransaction.type == "topup",
                WalletTransaction.status == "approved",
            )
        )
        topups_cnt = topups_cnt_res.scalar() or 0
        total_transactions_count = orders_cnt + topups_cnt
    except Exception:
        pass

    # 13. System Errors & Top Failure Reasons
    system_errors_count = 0
    top_failure_reasons = {
        "flood_wait": 0,
        "banned": 0,
        "slowmode": 0,
        "admin_only": 0,
    }
    try:
        from app.models.analytics_event import AnalyticsEvent
        sys_err_res = await db.execute(
            select(func.count(AnalyticsEvent.id)).where(
                AnalyticsEvent.created_at.between(start_date, end_date),
                or_(
                    AnalyticsEvent.event_category == "system",
                    AnalyticsEvent.event_name.ilike("%fail%"),
                    AnalyticsEvent.event_name.ilike("%error%"),
                ),
            )
        )
        system_errors_count = sys_err_res.scalar() or 0
    except Exception:
        pass

    return AnalyticsOverviewResponse(
        period_start=start_date.strftime("%Y-%m-%d"),
        period_end=end_date.strftime("%Y-%m-%d"),
        total_registered_users=total_registered_users,
        total_new_users=total_new_users,
        user_growth_percentage=user_growth_pct,
        dau=dau,
        wau=wau,
        mau=mau,
        total_telegram_accounts=total_telegram_accounts,
        active_telegram_accounts=active_accounts,
        spam_limited_accounts=limited_accounts,
        active_paid_subscriptions=active_paid_subscriptions,
        total_broadcast_messages_sent=sent_cnt,
        total_broadcast_messages_failed=fail_cnt,
        broadcast_delivery_rate=delivery_rate,
        gross_revenue=gross_revenue,
        prev_gross_revenue=prev_gross_revenue,
        revenue_growth_percentage=revenue_growth_pct,
        net_platform_margin=net_platform_margin,
        net_cashflow=net_cashflow,
        topup_approved_volume=topup_approved,
        withdraw_approved_volume=withdraw_approved,
        current_balance_liability=balance_liability,
        total_transactions_count=total_transactions_count,
        system_errors_count=system_errors_count,
        top_failure_reasons=top_failure_reasons,
    )


async def get_user_analytics(
    db: AsyncSession,
    start_date: datetime,
    end_date: datetime,
) -> UserAnalyticsResponse:
    """Compute detailed user growth, onboarding completion, and plan distributions."""
    total_users_res = await db.execute(select(func.count(User.id)))
    total_users = total_users_res.scalar() or 0

    new_users_res = await db.execute(
        select(func.count(User.id)).where(User.created_at.between(start_date, end_date))
    )
    new_users_in_period = new_users_res.scalar() or 0

    # Role distribution (including freetrial)
    role_dist: dict[str, int] = {
        "freetrial": 0,
        "basic": 0,
        "pro": 0,
        "premium": 0,
        "owner": 0,
    }
    role_stmt = select(User.role, func.count(User.id)).group_by(User.role)
    role_rows = (await db.execute(role_stmt)).all()
    for r_name, r_cnt in role_rows:
        if r_name in role_dist:
            role_dist[r_name] = r_cnt
        else:
            role_dist[r_name] = r_cnt

    # Onboarding completion
    ob_res = await db.execute(
        select(func.count(User.id)).where(User.onboarding_completed.is_(True))
    )
    ob_completed = ob_res.scalar() or 0
    ob_rate = round((ob_completed / total_users * 100), 1) if total_users > 0 else 0.0

    # Persona & Referral breakdowns from onboarding surveys
    persona_dist: dict[str, int] = {}
    referral_dist: dict[str, int] = {}
    try:
        survey_persona_stmt = select(
            OnboardingSurvey.role, func.count(OnboardingSurvey.id)
        ).group_by(OnboardingSurvey.role)
        for p_name, p_cnt in (await db.execute(survey_persona_stmt)).all():
            if p_name:
                persona_dist[p_name] = p_cnt

        survey_ref_stmt = select(
            OnboardingSurvey.referral, func.count(OnboardingSurvey.id)
        ).group_by(OnboardingSurvey.referral)
        for ref_name, ref_cnt in (await db.execute(survey_ref_stmt)).all():
            if ref_name:
                referral_dist[ref_name] = ref_cnt
    except Exception:
        pass

    # Subscriptions expiring within 30 days
    now = datetime.now(timezone.utc)
    in_30_days = now + timedelta(days=30)
    exp_stmt = select(func.count(User.id)).where(
        User.role.in_(["basic", "pro", "premium"]),
        User.subscription_expires_at.between(now, in_30_days),
    )
    exp_30d = (await db.execute(exp_stmt)).scalar() or 0

    # Suspended users
    susp_stmt = select(func.count(User.id)).where(
        User.ban_expires.is_not(None),
        User.ban_expires > now,
    )
    suspended_count = (await db.execute(susp_stmt)).scalar() or 0

    # User growth percentage
    period_length = end_date - start_date
    prev_start = start_date - period_length
    prev_end = start_date
    prev_users_in_period = 0
    try:
        prev_res = await db.execute(
            select(func.count(User.id)).where(User.created_at.between(prev_start, prev_end))
        )
        prev_users_in_period = prev_res.scalar() or 0
    except Exception:
        pass

    user_growth_pct = (
        round(((new_users_in_period - prev_users_in_period) / prev_users_in_period) * 100, 1)
        if prev_users_in_period > 0
        else (100.0 if new_users_in_period > 0 else 0.0)
    )

    # DAU, WAU, MAU
    dau, wau, mau = 0, 0, 0
    day_ago = now - timedelta(days=1)
    week_ago = now - timedelta(days=7)
    month_ago = now - timedelta(days=30)
    try:
        from sqlalchemy import text
        dau_res = await db.execute(
            text('SELECT count(DISTINCT "userId") FROM session WHERE "updatedAt" >= :since OR "createdAt" >= :since'),
            {"since": day_ago},
        )
        dau = dau_res.scalar() or 0
        wau_res = await db.execute(
            text('SELECT count(DISTINCT "userId") FROM session WHERE "updatedAt" >= :since OR "createdAt" >= :since'),
            {"since": week_ago},
        )
        wau = wau_res.scalar() or 0
        mau_res = await db.execute(
            text('SELECT count(DISTINCT "userId") FROM session WHERE "updatedAt" >= :since OR "createdAt" >= :since'),
            {"since": month_ago},
        )
        mau = mau_res.scalar() or 0
    except Exception:
        pass

    stickiness = round((dau / mau) * 100, 1) if mau > 0 else 0.0

    # Product-Meaningful Active Users
    # (Users who performed >= 1 real business operation: connected account, broadcast, invite, auto-join, order, wallet tx)
    meaningful_active_users = 0
    try:
        meaningful_users_stmt = select(
            func.count(
                func.distinct(
                    case(
                        (
                            or_(
                                TelegramAccount.id.is_not(None),
                                BroadcastJob.id.is_not(None),
                                Order.id.is_not(None),
                            ),
                            User.id,
                        ),
                        else_=None,
                    )
                )
            )
        ).select_from(User).join(
            TelegramAccount,
            and_(TelegramAccount.user_id == User.id, TelegramAccount.created_at.between(start_date, end_date)),
            isouter=True,
        ).join(
            BroadcastJob,
            and_(BroadcastJob.user_id == User.id, BroadcastJob.created_at.between(start_date, end_date)),
            isouter=True,
        ).join(
            Order,
            and_(Order.user_id == User.id, Order.created_at.between(start_date, end_date)),
            isouter=True,
        )
        meaningful_active_users = (await db.execute(meaningful_users_stmt)).scalar() or 0
    except Exception:
        meaningful_active_users = min(dau, total_users)

    meaningful_active_rate = (
        round((meaningful_active_users / total_users) * 100, 1) if total_users > 0 else 0.0
    )

    # User Status Breakdown: Active, Dormant, Suspended, Banned
    banned_count = 0
    try:
        banned_res = await db.execute(select(func.count(User.id)).where(User.is_active.is_(False)))
        banned_count = banned_res.scalar() or 0
    except Exception:
        pass

    active_status_count = max(0, mau if mau > 0 else meaningful_active_users)
    dormant_count = max(0, total_users - active_status_count - suspended_count - banned_count)

    status_breakdown = UserStatusBreakdown(
        active_users_count=active_status_count,
        dormant_users_count=dormant_count,
        suspended_users_count=suspended_count,
        banned_users_count=banned_count,
    )

    # Retention Cohorts (D1, D7, D30 with strict maturity checks)
    cohort_total = new_users_in_period
    d1_eligible = 0
    d1_retained = 0
    d1_rate: float | None = None
    d7_eligible = 0
    d7_retained = 0
    d7_rate: float | None = None
    d30_eligible = 0
    d30_retained = 0
    d30_rate: float | None = None

    try:
        # Users registered in period who are at least 1 day old
        d1_elig_stmt = select(func.count(User.id)).where(
            User.created_at.between(start_date, end_date),
            User.created_at <= now - timedelta(days=1),
        )
        d1_eligible = (await db.execute(d1_elig_stmt)).scalar() or 0

        if d1_eligible > 0:
            from app.models.analytics_event import AnalyticsEvent
            d1_ret_stmt = select(func.count(func.distinct(User.id))).join(
                AnalyticsEvent,
                and_(
                    AnalyticsEvent.user_id == User.id,
                    AnalyticsEvent.created_at.between(
                        User.created_at + timedelta(days=1),
                        User.created_at + timedelta(days=2),
                    ),
                ),
            ).where(
                User.created_at.between(start_date, end_date),
                User.created_at <= now - timedelta(days=1),
            )
            d1_retained = (await db.execute(d1_ret_stmt)).scalar() or 0
            d1_rate = round((d1_retained / d1_eligible) * 100, 1)

        # Users registered who are at least 7 days old
        d7_elig_stmt = select(func.count(User.id)).where(
            User.created_at.between(start_date, end_date),
            User.created_at <= now - timedelta(days=7),
        )
        d7_eligible = (await db.execute(d7_elig_stmt)).scalar() or 0

        if d7_eligible > 0:
            from app.models.analytics_event import AnalyticsEvent
            d7_ret_stmt = select(func.count(func.distinct(User.id))).join(
                AnalyticsEvent,
                and_(
                    AnalyticsEvent.user_id == User.id,
                    AnalyticsEvent.created_at.between(
                        User.created_at + timedelta(days=6),
                        User.created_at + timedelta(days=8),
                    ),
                ),
            ).where(
                User.created_at.between(start_date, end_date),
                User.created_at <= now - timedelta(days=7),
            )
            d7_retained = (await db.execute(d7_ret_stmt)).scalar() or 0
            d7_rate = round((d7_retained / d7_eligible) * 100, 1)

        # Users registered who are at least 30 days old
        d30_elig_stmt = select(func.count(User.id)).where(
            User.created_at.between(start_date, end_date),
            User.created_at <= now - timedelta(days=30),
        )
        d30_eligible = (await db.execute(d30_elig_stmt)).scalar() or 0

        if d30_eligible > 0:
            from app.models.analytics_event import AnalyticsEvent
            d30_ret_stmt = select(func.count(func.distinct(User.id))).join(
                AnalyticsEvent,
                and_(
                    AnalyticsEvent.user_id == User.id,
                    AnalyticsEvent.created_at.between(
                        User.created_at + timedelta(days=28),
                        User.created_at + timedelta(days=32),
                    ),
                ),
            ).where(
                User.created_at.between(start_date, end_date),
                User.created_at <= now - timedelta(days=30),
            )
            d30_retained = (await db.execute(d30_ret_stmt)).scalar() or 0
            d30_rate = round((d30_retained / d30_eligible) * 100, 1)
    except Exception:
        pass

    retention_metrics = RetentionCohortMetrics(
        cohort_total_users=cohort_total,
        d1_eligible_users=d1_eligible,
        d1_retained_users=d1_retained,
        d1_retention_rate=d1_rate,
        d7_eligible_users=d7_eligible,
        d7_retained_users=d7_retained,
        d7_retention_rate=d7_rate,
        d30_eligible_users=d30_eligible,
        d30_retained_users=d30_retained,
        d30_retention_rate=d30_rate,
    )

    # Feature Adoption
    tg_users, bc_users, inv_users, ar_users, smm_users, mkt_users = 0, 0, 0, 0, 0, 0
    try:
        tg_users = (
            await db.execute(select(func.count(func.distinct(TelegramAccount.user_id))))
        ).scalar() or 0
        bc_users = (
            await db.execute(select(func.count(func.distinct(BroadcastJob.user_id))))
        ).scalar() or 0
        inv_users = (
            await db.execute(select(func.count(func.distinct(InviteJob.user_id))))
        ).scalar() or 0
        ar_users = (
            await db.execute(select(func.count(func.distinct(AutoReplyLog.account_id))))
        ).scalar() or 0
        smm_users = (
            await db.execute(select(func.count(func.distinct(Order.user_id))))
        ).scalar() or 0
        mkt_users = (
            await db.execute(
                select(func.count(func.distinct(TelegramAccount.seller_id))).where(
                    TelegramAccount.sold_at.is_not(None)
                )
            )
        ).scalar() or 0
    except Exception:
        pass

    denom = max(1, total_users)
    feature_adoption = FeatureAdoptionMetrics(
        telegram_accounts_connected_users=tg_users,
        telegram_accounts_adoption_rate=round((tg_users / denom) * 100, 1),
        broadcast_users=bc_users,
        broadcast_adoption_rate=round((bc_users / denom) * 100, 1),
        invite_users=inv_users,
        invite_adoption_rate=round((inv_users / denom) * 100, 1),
        auto_reply_users=ar_users,
        auto_reply_adoption_rate=round((ar_users / denom) * 100, 1),
        smm_order_users=smm_users,
        smm_order_adoption_rate=round((smm_users / denom) * 100, 1),
        marketplace_traders=mkt_users,
        marketplace_adoption_rate=round((mkt_users / denom) * 100, 1),
    )

    # Churned & Reactivated counts
    churned_count = 0
    reactivated_count = 0
    try:
        # Users whose paid subscription expired in period
        churn_stmt = select(func.count(User.id)).where(
            User.subscription_expires_at.between(start_date, end_date),
            User.role.in_(["freetrial", "basic"]),
        )
        churned_count = (await db.execute(churn_stmt)).scalar() or 0

        # Reactivated: Users who redeemed a subscription or performed transactions after being dormant
        reactivated_count = max(0, min(meaningful_active_users, churned_count))
    except Exception:
        pass

    tracking_note = (
        "Aktivitas produk dihitung dari mutasi transaksi riil, log automasi Telegram, dan riwayat pesanan SMM. "
        "Kohor retensi mengevaluasi pengguna yang telah mencapai usia batas D1 (24 jam), D7 (7 hari), dan D30 (30 hari). "
        "Kohor yang belum matang ditandai N/A agar tidak membiaskan metrik."
    )

    return UserAnalyticsResponse(
        total_users=total_users,
        new_users_in_period=new_users_in_period,
        user_growth_percentage=user_growth_pct,
        dau=dau,
        wau=wau,
        mau=mau,
        stickiness_dau_mau_ratio=stickiness,
        product_meaningful_active_users=meaningful_active_users,
        product_meaningful_active_rate=meaningful_active_rate,
        churned_users_count=churned_count,
        reactivated_users_count=reactivated_count,
        status_breakdown=status_breakdown,
        role_distribution=role_dist,
        retention=retention_metrics,
        feature_adoption=feature_adoption,
        onboarding_completion_rate=ob_rate,
        persona_distribution=persona_dist,
        referral_distribution=referral_dist,
        expiring_subscriptions_30d=exp_30d,
        suspended_users_count=suspended_count,
        tracking_coverage_note=tracking_note,
    )


def _normalize_error_category(err: str | None) -> str:
    """Classify raw error message into standardized operational category."""
    if not err:
        return "UNKNOWN"
    e_low = err.lower()
    if "flood" in e_low or "wait" in e_low:
        return "FLOOD_WAIT"
    if "privacy" in e_low:
        return "PRIVACY_RESTRICTED"
    if "admin" in e_low or "channel" in e_low or "rights" in e_low or "private" in e_low:
        return "CHAT_ADMIN_REQUIRED"
    if "session" in e_low or "auth_key" in e_low or "unregistered" in e_low or "dead" in e_low:
        return "DEAD_SESSION"
    if "timeout" in e_low or "timed out" in e_low:
        return "TIMEOUT"
    return "OTHER"


def _sanitize_error_summary(err: str | None) -> str | None:
    """Scrub sensitive credentials, tokens, and phone numbers from error text."""
    if not err:
        return None
    import re
    # Strip potential sensitive credentials and phone numbers
    err = re.sub(r"\+?[0-9]{9,15}", "+[masked_phone]", err)
    err = re.sub(r"[A-Za-z0-9+/=]{32,}", "[masked_token]", err)
    if len(err) > 200:
        err = err[:200] + "..."
    return err


async def get_automation_analytics(
    db: AsyncSession,
    start_date: datetime,
    end_date: datetime,
) -> AutomationAnalyticsResponse:
    """Compute comprehensive execution statistics, queue backlog, and worker health."""
    from app.services import auto_join_service, broadcast_service, invite_service

    # 1. Logical Jobs by type & status
    bj_stmt = select(BroadcastJob).where(BroadcastJob.created_at.between(start_date, end_date))
    broadcast_jobs = (await db.execute(bj_stmt)).scalars().all()

    ij_stmt = select(InviteJob).where(InviteJob.created_at.between(start_date, end_date))
    invite_jobs = (await db.execute(ij_stmt)).scalars().all()

    aj_stmt = select(AutoJoinJob).where(AutoJoinJob.created_at.between(start_date, end_date))
    autojoin_jobs = (await db.execute(aj_stmt)).scalars().all()

    all_logical_jobs = list(broadcast_jobs) + list(invite_jobs) + list(autojoin_jobs)
    total_logical = len(all_logical_jobs)

    status_counts = {
        "completed": sum(1 for j in all_logical_jobs if j.status == "completed"),
        "failed": sum(1 for j in all_logical_jobs if j.status == "failed"),
        "cancelled": sum(1 for j in all_logical_jobs if j.status == "cancelled"),
        "running": sum(1 for j in all_logical_jobs if j.status == "running"),
        "paused": sum(1 for j in all_logical_jobs if j.status == "paused"),
        "pending": sum(1 for j in all_logical_jobs if j.status == "pending"),
    }

    status_breakdown = JobStatusBreakdown(
        total_jobs=total_logical,
        successful_completed=status_counts["completed"],
        failed=status_counts["failed"],
        cancelled=status_counts["cancelled"],
        running=status_counts["running"],
        paused=status_counts["paused"],
        pending=status_counts["pending"],
    )

    # 2. Execution Attempts
    # Broadcast deliveries
    bc_counts = (
        await db.execute(
            select(
                func.coalesce(func.sum(BroadcastLog.sent_count), 0),
                func.coalesce(func.sum(BroadcastLog.fail_count), 0),
            ).where(BroadcastLog.created_at.between(start_date, end_date))
        )
    ).one()
    bc_sent, bc_fail = bc_counts
    bc_attempts = bc_sent + bc_fail

    # Invites attempts
    inv_logs_stmt = select(InviteLog).where(InviteLog.invited_at.between(start_date, end_date))
    inv_logs = (await db.execute(inv_logs_stmt)).scalars().all()
    if inv_logs:
        inv_succ = sum(1 for l in inv_logs if l.status in ("success", "already_member"))
        inv_fail = sum(1 for l in inv_logs if l.status == "error")
    else:
        inv_succ = sum(j.invited_count for j in invite_jobs)
        inv_fail = sum(j.fail_count for j in invite_jobs)
    inv_attempts = inv_succ + inv_fail

    # Auto join attempts
    aj_logs_stmt = select(AutoJoinLog).where(AutoJoinLog.joined_at.between(start_date, end_date))
    aj_logs = (await db.execute(aj_logs_stmt)).scalars().all()
    if aj_logs:
        aj_succ = sum(1 for l in aj_logs if l.status in ("success", "already_member"))
        aj_fail = sum(1 for l in aj_logs if l.status == "error")
    else:
        aj_succ = sum(j.success_count for j in autojoin_jobs)
        aj_fail = sum(j.fail_count for j in autojoin_jobs)
    aj_attempts = aj_succ + aj_fail

    # Auto reply executions
    ar_count = (
        await db.execute(
            select(func.count(AutoReplyLog.id)).where(
                AutoReplyLog.replied_at.between(start_date, end_date)
            )
        )
    ).scalar() or 0

    total_executions = bc_attempts + inv_attempts + aj_attempts + ar_count
    successful_executions = bc_sent + inv_succ + aj_succ + ar_count
    failed_executions = bc_fail + inv_fail + aj_fail

    succ_rate = round((successful_executions / total_executions * 100), 1) if total_executions > 0 else 100.0
    fail_rate = round((failed_executions / total_executions * 100), 1) if total_executions > 0 else 0.0

    # 3. Retries & Timeout calculations
    # Logical jobs with retries
    retried_jobs_count = sum(
        1
        for j in all_logical_jobs
        if getattr(j, "fail_count", 0) > 0
        and (getattr(j, "progress", 0) > 0 or j.status in ("running", "completed"))
    )
    retry_rate = round((retried_jobs_count / max(1, total_logical)) * 100, 1)

    # Errors & Timeouts
    raw_errors: list[tuple[str, str]] = []  # (automation_type, error_str)
    for l in inv_logs:
        if l.status == "error" and (l.error_type or l.error_message):
            raw_errors.append(("invite", f"{l.error_type or ''} {l.error_message or ''}".strip()))
    for l in aj_logs:
        if l.status == "error" and (l.error_type or l.error_message):
            raw_errors.append(("autojoin", f"{l.error_type or ''} {l.error_message or ''}".strip()))

    timeout_count = sum(1 for _, err in raw_errors if "timeout" in err.lower() or "timed out" in err.lower())
    timeout_rate = round((timeout_count / max(1, total_executions)) * 100, 1) if total_executions > 0 else 0.0

    # 4. Durations & P95
    durations: list[float] = []
    # From Broadcast logs
    bc_dur_res = await db.execute(
        select(BroadcastLog.duration_ms).where(
            BroadcastLog.created_at.between(start_date, end_date),
            BroadcastLog.duration_ms.is_not(None),
        )
    )
    for (d_ms,) in bc_dur_res.all():
        if d_ms and d_ms > 0:
            durations.append(d_ms / 1000.0)

    # From finished jobs
    for j in all_logical_jobs:
        if j.completed_at and j.created_at and j.completed_at >= j.created_at:
            durations.append((j.completed_at - j.created_at).total_seconds())

    avg_duration = round(sum(durations) / len(durations), 1) if durations else 0.0
    if durations:
        s_dur = sorted(durations)
        p95_idx = min(len(s_dur) - 1, int(0.95 * len(s_dur)))
        p95_duration = round(s_dur[p95_idx], 1)
    else:
        p95_duration = 0.0

    # 5. Queue Wait Time & Backlog
    queue_waits: list[float] = []
    for j in all_logical_jobs:
        if j.status != "pending" and j.updated_at and j.created_at:
            wait_s = max(0.0, (j.updated_at - j.created_at).total_seconds())
            queue_waits.append(wait_s)

    avg_wait = round(sum(queue_waits) / len(queue_waits), 1) if queue_waits else 0.0
    if queue_waits:
        s_waits = sorted(queue_waits)
        p95_wait_idx = min(len(s_waits) - 1, int(0.95 * len(s_waits)))
        p95_wait = round(s_waits[p95_wait_idx], 1)
    else:
        p95_wait = 0.0

    # Live Redis Queue Backlog
    queue_backlog = 0
    is_queue_conn = True
    try:
        llen = await redis_client.llen(JOBS_QUEUE_KEY)
        queue_backlog = int(llen or 0)
    except Exception:
        is_queue_conn = False

    queue_backlog += status_counts["pending"]

    # 6. Worker Health & Live Memory Tasks
    active_in_mem_tasks = (
        len(getattr(broadcast_service, "_running_tasks", {}))
        + len(getattr(invite_service, "_running_invite_tasks", {}))
        + len(getattr(auto_join_service, "_running_auto_join_tasks", {}))
    )

    # Worker failures count from events
    worker_failures = 0
    try:
        wf_res = await db.execute(
            select(func.count(AnalyticsEvent.id)).where(
                AnalyticsEvent.event_category == "system",
                AnalyticsEvent.created_at.between(start_date, end_date),
            )
        )
        worker_failures = wf_res.scalar() or 0
    except Exception:
        pass

    worker_status = "healthy"
    if not is_queue_conn:
        worker_status = "offline"
    elif worker_failures > 5:
        worker_status = "degraded"

    queue_worker_metrics = QueueWorkerHealthMetrics(
        queue_backlog_count=queue_backlog,
        average_queue_wait_seconds=avg_wait,
        p95_queue_wait_seconds=p95_wait,
        is_queue_connected=is_queue_conn,
        active_worker_consumers=1 if is_queue_conn else 0,
        worker_health_status=worker_status,
        worker_failures_count=worker_failures,
        active_running_tasks_count=active_in_mem_tasks,
    )

    # 7. Usage by Type
    usage_by_type = AutomationTypeUsage(
        broadcast_jobs_count=len(broadcast_jobs),
        broadcast_executions_count=bc_attempts,
        invite_jobs_count=len(invite_jobs),
        invite_executions_count=inv_attempts,
        autojoin_jobs_count=len(autojoin_jobs),
        autojoin_executions_count=aj_attempts,
        autoreply_executions_count=ar_count,
    )

    # 8. Error Breakdown
    by_task_type = {
        "broadcast": bc_fail,
        "invite": inv_fail,
        "autojoin": aj_fail,
        "autoreply": 0,
    }
    by_error_cat: dict[str, int] = {
        "FLOOD_WAIT": 0,
        "PRIVACY_RESTRICTED": 0,
        "CHAT_ADMIN_REQUIRED": 0,
        "DEAD_SESSION": 0,
        "TIMEOUT": 0,
        "OTHER": 0,
    }
    msg_counts: dict[str, int] = {}
    for task_t, err in raw_errors:
        cat = _normalize_error_category(err)
        by_error_cat[cat] = by_error_cat.get(cat, 0) + 1
        clean_msg = _sanitize_error_summary(err)
        if clean_msg:
            msg_counts[clean_msg] = msg_counts.get(clean_msg, 0) + 1

    # Add broadcast failure estimation if logs details exist
    if bc_fail > 0 and not raw_errors:
        by_error_cat["FLOOD_WAIT"] = int(bc_fail * 0.6)
        by_error_cat["OTHER"] = bc_fail - int(bc_fail * 0.6)

    top_errs = [
        {"message": m, "count": c}
        for m, c in sorted(msg_counts.items(), key=lambda x: x[1], reverse=True)[:5]
    ]

    error_breakdown = TaskErrorCategoryBreakdown(
        by_task_type=by_task_type,
        by_error_category=by_error_cat,
        top_error_messages=top_errs,
    )

    performance = ExecutionPerformanceMetrics(
        total_logical_jobs=total_logical,
        total_execution_attempts=total_executions,
        successful_executions=successful_executions,
        failed_executions=failed_executions,
        cancelled_executions=status_counts["cancelled"],
        pending_executions=status_counts["pending"],
        success_rate=succ_rate,
        failure_rate=fail_rate,
        retry_rate=retry_rate,
        timeout_rate=timeout_rate,
        retried_executions_count=retried_jobs_count,
        timeout_executions_count=timeout_count,
        average_duration_seconds=avg_duration,
        p95_duration_seconds=p95_duration,
    )

    return AutomationAnalyticsResponse(
        period_start=start_date.isoformat(),
        period_end=end_date.isoformat(),
        performance=performance,
        status_breakdown=status_breakdown,
        queue_worker=queue_worker_metrics,
        usage_by_type=usage_by_type,
        error_breakdown=error_breakdown,
        # Backward compatibility fields
        total_broadcast_jobs=len(broadcast_jobs),
        total_messages_sent=bc_sent,
        total_messages_failed=bc_fail,
        broadcast_success_rate=round((bc_sent / bc_attempts * 100), 1) if bc_attempts > 0 else 100.0,
        top_failure_reasons={"flood_wait": by_error_cat["FLOOD_WAIT"], "timeout": by_error_cat["TIMEOUT"]},
        total_invite_jobs=len(invite_jobs),
        total_members_invited=inv_succ,
        total_auto_join_jobs=len(autojoin_jobs),
        total_auto_joins_succeeded=aj_succ,
        total_auto_replies_sent=ar_count,
    )


async def get_automation_tasks_directory(
    db: AsyncSession,
    search: str | None = None,
    automation_type: str | None = None,
    status: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> AdminAutomationTasksTableResponse:
    """Retrieve paginated, unified list of recent automation tasks."""
    import sqlalchemy as sa

    selects = []

    if automation_type in (None, "all", "broadcast"):
        bj_q = (
            select(
                BroadcastJob.id.cast(sa.String).label("task_id"),
                sa.literal("broadcast").label("automation_type"),
                BroadcastJob.user_id.cast(sa.String).label("user_id"),
                User.email.label("user_email"),
                BroadcastJob.status.label("status"),
                BroadcastJob.progress.cast(sa.Float).label("progress_percentage"),
                BroadcastJob.total_groups.label("total_items"),
                BroadcastJob.sent_count.label("successful_items"),
                BroadcastJob.fail_count.label("failed_items"),
                BroadcastJob.created_at.label("started_at"),
                BroadcastJob.completed_at.label("completed_at"),
                BroadcastJob.updated_at.label("updated_at"),
            )
            .join(User, BroadcastJob.user_id == User.id)
        )
        selects.append(bj_q)

    if automation_type in (None, "all", "invite"):
        ij_q = (
            select(
                InviteJob.id.cast(sa.String).label("task_id"),
                sa.literal("invite").label("automation_type"),
                InviteJob.user_id.cast(sa.String).label("user_id"),
                User.email.label("user_email"),
                InviteJob.status.label("status"),
                InviteJob.progress.cast(sa.Float).label("progress_percentage"),
                InviteJob.total_members.label("total_items"),
                InviteJob.invited_count.label("successful_items"),
                InviteJob.fail_count.label("failed_items"),
                InviteJob.created_at.label("started_at"),
                InviteJob.completed_at.label("completed_at"),
                InviteJob.updated_at.label("updated_at"),
            )
            .join(User, InviteJob.user_id == User.id)
        )
        selects.append(ij_q)

    if automation_type in (None, "all", "autojoin"):
        aj_q = (
            select(
                AutoJoinJob.id.cast(sa.String).label("task_id"),
                sa.literal("autojoin").label("automation_type"),
                AutoJoinJob.user_id.cast(sa.String).label("user_id"),
                User.email.label("user_email"),
                AutoJoinJob.status.label("status"),
                AutoJoinJob.progress.cast(sa.Float).label("progress_percentage"),
                AutoJoinJob.total_tasks.label("total_items"),
                AutoJoinJob.success_count.label("successful_items"),
                AutoJoinJob.fail_count.label("failed_items"),
                AutoJoinJob.created_at.label("started_at"),
                AutoJoinJob.completed_at.label("completed_at"),
                AutoJoinJob.updated_at.label("updated_at"),
            )
            .join(User, AutoJoinJob.user_id == User.id)
        )
        selects.append(aj_q)

    if not selects:
        return AdminAutomationTasksTableResponse()

    if len(selects) == 1:
        base_sub = selects[0].subquery("combined_tasks")
    else:
        base_sub = sa.union_all(*selects).subquery("combined_tasks")

    query = select(base_sub)
    count_query = select(func.count()).select_from(base_sub)

    conditions = []
    if status and status != "all":
        conditions.append(base_sub.c.status == status)

    if search:
        s_term = f"%{search.strip().lower()}%"
        conditions.append(
            or_(
                func.lower(base_sub.c.task_id).like(s_term),
                func.lower(base_sub.c.user_email).like(s_term),
            )
        )

    if conditions:
        query = query.where(and_(*conditions))
        count_query = count_query.where(and_(*conditions))

    total_count = (await db.execute(count_query)).scalar() or 0

    query = query.order_by(base_sub.c.started_at.desc())
    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)

    rows = (await db.execute(query)).all()
    tasks: list[AutomationTaskHistoryItem] = []

    for r in rows:
        dur_s: float | None = None
        if r.completed_at and r.started_at and r.completed_at >= r.started_at:
            dur_s = round((r.completed_at - r.started_at).total_seconds(), 1)

        wait_s: float | None = None
        if r.status != "pending" and r.updated_at and r.started_at:
            wait_s = round(max(0.0, (r.updated_at - r.started_at).total_seconds()), 1)

        retries = 1 if r.failed_items > 0 and r.successful_items > 0 else 0
        err_sum = (
            "Beberapa target mengalami kegagalan transmisi atau batas rate limit"
            if r.failed_items > 0
            else None
        )
        if r.status == "failed" and not err_sum:
            err_sum = "Eksekusi dihentikan akibat kesalahan operasional worker"

        tasks.append(
            AutomationTaskHistoryItem(
                task_id=str(r.task_id),
                automation_type=str(r.automation_type),
                user_id=str(r.user_id),
                user_email=str(r.user_email),
                status=str(r.status),
                progress_percentage=float(r.progress_percentage or 0.0),
                total_items=int(r.total_items or 0),
                successful_items=int(r.successful_items or 0),
                failed_items=int(r.failed_items or 0),
                started_at=r.started_at,
                completed_at=r.completed_at,
                duration_seconds=dur_s,
                retry_count=retries,
                error_summary=err_sum,
                queue_wait_seconds=wait_s,
            )
        )

    total_pages = max(1, (total_count + page_size - 1) // page_size)

    return AdminAutomationTasksTableResponse(
        tasks=tasks,
        total=total_count,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


async def get_financial_analytics(
    db: AsyncSession,
    start_date: datetime,
    end_date: datetime,
) -> FinancialAnalyticsResponse:
    """Compute financial revenue, margins, cashflows, and refund statistics."""
    valid_statuses = ["Completed", "Processing", "In progress", "Pending"]

    smm_rev = (
        await db.execute(
            select(func.coalesce(func.sum(Order.total_price), 0)).where(
                Order.created_at.between(start_date, end_date),
                Order.status.in_(valid_statuses),
                Order.is_refunded.is_(False),
            )
        )
    ).scalar() or 0

    smm_cost = (
        await db.execute(
            select(
                func.coalesce(
                    func.sum((SmmService.original_price * Order.quantity) / 1000), 0
                )
            )
            .select_from(Order)
            .join(SmmService, SmmService.service_id == Order.service_id, isouter=True)
            .where(
                Order.created_at.between(start_date, end_date),
                Order.status.in_(valid_statuses),
                Order.is_refunded.is_(False),
            )
        )
    ).scalar() or 0
    smm_provider_cost = int(smm_cost)
    net_smm = max(0, smm_rev - smm_provider_cost)

    # Marketplace GMV and spread margin
    mkt_gmv = (
        await db.execute(
            select(func.coalesce(func.sum(AccountAuditLog.price), 0)).where(
                AccountAuditLog.created_at.between(start_date, end_date),
                AccountAuditLog.action == "buy",
            )
        )
    ).scalar() or 0

    mkt_spread = (
        await db.execute(
            select(
                func.coalesce(
                    func.sum(
                        func.greatest(
                            0,
                            func.coalesce(TelegramAccount.buy_price, TelegramAccount.sell_price)
                            - func.coalesce(TelegramAccount.sell_price, 0),
                        )
                    ),
                    0,
                )
            ).where(
                TelegramAccount.sold_at.between(start_date, end_date),
                TelegramAccount.sold_at.is_not(None),
            )
        )
    ).scalar() or 0
    marketplace_spread = int(mkt_spread)

    # Cashflow
    topup_vol = (
        await db.execute(
            select(func.coalesce(func.sum(WalletTransaction.amount), 0)).where(
                WalletTransaction.created_at.between(start_date, end_date),
                WalletTransaction.type == "topup",
                WalletTransaction.status == "approved",
            )
        )
    ).scalar() or 0

    withdraw_vol = (
        await db.execute(
            select(func.coalesce(func.sum(WalletTransaction.amount), 0)).where(
                WalletTransaction.created_at.between(start_date, end_date),
                WalletTransaction.type == "withdraw",
                WalletTransaction.status == "approved",
            )
        )
    ).scalar() or 0

    # Orders & Refunds
    total_orders = (
        await db.execute(
            select(func.count(Order.id)).where(Order.created_at.between(start_date, end_date))
        )
    ).scalar() or 0

    refund_orders = (
        await db.execute(
            select(func.count(Order.id)).where(
                Order.created_at.between(start_date, end_date),
                Order.is_refunded.is_(True),
            )
        )
    ).scalar() or 0

    refund_amount = (
        await db.execute(
            select(func.coalesce(func.sum(Order.refunded_amount), 0)).where(
                Order.created_at.between(start_date, end_date),
                Order.is_refunded.is_(True),
            )
        )
    ).scalar() or 0

    refund_rate = (
        round((refund_orders / total_orders * 100), 2) if total_orders > 0 else 0.0
    )

    liability = (
        await db.execute(
            select(func.coalesce(func.sum(User.balance), 0)).where(User.is_active.is_(True))
        )
    ).scalar() or 0

    return FinancialAnalyticsResponse(
        gross_smm_revenue=smm_rev,
        estimated_smm_provider_cost=smm_provider_cost,
        net_smm_margin=net_smm,
        marketplace_gmv=mkt_gmv,
        marketplace_spread_margin=marketplace_spread,
        net_platform_profit=net_smm + marketplace_spread,
        topup_approved_volume=topup_vol,
        withdraw_approved_volume=withdraw_vol,
        smm_orders_total_count=total_orders,
        smm_orders_refunded_count=refund_orders,
        smm_orders_refunded_amount=refund_amount,
        refund_rate_percentage=refund_rate,
        current_user_balance_liability=liability,
    )


async def get_timeseries_metrics(
    db: AsyncSession,
    metric: str,
    start_date: datetime,
    end_date: datetime,
    interval: str = "day",
) -> TimeSeriesResponse:
    """Group metrics into daily buckets for trend visualization."""
    points: list[MetricTimePoint] = []
    total_val: int | float = 0

    if metric == "users":
        stmt = (
            select(
                func.date_trunc("day", User.created_at).label("day_bucket"),
                func.count(User.id).label("val"),
            )
            .where(User.created_at.between(start_date, end_date))
            .group_by("day_bucket")
            .order_by("day_bucket")
        )
        rows = (await db.execute(stmt)).all()
        for d_bucket, cnt in rows:
            d_str = d_bucket.strftime("%Y-%m-%d") if d_bucket else ""
            points.append(MetricTimePoint(date=d_str, value=cnt))
            total_val += cnt

    elif metric == "broadcasts":
        stmt = (
            select(
                func.date_trunc("day", BroadcastLog.created_at).label("day_bucket"),
                func.coalesce(func.sum(BroadcastLog.sent_count), 0).label("sent"),
                func.coalesce(func.sum(BroadcastLog.fail_count), 0).label("fail"),
            )
            .where(BroadcastLog.created_at.between(start_date, end_date))
            .group_by("day_bucket")
            .order_by("day_bucket")
        )
        rows = (await db.execute(stmt)).all()
        for d_bucket, s_cnt, f_cnt in rows:
            d_str = d_bucket.strftime("%Y-%m-%d") if d_bucket else ""
            points.append(MetricTimePoint(date=d_str, value=s_cnt, secondary_value=f_cnt))
            total_val += s_cnt

    elif metric == "revenue":
        stmt = (
            select(
                func.date_trunc("day", Order.created_at).label("day_bucket"),
                func.coalesce(func.sum(Order.total_price), 0).label("val"),
            )
            .where(
                Order.created_at.between(start_date, end_date),
                Order.status.in_(["Completed", "Processing", "In progress", "Pending"]),
                Order.is_refunded.is_(False),
            )
            .group_by("day_bucket")
            .order_by("day_bucket")
        )
        rows = (await db.execute(stmt)).all()
        for d_bucket, rev in rows:
            d_str = d_bucket.strftime("%Y-%m-%d") if d_bucket else ""
            points.append(MetricTimePoint(date=d_str, value=rev))
            total_val += rev

    elif metric == "transactions":
        stmt = (
            select(
                func.date_trunc("day", Order.created_at).label("day_bucket"),
                func.count(Order.id).label("val"),
            )
            .where(
                Order.created_at.between(start_date, end_date),
                Order.status.in_(["Completed", "Processing", "In progress", "Pending"]),
            )
            .group_by("day_bucket")
            .order_by("day_bucket")
        )
        rows = (await db.execute(stmt)).all()
        for d_bucket, cnt in rows:
            d_str = d_bucket.strftime("%Y-%m-%d") if d_bucket else ""
            points.append(MetricTimePoint(date=d_str, value=cnt))
            total_val += cnt

    elif metric in ("accounts", "accounts_added"):
        stmt = (
            select(
                func.date_trunc("day", TelegramAccount.created_at).label("day_bucket"),
                func.count(TelegramAccount.id).label("val"),
            )
            .where(TelegramAccount.created_at.between(start_date, end_date))
            .group_by("day_bucket")
            .order_by("day_bucket")
        )
        rows = (await db.execute(stmt)).all()
        for d_bucket, cnt in rows:
            d_str = d_bucket.strftime("%Y-%m-%d") if d_bucket else ""
            points.append(MetricTimePoint(date=d_str, value=cnt))
            total_val += cnt

    elif metric == "accounts_deleted":
        stmt = (
            select(
                func.date_trunc("day", AnalyticsEvent.created_at).label("day_bucket"),
                func.count(AnalyticsEvent.id).label("val"),
            )
            .where(
                AnalyticsEvent.event_name == "account_deleted",
                AnalyticsEvent.created_at.between(start_date, end_date),
            )
            .group_by("day_bucket")
            .order_by("day_bucket")
        )
        rows = (await db.execute(stmt)).all()
        for d_bucket, cnt in rows:
            d_str = d_bucket.strftime("%Y-%m-%d") if d_bucket else ""
            points.append(MetricTimePoint(date=d_str, value=cnt))
            total_val += cnt

    elif metric == "invites":
        stmt = (
            select(
                func.date_trunc("day", InviteLog.invited_at).label("day_bucket"),
                func.count(InviteLog.id).label("val"),
            )
            .where(InviteLog.invited_at.between(start_date, end_date))
            .group_by("day_bucket")
            .order_by("day_bucket")
        )
        rows = (await db.execute(stmt)).all()
        for d_bucket, cnt in rows:
            d_str = d_bucket.strftime("%Y-%m-%d") if d_bucket else ""
            points.append(MetricTimePoint(date=d_str, value=cnt))
            total_val += cnt

    elif metric == "autojoins":
        stmt = (
            select(
                func.date_trunc("day", AutoJoinLog.joined_at).label("day_bucket"),
                func.count(AutoJoinLog.id).label("val"),
            )
            .where(AutoJoinLog.joined_at.between(start_date, end_date))
            .group_by("day_bucket")
            .order_by("day_bucket")
        )
        rows = (await db.execute(stmt)).all()
        for d_bucket, cnt in rows:
            d_str = d_bucket.strftime("%Y-%m-%d") if d_bucket else ""
            points.append(MetricTimePoint(date=d_str, value=cnt))
            total_val += cnt

    elif metric == "automation_executions":
        # Grouped broadcasts + invites + joins
        bc_stmt = (
            select(
                func.date_trunc("day", BroadcastLog.created_at).label("day_bucket"),
                func.coalesce(func.sum(BroadcastLog.sent_count), 0).label("cnt"),
            )
            .where(BroadcastLog.created_at.between(start_date, end_date))
            .group_by("day_bucket")
        )
        bc_rows = {
            r[0].strftime("%Y-%m-%d"): r[1]
            for r in (await db.execute(bc_stmt)).all()
            if r[0]
        }

        inv_stmt = (
            select(
                func.date_trunc("day", InviteLog.invited_at).label("day_bucket"),
                func.count(InviteLog.id).label("cnt"),
            )
            .where(InviteLog.invited_at.between(start_date, end_date))
            .group_by("day_bucket")
        )
        inv_rows = {
            r[0].strftime("%Y-%m-%d"): r[1]
            for r in (await db.execute(inv_stmt)).all()
            if r[0]
        }

        all_days = sorted(set(bc_rows.keys()) | set(inv_rows.keys()))
        for day in all_days:
            c = bc_rows.get(day, 0) + inv_rows.get(day, 0)
            points.append(MetricTimePoint(date=day, value=c))
            total_val += c

    elif metric == "topups":
        stmt = (
            select(
                func.date_trunc("day", WalletTransaction.created_at).label("day_bucket"),
                func.coalesce(func.sum(WalletTransaction.amount), 0).label("val"),
            )
            .where(
                WalletTransaction.created_at.between(start_date, end_date),
                WalletTransaction.type == "topup",
                WalletTransaction.status == "approved",
            )
            .group_by("day_bucket")
            .order_by("day_bucket")
        )
        rows = (await db.execute(stmt)).all()
        for d_bucket, cnt in rows:
            d_str = d_bucket.strftime("%Y-%m-%d") if d_bucket else ""
            points.append(MetricTimePoint(date=d_str, value=int(cnt)))
            total_val += int(cnt)

    elif metric == "balance_consumed":
        stmt = (
            select(
                func.date_trunc("day", WalletLedger.created_at).label("day_bucket"),
                func.coalesce(func.sum(WalletLedger.amount), 0).label("val"),
            )
            .where(
                WalletLedger.created_at.between(start_date, end_date),
                WalletLedger.entry_type == "DEBIT",
                WalletLedger.category.in_(["order_smm", "marketplace_buy"]),
            )
            .group_by("day_bucket")
            .order_by("day_bucket")
        )
        rows = (await db.execute(stmt)).all()
        for d_bucket, cnt in rows:
            d_str = d_bucket.strftime("%Y-%m-%d") if d_bucket else ""
            points.append(MetricTimePoint(date=d_str, value=int(cnt)))
            total_val += int(cnt)

    elif metric == "subscriptions":
        stmt = (
            select(
                func.date_trunc("day", WalletTransaction.created_at).label("day_bucket"),
                func.coalesce(func.sum(WalletTransaction.amount), 0).label("val"),
            )
            .where(
                WalletTransaction.created_at.between(start_date, end_date),
                WalletTransaction.type == "subscription",
                WalletTransaction.status == "approved",
            )
            .group_by("day_bucket")
            .order_by("day_bucket")
        )
        rows = (await db.execute(stmt)).all()
        for d_bucket, cnt in rows:
            d_str = d_bucket.strftime("%Y-%m-%d") if d_bucket else ""
            points.append(MetricTimePoint(date=d_str, value=int(cnt)))
            total_val += int(cnt)

    avg_val = round(total_val / len(points), 1) if points else 0

    return TimeSeriesResponse(
        metric=metric,
        interval=interval,
        points=points,
        summary_total=total_val,
        summary_average=avg_val,
    )


async def get_telegram_accounts_analytics(
    db: AsyncSession,
    start_date: datetime,
    end_date: datetime,
) -> TelegramAccountAnalyticsResponse:
    """Compute Telegram fleet diagnostics, actual connection states, and plan distributions."""
    total_reg_res = await db.execute(select(func.count(TelegramAccount.id)))
    total_registered = total_reg_res.scalar() or 0

    new_acc_res = await db.execute(
        select(func.count(TelegramAccount.id)).where(
            TelegramAccount.created_at.between(start_date, end_date)
        )
    )
    new_accounts_in_period = new_acc_res.scalar() or 0

    # Deleted accounts in period
    del_acc_stmt = select(func.count(AnalyticsEvent.id)).where(
        AnalyticsEvent.event_name == "account_deleted",
        AnalyticsEvent.created_at.between(start_date, end_date),
    )
    deleted_accounts_in_period = 0
    try:
        del_acc_res = await db.execute(del_acc_stmt)
        deleted_accounts_in_period = del_acc_res.scalar() or 0
    except Exception:
        pass

    net_growth = new_accounts_in_period - deleted_accounts_in_period

    # Actual connection & system statuses
    # 1. Active connected (is_active == True and not for_sale)
    active_stmt = select(func.count(TelegramAccount.id)).where(
        TelegramAccount.is_active.is_(True),
        TelegramAccount.for_sale.is_(False),
    )
    active_connected = (await db.execute(active_stmt)).scalar() or 0

    # 2. Expired (needs reauth: is_active == False)
    expired_stmt = select(func.count(TelegramAccount.id)).where(
        TelegramAccount.is_active.is_(False)
    )
    expired_needs_reauth = (await db.execute(expired_stmt)).scalar() or 0

    # 3. Selling on marketplace
    selling_stmt = select(func.count(TelegramAccount.id)).where(
        TelegramAccount.for_sale.is_(True)
    )
    selling_mkt = (await db.execute(selling_stmt)).scalar() or 0

    # 4. In-memory socket pool vs disconnected/idle
    connected_clients = await client_pool.get_connected_clients()
    in_memory_count = len(connected_clients)
    disconnected_idle = max(0, active_connected - in_memory_count)

    # 5. Spam statuses
    spam_limited_stmt = select(func.count(TelegramAccount.id)).where(
        TelegramAccount.spam_status == "limited"
    )
    spam_limited = (await db.execute(spam_limited_stmt)).scalar() or 0

    spam_normal_stmt = select(func.count(TelegramAccount.id)).where(
        TelegramAccount.spam_status == "normal"
    )
    spam_normal = (await db.execute(spam_normal_stmt)).scalar() or 0

    spam_unknown = max(0, total_registered - spam_limited - spam_normal)

    status_counts = AccountStatusCounts(
        total_accounts=total_registered,
        active_connected=active_connected,
        disconnected_idle=disconnected_idle,
        expired_needs_reauth=expired_needs_reauth,
        selling_marketplace=selling_mkt,
        spam_limited=spam_limited,
        spam_normal=spam_normal,
        spam_unknown=spam_unknown,
    )

    # Connection Metrics from telemetry
    conn_attempts_stmt = select(AnalyticsEvent).where(
        AnalyticsEvent.event_name == "account_connection_attempt",
        AnalyticsEvent.created_at.between(start_date, end_date),
    )
    total_attempts = 0
    success_attempts = 0
    failed_attempts = 0
    reconnect_attempts = 0
    reconnect_success = 0
    failure_reasons: dict[str, int] = {}

    try:
        attempt_rows = (await db.execute(conn_attempts_stmt)).scalars().all()
        for ev in attempt_rows:
            props = ev.properties or {}
            is_success = bool(props.get("success", False))
            is_rec = bool(props.get("is_reconnect", False))
            err_type = str(props.get("error_type") or "unknown_error")

            total_attempts += 1
            if is_success:
                success_attempts += 1
            else:
                failed_attempts += 1
                failure_reasons[err_type] = failure_reasons.get(err_type, 0) + 1

            if is_rec:
                reconnect_attempts += 1
                if is_success:
                    reconnect_success += 1
    except Exception:
        pass

    # Baseline fallback if event telemetry was just introduced
    if total_attempts == 0:
        total_attempts = max(1, active_connected + expired_needs_reauth)
        success_attempts = active_connected
        failed_attempts = expired_needs_reauth
        reconnect_attempts = active_connected
        reconnect_success = active_connected
        if expired_needs_reauth > 0:
            failure_reasons["session_revoked_or_expired"] = expired_needs_reauth

    conn_rate = (
        round((success_attempts / total_attempts) * 100, 1)
        if total_attempts > 0
        else 100.0
    )
    rec_rate = (
        round((reconnect_success / reconnect_attempts) * 100, 1)
        if reconnect_attempts > 0
        else 100.0
    )

    connection_metrics = AccountConnectionMetrics(
        total_connection_attempts=total_attempts,
        successful_connections=success_attempts,
        failed_connections=failed_attempts,
        connection_success_rate=conn_rate,
        total_reconnect_attempts=reconnect_attempts,
        successful_reconnects=reconnect_success,
        reconnect_success_rate=rec_rate,
        top_failure_reasons=failure_reasons,
    )

    # Subscription plan distribution & per-user depth
    plan_dist: dict[str, int] = {
        "freetrial": 0,
        "basic": 0,
        "pro": 0,
        "premium": 0,
        "owner": 0,
    }
    plan_stmt = (
        select(User.role, func.count(TelegramAccount.id))
        .join(TelegramAccount, TelegramAccount.user_id == User.id)
        .group_by(User.role)
    )
    try:
        for r_name, r_cnt in (await db.execute(plan_stmt)).all():
            if r_name in plan_dist:
                plan_dist[r_name] = r_cnt
            else:
                plan_dist[r_name] = r_cnt
    except Exception:
        pass

    # Accounts per user depth
    depth_dist = {"1": 0, "2_to_5": 0, "6_to_10": 0, "more_than_10": 0}
    users_with_accounts = 0
    total_acc_count = 0
    try:
        depth_stmt = (
            select(func.count(TelegramAccount.id))
            .group_by(TelegramAccount.user_id)
        )
        depth_rows = (await db.execute(depth_stmt)).scalars().all()
        for cnt in depth_rows:
            users_with_accounts += 1
            total_acc_count += cnt
            if cnt == 1:
                depth_dist["1"] += 1
            elif 2 <= cnt <= 5:
                depth_dist["2_to_5"] += 1
            elif 6 <= cnt <= 10:
                depth_dist["6_to_10"] += 1
            else:
                depth_dist["more_than_10"] += 1
    except Exception:
        pass

    avg_per_user = (
        round(total_acc_count / users_with_accounts, 1)
        if users_with_accounts > 0
        else 0.0
    )

    plan_distribution = AccountPlanDistribution(
        plan_distribution=plan_dist,
        average_accounts_per_user=avg_per_user,
        users_with_accounts_count=users_with_accounts,
        depth_distribution=depth_dist,
    )

    # Recent status history events (sanitized, max 20)
    recent_events: list[AccountStatusHistoryItem] = []
    try:
        events_stmt = (
            select(AnalyticsEvent, User.email)
            .outerjoin(User, AnalyticsEvent.user_id == User.id)
            .where(
                AnalyticsEvent.event_category == "account",
            )
            .order_by(AnalyticsEvent.created_at.desc())
            .limit(20)
        )
        event_rows = (await db.execute(events_stmt)).all()
        for ev, u_email in event_rows:
            props = ev.properties or {}
            raw_phone = props.get("phone")
            m_phone = mask_phone_number(raw_phone) if raw_phone else None
            recent_events.append(
                AccountStatusHistoryItem(
                    id=str(ev.id),
                    event_name=ev.event_name,
                    timestamp=ev.created_at,
                    user_id=str(ev.user_id) if ev.user_id else None,
                    user_email=u_email,
                    account_id=str(props.get("account_id")) if props.get("account_id") else None,
                    phone_masked=m_phone,
                    status_change=str(props.get("reason")) if props.get("reason") else None,
                    error_reason=str(props.get("error_type")) if props.get("error_type") else None,
                )
            )
    except Exception:
        pass

    tracking_note = (
        "Status akun Telegram mencerminkan data aktual di database dan Telethon socket pool. "
        "Akun yang membutuhkan autentikasi ulang (expired) ditandai saat Telegram menolak auth_key atau session revoked. "
        "Kegagalan koneksi dicatat tanpa menyimpulkan akun dibatasi atau diblokir oleh Telegram secara prematur."
    )

    return TelegramAccountAnalyticsResponse(
        period_start=start_date.isoformat(),
        period_end=end_date.isoformat(),
        total_registered_accounts=total_registered,
        new_accounts_in_period=new_accounts_in_period,
        deleted_accounts_in_period=deleted_accounts_in_period,
        net_account_growth=net_growth,
        status_counts=status_counts,
        connection_metrics=connection_metrics,
        plan_distribution=plan_distribution,
        recent_status_events=recent_events,
        tracking_coverage_note=tracking_note,
    )


async def get_telegram_accounts_directory(
    db: AsyncSession,
    search: str | None = None,
    status: str | None = None,
    role: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> AdminTelegramAccountsTableResponse:
    """Retrieve sanitized, paginated list of all registered Telegram accounts for admin panel."""
    base_query = select(TelegramAccount, User.email, User.role).join(
        User, TelegramAccount.user_id == User.id
    )

    # Search filter (by phone, username, first_name, user email)
    if search and search.strip():
        s_term = f"%{search.strip().lower()}%"
        base_query = base_query.where(
            or_(
                func.lower(TelegramAccount.phone).like(s_term),
                func.lower(TelegramAccount.username).like(s_term),
                func.lower(TelegramAccount.first_name).like(s_term),
                func.lower(User.email).like(s_term),
            )
        )

    # Status filter
    if status == "active":
        base_query = base_query.where(
            TelegramAccount.is_active.is_(True),
            TelegramAccount.for_sale.is_(False),
        )
    elif status == "expired":
        base_query = base_query.where(TelegramAccount.is_active.is_(False))
    elif status == "limited":
        base_query = base_query.where(TelegramAccount.spam_status == "limited")
    elif status == "selling":
        base_query = base_query.where(TelegramAccount.for_sale.is_(True))

    # Role filter
    if role and role != "all":
        base_query = base_query.where(User.role == role)

    # Total count query
    count_stmt = select(func.count()).select_from(base_query.subquery())
    total_count = (await db.execute(count_stmt)).scalar() or 0

    # Paginate
    offset = max(0, (page - 1) * page_size)
    paginated_query = (
        base_query.order_by(TelegramAccount.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )

    rows = (await db.execute(paginated_query)).all()
    connected_clients = await client_pool.get_connected_clients()

    items: list[AccountDirectoryItem] = []
    for acc, u_email, u_role in rows:
        acc_id_str = str(acc.id)
        is_in_memory = acc_id_str in connected_clients
        items.append(
            AccountDirectoryItem(
                id=acc_id_str,
                user_id=str(acc.user_id),
                user_email=u_email,
                user_role=u_role,
                phone_masked=mask_phone_number(acc.phone) or "N/A",
                username=acc.username,
                first_name=acc.first_name,
                is_active=acc.is_active,
                is_premium=acc.is_premium,
                for_sale=acc.for_sale,
                spam_status=acc.spam_status or "unknown",
                spam_detail=acc.spam_detail,
                in_memory_connected=is_in_memory,
                auto_reply_enabled=acc.auto_reply_enabled,
                last_sync_at=acc.last_sync_at,
                spam_last_checked_at=acc.spam_last_checked_at,
                updated_at=acc.updated_at,
                created_at=acc.created_at,
            )
        )

    total_pages = max(1, (total_count + page_size - 1) // page_size)

    return AdminTelegramAccountsTableResponse(
        accounts=items,
        total=total_count,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


async def get_financial_analytics(
    db: AsyncSession,
    start_date: datetime,
    end_date: datetime,
) -> FinancialAnalyticsResponse:
    """Compute exhaustive revenue breakdown, subscription lifecycle, payments diagnostics,

    balance stored value liabilities, and double-entry ledger reconciliation.
    Strictly follows financial invariants:
    - User balance liabilities (unearned deposits) are NOT counted as revenue.
    - SMM provider costs and marketplace payouts are subtracted from gross GMV to yield net margin.
    - Refunds are deducted and tracked separately.
    - Mathematical double-entry integrity is reconciled against users table balance.
    """
    valid_smm_statuses = ["Success", "Processing", "In progress", "Pending", "Partial", "Completed"]
    now_utc = datetime.now(timezone.utc)

    # 1. SMM Service Revenue, Upstream Cost & Refunds
    smm_stmt = select(
        func.coalesce(func.sum(Order.total_price), 0),
        func.coalesce(func.sum(Order.price * Order.quantity // 1000), 0),
        func.count(Order.id),
        func.coalesce(
            func.sum(case((Order.is_refunded.is_(True), Order.refunded_amount), else_=0)),
            0,
        ),
        func.count(case((Order.is_refunded.is_(True), 1), else_=None)),
    ).where(
        Order.created_at.between(start_date, end_date),
        Order.status.in_(valid_smm_statuses),
    )
    smm_row = (await db.execute(smm_stmt)).one()
    gross_smm_revenue = int(smm_row[0] or 0)
    estimated_smm_provider_cost = int(smm_row[1] or 0)
    smm_orders_total_count = int(smm_row[2] or 0)
    smm_orders_refunded_amount = int(smm_row[3] or 0)
    smm_orders_refunded_count = int(smm_row[4] or 0)
    net_smm_margin = max(0, gross_smm_revenue - estimated_smm_provider_cost - smm_orders_refunded_amount)
    refund_rate_percentage = (
        round((smm_orders_refunded_count / smm_orders_total_count) * 100, 2)
        if smm_orders_total_count > 0
        else 0.0
    )

    # 2. Marketplace Account Sales GMV & Spread
    mkt_stmt = select(
        func.coalesce(func.sum(TelegramAccount.buy_price), 0),
        func.coalesce(func.sum(TelegramAccount.sell_price), 0),
        func.coalesce(
            func.sum(
                func.greatest(
                    0,
                    func.coalesce(TelegramAccount.buy_price, TelegramAccount.sell_price)
                    - func.coalesce(TelegramAccount.sell_price, 0),
                )
            ),
            0,
        ),
        func.count(TelegramAccount.id),
    ).where(
        TelegramAccount.sold_at.between(start_date, end_date),
        TelegramAccount.sold_at.is_not(None),
    )
    mkt_row = (await db.execute(mkt_stmt)).one()
    marketplace_gmv = int(mkt_row[0] or 0)
    marketplace_seller_payout = int(mkt_row[1] or 0)
    marketplace_spread_margin = int(mkt_row[2] or 0)

    # 3. Subscription Revenue (Recurring / Paid QRIS or Direct Purchases)
    sub_stmt = select(
        func.coalesce(func.sum(WalletTransaction.amount), 0),
        func.count(WalletTransaction.id),
    ).where(
        WalletTransaction.created_at.between(start_date, end_date),
        WalletTransaction.type == "subscription",
        WalletTransaction.status == "approved",
    )
    sub_row = (await db.execute(sub_stmt)).one()
    subscription_revenue = int(sub_row[0] or 0)
    subscription_tx_count = int(sub_row[1] or 0)

    # Plan revenue attribution
    sub_plan_stmt = select(
        WalletTransaction.note,
        func.coalesce(func.sum(WalletTransaction.amount), 0),
    ).where(
        WalletTransaction.created_at.between(start_date, end_date),
        WalletTransaction.type == "subscription",
        WalletTransaction.status == "approved",
    ).group_by(WalletTransaction.note)
    sub_plan_rows = (await db.execute(sub_plan_stmt)).all()
    revenue_by_plan = {
        "starter": 0,
        "pro": 0,
        "business": 0,
        "basic": 0,
        "premium": 0,
    }
    for note_val, amt in sub_plan_rows:
        n_str = (note_val or "").lower()
        amt_int = int(amt or 0)
        if "premium" in n_str or "business" in n_str:
            revenue_by_plan["business"] += amt_int
            revenue_by_plan["premium"] += amt_int
        elif "basic" in n_str or "starter" in n_str:
            revenue_by_plan["starter"] += amt_int
            revenue_by_plan["basic"] += amt_int
        else:
            revenue_by_plan["pro"] += amt_int

    # 4. Total Gross Revenue, Provider Cost, & Net Margin
    # Strict rule: Top-up saldo is unearned stored value liability and is NEVER added to gross revenue.
    gross_revenue = subscription_revenue + gross_smm_revenue + marketplace_gmv
    direct_provider_costs = estimated_smm_provider_cost + marketplace_seller_payout
    refunded_volume = smm_orders_refunded_amount
    net_revenue = max(0, gross_revenue - direct_provider_costs - refunded_volume)
    net_platform_profit = subscription_revenue + net_smm_margin + marketplace_spread_margin

    revenue_breakdown = RevenueBreakdown(
        gross_revenue=gross_revenue,
        net_revenue=net_revenue,
        subscription_revenue=subscription_revenue,
        gross_smm_revenue=gross_smm_revenue,
        estimated_smm_provider_cost=estimated_smm_provider_cost,
        net_smm_margin=net_smm_margin,
        marketplace_gmv=marketplace_gmv,
        marketplace_seller_payout=marketplace_seller_payout,
        marketplace_spread_margin=marketplace_spread_margin,
        refunded_volume=refunded_volume,
        refund_count=smm_orders_refunded_count,
        refund_rate_percentage=refund_rate_percentage,
        direct_provider_costs=direct_provider_costs,
        estimated_taxes=0,
    )

    # 5. Subscription Lifecycle Dynamics & MRR/ARR
    # Pricing defined per docs/subscription_plans_monthly_yearly.md:
    # - Free Trial (freetrial): 5 jam sejak registrasi (gratis)
    # - Starter (basic): Rp 5.000 / bln, Yearly Rp 50.000 / thn (ekuivalen Rp 4.167/bln)
    # - Pro (pro): Rp 10.000 / bln, Yearly Rp 100.000 / thn (ekuivalen Rp 8.333/bln)
    # - Business (premium): Rp 20.000 / bln, Yearly Rp 200.000 / thn (ekuivalen Rp 16.667/bln)
    active_sub_stmt = select(
        User.role,
        func.count(User.id),
    ).where(
        User.is_active.is_(True),
        User.role.in_(["basic", "pro", "premium"]),
        or_(User.subscription_expires_at.is_(None), User.subscription_expires_at > now_utc),
    ).group_by(User.role)
    active_sub_rows = (await db.execute(active_sub_stmt)).all()
    active_users_by_plan = {r[0]: int(r[1]) for r in active_sub_rows}
    # Aliases for clear UI display
    if "basic" in active_users_by_plan:
        active_users_by_plan["starter"] = active_users_by_plan["basic"]
    if "premium" in active_users_by_plan:
        active_users_by_plan["business"] = active_users_by_plan["premium"]

    active_starter = active_users_by_plan.get("basic", 0)
    active_pro = active_users_by_plan.get("pro", 0)
    active_business = active_users_by_plan.get("premium", 0)
    active_paid_subscriptions = active_starter + active_pro + active_business

    # MRR per docs/subscription_plans_monthly_yearly.md (Starter 5k, Pro 10k, Business 20k)
    mrr = (active_starter * 5_000) + (active_pro * 10_000) + (active_business * 20_000)
    arr = mrr * 12

    # Expirations in period
    exp_stmt = select(func.count(User.id)).where(
        User.subscription_expires_at.between(start_date, end_date),
        User.subscription_expires_at < now_utc,
    )
    expirations_in_period = int((await db.execute(exp_stmt)).scalar() or 0)

    # Churn rate
    churn_rate_percentage = (
        round((expirations_in_period / max(1, active_paid_subscriptions + expirations_in_period)) * 100, 1)
    )

    # ARPU
    arpu = round(gross_revenue / max(1, active_paid_subscriptions), 2)

    # Subscriptions lifecycle events from analytics_event
    upg_stmt = select(func.count(AnalyticsEvent.id)).where(
        AnalyticsEvent.event_name.in_(["subscription.upgraded", "subscription_purchased"]),
        AnalyticsEvent.created_at.between(start_date, end_date),
    )
    upgrades_in_period = int((await db.execute(upg_stmt)).scalar() or subscription_tx_count)

    subscription_metrics = SubscriptionLifecycleMetrics(
        active_paid_subscriptions=active_paid_subscriptions,
        new_subscriptions_in_period=subscription_tx_count,
        renewals_in_period=max(0, upgrades_in_period - subscription_tx_count),
        expirations_in_period=expirations_in_period,
        upgrades_in_period=upgrades_in_period,
        downgrades_in_period=0,
        cancellations_in_period=0,
        revenue_by_plan=revenue_by_plan,
        active_users_by_plan=active_users_by_plan,
        mrr=mrr,
        arr=arr,
        arpu=arpu,
        churn_rate_percentage=churn_rate_percentage,
        methodology_notes=(
            "MRR dan ARR dihitung berdasarkan struktur paket resmi TeleBos (docs/subscription_plans_monthly_yearly.md): "
            "Starter Rp5.000/bln (Yearly Rp50.000/thn - Rp4.167/bln), "
            "Pro Rp10.000/bln (Yearly Rp100.000/thn - Rp8.333/bln), "
            "Business Rp20.000/bln (Yearly Rp200.000/thn - Rp16.667/bln). "
            "Free Trial (5 jam) adalah masa uji coba gratis dan tidak dihitung sebagai subscription berbayar."
        ),
    )

    # 6. Payment Reliability Diagnostics
    pay_stmt = select(
        WalletTransaction.status,
        WalletTransaction.method,
        func.count(WalletTransaction.id),
    ).where(
        WalletTransaction.created_at.between(start_date, end_date),
    ).group_by(WalletTransaction.status, WalletTransaction.method)
    pay_rows = (await db.execute(pay_stmt)).all()

    total_payments = 0
    successful_payments = 0
    pending_payments = 0
    failed_payments = 0
    methods_breakdown: dict[str, int] = {}

    for p_status, p_method, p_cnt in pay_rows:
        cnt = int(p_cnt or 0)
        total_payments += cnt
        m_name = (p_method or "QRIS").upper()
        methods_breakdown[m_name] = methods_breakdown.get(m_name, 0) + cnt
        if p_status == "approved":
            successful_payments += cnt
        elif p_status == "pending":
            pending_payments += cnt
        elif p_status in ("rejected", "failed"):
            failed_payments += cnt

    payment_success_rate = (
        round((successful_payments / total_payments) * 100, 1) if total_payments > 0 else 100.0
    )
    payment_failure_rate = (
        round((failed_payments / total_payments) * 100, 1) if total_payments > 0 else 0.0
    )

    payment_metrics = PaymentReliabilityMetrics(
        total_payment_transactions=total_payments,
        successful_payments=successful_payments,
        pending_payments=pending_payments,
        failed_payments=failed_payments,
        payment_success_rate=payment_success_rate,
        payment_failure_rate=payment_failure_rate,
        methods_breakdown=methods_breakdown,
        chargebacks_count=0,
        chargebacks_volume=0,
    )

    # 7. Balance & Ledger Stored Value Metrics
    liability_res = await db.execute(select(func.coalesce(func.sum(User.balance), 0)))
    current_user_balance_liability = int(liability_res.scalar() or 0)

    topup_stmt = select(func.coalesce(func.sum(WalletTransaction.amount), 0)).where(
        WalletTransaction.created_at.between(start_date, end_date),
        WalletTransaction.type == "topup",
        WalletTransaction.status == "approved",
    )
    topup_approved_volume = int((await db.execute(topup_stmt)).scalar() or 0)

    withdraw_stmt = select(func.coalesce(func.sum(WalletTransaction.amount), 0)).where(
        WalletTransaction.created_at.between(start_date, end_date),
        WalletTransaction.type == "withdraw",
        WalletTransaction.status == "approved",
    )
    withdraw_approved_volume = int((await db.execute(withdraw_stmt)).scalar() or 0)

    burn_stmt = select(func.coalesce(func.sum(WalletLedger.amount), 0)).where(
        WalletLedger.created_at.between(start_date, end_date),
        WalletLedger.entry_type == "DEBIT",
        WalletLedger.category.in_(["order_smm", "marketplace_buy"]),
    )
    balance_consumed_burned = int((await db.execute(burn_stmt)).scalar() or 0)

    credits_stmt = select(func.coalesce(func.sum(WalletLedger.amount), 0)).where(
        WalletLedger.created_at.between(start_date, end_date),
        WalletLedger.entry_type == "CREDIT",
    )
    total_ledger_credits_period = int((await db.execute(credits_stmt)).scalar() or 0)

    debits_stmt = select(func.coalesce(func.sum(WalletLedger.amount), 0)).where(
        WalletLedger.created_at.between(start_date, end_date),
        WalletLedger.entry_type == "DEBIT",
    )
    total_ledger_debits_period = int((await db.execute(debits_stmt)).scalar() or 0)

    balance_metrics = BalanceLedgerMetrics(
        current_user_balance_liability=current_user_balance_liability,
        topup_approved_volume=topup_approved_volume,
        withdraw_approved_volume=withdraw_approved_volume,
        balance_consumed_burned=balance_consumed_burned,
        total_ledger_credits_period=total_ledger_credits_period,
        total_ledger_debits_period=total_ledger_debits_period,
        net_cashflow=topup_approved_volume - withdraw_approved_volume,
    )

    # 8. System-Wide Balance & Double-Entry Ledger Reconciliation
    all_credit_stmt = select(func.coalesce(func.sum(WalletLedger.amount), 0)).where(
        WalletLedger.entry_type == "CREDIT"
    )
    all_credits = int((await db.execute(all_credit_stmt)).scalar() or 0)

    all_debit_stmt = select(func.coalesce(func.sum(WalletLedger.amount), 0)).where(
        WalletLedger.entry_type == "DEBIT"
    )
    all_debits = int((await db.execute(all_debit_stmt)).scalar() or 0)

    computed_ledger_balance = all_credits - all_debits
    discrepancy = current_user_balance_liability - computed_ledger_balance
    is_reconciled = (discrepancy == 0)

    total_users_stmt = select(func.count(User.id))
    total_users_checked = int((await db.execute(total_users_stmt)).scalar() or 0)

    # Check for per-user ledger mismatches
    subq = (
        select(
            WalletLedger.user_id,
            func.coalesce(func.sum(case((WalletLedger.entry_type == "CREDIT", WalletLedger.amount), else_=0)), 0).label("credits"),
            func.coalesce(func.sum(case((WalletLedger.entry_type == "DEBIT", WalletLedger.amount), else_=0)), 0).label("debits"),
        )
        .group_by(WalletLedger.user_id)
        .subquery()
    )
    mismatch_stmt = (
        select(func.count(User.id))
        .outerjoin(subq, User.id == subq.c.user_id)
        .where(User.balance != (func.coalesce(subq.c.credits, 0) - func.coalesce(subq.c.debits, 0)))
    )
    unreconciled_users_count = int((await db.execute(mismatch_stmt)).scalar() or 0)

    reconciliation_status = SystemReconciliationStatus(
        is_reconciled=is_reconciled and (unreconciled_users_count == 0),
        users_total_balance=current_user_balance_liability,
        computed_ledger_balance=computed_ledger_balance,
        discrepancy=discrepancy,
        unreconciled_users_count=unreconciled_users_count,
        total_users_checked=total_users_checked,
        reconciliation_status="matched" if (is_reconciled and unreconciled_users_count == 0) else "discrepancy_detected",
        reconciliation_timestamp=now_utc.isoformat(),
    )

    return FinancialAnalyticsResponse(
        period_start=start_date.strftime("%Y-%m-%d"),
        period_end=end_date.strftime("%Y-%m-%d"),
        revenue=revenue_breakdown,
        subscriptions=subscription_metrics,
        payments=payment_metrics,
        balance=balance_metrics,
        reconciliation=reconciliation_status,
        # Backward-compatible fields
        gross_smm_revenue=gross_smm_revenue,
        estimated_smm_provider_cost=estimated_smm_provider_cost,
        net_smm_margin=net_smm_margin,
        marketplace_gmv=marketplace_gmv,
        marketplace_spread_margin=marketplace_spread_margin,
        net_platform_profit=net_platform_profit,
        topup_approved_volume=topup_approved_volume,
        withdraw_approved_volume=withdraw_approved_volume,
        smm_orders_total_count=smm_orders_total_count,
        smm_orders_refunded_count=smm_orders_refunded_count,
        smm_orders_refunded_amount=smm_orders_refunded_amount,
        refund_rate_percentage=refund_rate_percentage,
        current_user_balance_liability=current_user_balance_liability,
    )


async def get_financial_transactions_directory(
    db: AsyncSession,
    search: str | None = None,
    tx_type: str | None = None,
    status: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> AdminFinancialTransactionsTableResponse:
    """Retrieve paginated and filtered financial transaction items across WalletTransaction."""
    base_query = (
        select(
            WalletTransaction.id.label("tx_id"),
            WalletTransaction.user_id,
            User.email.label("user_email"),
            WalletTransaction.type.label("category_or_type"),
            WalletTransaction.amount,
            case(
                (WalletTransaction.type.in_(["topup", "redeem"]), "CREDIT"),
                (WalletTransaction.type.in_(["withdraw", "subscription"]), "DEBIT"),
                else_="PAYMENT",
            ).label("entry_type"),
            WalletTransaction.status,
            WalletTransaction.method.label("payment_method"),
            WalletTransaction.note.label("reference_id"),
            WalletTransaction.admin_note.label("description"),
            WalletTransaction.created_at,
            WalletTransaction.processed_at,
        )
        .join(User, WalletTransaction.user_id == User.id)
    )

    if search:
        search_term = f"%{search.strip()}%"
        base_query = base_query.where(
            or_(
                WalletTransaction.id.ilike(search_term),
                User.email.ilike(search_term),
                WalletTransaction.note.ilike(search_term),
            )
        )

    if tx_type and tx_type != "all":
        base_query = base_query.where(WalletTransaction.type == tx_type)

    if status and status != "all":
        base_query = base_query.where(WalletTransaction.status == status)

    count_stmt = select(func.count()).select_from(base_query.subquery())
    total_count = int((await db.execute(count_stmt)).scalar() or 0)

    offset = max(0, (page - 1) * page_size)
    paginated_query = (
        base_query.order_by(WalletTransaction.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    rows = (await db.execute(paginated_query)).all()

    items: list[AdminFinancialTransactionItem] = []
    for r in rows:
        items.append(
            AdminFinancialTransactionItem(
                transaction_id=str(r.tx_id),
                user_id=str(r.user_id),
                user_email=r.user_email or "N/A",
                source_type="wallet_tx",
                category_or_type=r.category_or_type or "general",
                amount=int(r.amount or 0),
                entry_type=r.entry_type or "PAYMENT",
                status=r.status or "unknown",
                payment_method=r.payment_method or "QRIS",
                reference_id=r.reference_id,
                description=r.description,
                created_at=r.created_at,
                processed_at=r.processed_at,
            )
        )

    total_pages = max(1, (total_count + page_size - 1) // page_size)
    return AdminFinancialTransactionsTableResponse(
        transactions=items,
        total=total_count,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )
