"""Admin system and overview statistics endpoints."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_role
from app.models.auto_reply_log import AutoReplyLog
from app.models.broadcast_job import BroadcastJob
from app.models.invite_job import InviteJob
from app.models.onboarding_survey import OnboardingSurvey
from app.models.redeem_code import RedeemCode
from app.models.redeem_log import RedeemLog
from app.models.telegram_account import TelegramAccount
from app.models.user import User
from app.schemas.admin import AdminStatsResponse
from app.schemas.onboarding import (
    OnboardingAnalyticsResponse,
    OnboardingRecentSurveyItem,
)

router = APIRouter()


@router.get("/stats", response_model=AdminStatsResponse)
async def get_admin_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """Get overview statistics for the admin dashboard. Owner only."""
    # Total users
    user_count_result = await db.execute(select(func.count(User.id)))
    total_users = user_count_result.scalar() or 0

    # Total broadcast jobs
    bj_count_result = await db.execute(select(func.count(BroadcastJob.id)))
    total_broadcast_jobs = bj_count_result.scalar() or 0

    bj_running_result = await db.execute(
        select(func.count(BroadcastJob.id)).where(BroadcastJob.status == "running")
    )
    broadcast_running = bj_running_result.scalar() or 0
    broadcast_stopped = total_broadcast_jobs - broadcast_running

    # Total invite jobs
    ij_count_result = await db.execute(select(func.count(InviteJob.id)))
    total_invite_jobs = ij_count_result.scalar() or 0

    ij_running_result = await db.execute(
        select(func.count(InviteJob.id)).where(InviteJob.status == "running")
    )
    invite_running = ij_running_result.scalar() or 0
    invite_stopped = total_invite_jobs - invite_running

    # Total connected accounts (phone_verified = True)
    ta_count_result = await db.execute(
        select(func.count(TelegramAccount.id)).where(
            TelegramAccount.phone_verified.is_(True)
        )
    )
    total_accounts_connected = ta_count_result.scalar() or 0

    # Active accounts (phone_verified = True and is_active = True)
    ta_active_result = await db.execute(
        select(func.count(TelegramAccount.id)).where(
            TelegramAccount.phone_verified.is_(True),
            TelegramAccount.is_active.is_(True),
        )
    )
    accounts_active = ta_active_result.scalar() or 0

    # Selling accounts (phone_verified = True and is_active = True and for_sale = True)
    ta_selling_result = await db.execute(
        select(func.count(TelegramAccount.id)).where(
            TelegramAccount.phone_verified.is_(True),
            TelegramAccount.is_active.is_(True),
            TelegramAccount.for_sale.is_(True),
        )
    )
    accounts_selling = ta_selling_result.scalar() or 0

    # Expired accounts (phone_verified = True and is_active = False)
    ta_expired_result = await db.execute(
        select(func.count(TelegramAccount.id)).where(
            TelegramAccount.phone_verified.is_(True),
            TelegramAccount.is_active.is_(False),
        )
    )
    accounts_expired = ta_expired_result.scalar() or 0

    # Limited accounts (phone_verified = True and spam_status in limited status variants)
    ta_limited_result = await db.execute(
        select(func.count(TelegramAccount.id)).where(
            TelegramAccount.phone_verified.is_(True),
            TelegramAccount.spam_status.in_(
                ["limited", "temporary_limit", "permanent_limit"]
            ),
        )
    )
    accounts_limited = ta_limited_result.scalar() or 0

    # Completed and Failed broadcast jobs
    bj_completed_result = await db.execute(
        select(func.count(BroadcastJob.id)).where(BroadcastJob.status == "completed")
    )
    broadcast_completed = bj_completed_result.scalar() or 0

    bj_failed_result = await db.execute(
        select(func.count(BroadcastJob.id)).where(BroadcastJob.status == "failed")
    )
    broadcast_failed = bj_failed_result.scalar() or 0

    # Count users by role
    role_counts = {"basic": 0, "pro": 0, "premium": 0, "owner": 0}
    for role in role_counts:
        r = await db.execute(select(func.count(User.id)).where(User.role == role))
        role_counts[role] = r.scalar() or 0

    # Redeem code stats
    rc_count = await db.execute(select(func.count(RedeemCode.id)))
    total_redeem_codes = rc_count.scalar() or 0

    rl_count = await db.execute(select(func.count(RedeemLog.id)))
    total_redeemed = rl_count.scalar() or 0

    # Auto-Reply stats
    ar_total_result = await db.execute(
        select(func.count(TelegramAccount.id)).where(
            TelegramAccount.phone_verified.is_(True),
            TelegramAccount.auto_reply_enabled.is_(True),
        )
    )
    total_auto_reply_jobs = ar_total_result.scalar() or 0

    ar_running_result = await db.execute(
        select(func.count(TelegramAccount.id)).where(
            TelegramAccount.phone_verified.is_(True),
            TelegramAccount.auto_reply_enabled.is_(True),
            TelegramAccount.is_active.is_(True),
        )
    )
    auto_reply_running = ar_running_result.scalar() or 0
    auto_reply_stopped = max(0, total_auto_reply_jobs - auto_reply_running)

    ar_sent_result = await db.execute(select(func.count(AutoReplyLog.id)))
    total_auto_reply_sent = ar_sent_result.scalar() or 0

    # Onboarding stats
    ob_count_result = await db.execute(
        select(func.count(User.id)).where(User.onboarding_completed.is_(True))
    )
    onboarding_completed_count = ob_count_result.scalar() or 0
    onboarding_completion_rate = (
        round((onboarding_completed_count / total_users * 100), 1)
        if total_users > 0
        else 0.0
    )

    return AdminStatsResponse(
        total_users=total_users,
        total_broadcast_jobs=total_broadcast_jobs,
        total_invite_jobs=total_invite_jobs,
        total_accounts_connected=total_accounts_connected,
        total_basic_users=role_counts["basic"],
        total_pro_users=role_counts["pro"],
        total_premium_users=role_counts["premium"],
        total_owner_users=role_counts["owner"],
        total_redeem_codes=total_redeem_codes,
        total_redeemed=total_redeemed,
        accounts_active=accounts_active,
        accounts_selling=accounts_selling,
        accounts_expired=accounts_expired,
        accounts_limited=accounts_limited,
        broadcast_running=broadcast_running,
        broadcast_stopped=broadcast_stopped,
        broadcast_completed=broadcast_completed,
        broadcast_failed=broadcast_failed,
        invite_running=invite_running,
        invite_stopped=invite_stopped,
        total_auto_reply_jobs=total_auto_reply_jobs,
        auto_reply_running=auto_reply_running,
        auto_reply_stopped=auto_reply_stopped,
        total_auto_reply_sent=total_auto_reply_sent,
        onboarding_completed_count=onboarding_completed_count,
        onboarding_completion_rate=onboarding_completion_rate,
    )


@router.get("/onboarding/analytics", response_model=OnboardingAnalyticsResponse)
async def get_onboarding_analytics(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
    limit: int = Query(50, ge=1, le=200),
):
    """Retrieve comprehensive onboarding survey analytics and recent responses. Owner only."""
    # Total users
    total_users_res = await db.execute(select(func.count(User.id)))
    total_users = total_users_res.scalar() or 0

    # Users who completed onboarding
    completed_res = await db.execute(
        select(func.count(User.id)).where(User.onboarding_completed.is_(True))
    )
    completed_count = completed_res.scalar() or 0

    # Surveys marked as skipped
    skipped_res = await db.execute(
        select(func.count(OnboardingSurvey.id)).where(
            OnboardingSurvey.is_skipped.is_(True)
        )
    )
    skipped_count = skipped_res.scalar() or 0

    pending_count = max(0, total_users - completed_count)
    completion_rate = (
        round((completed_count / total_users * 100), 1) if total_users > 0 else 0.0
    )

    # Roles breakdown
    role_res = await db.execute(
        select(OnboardingSurvey.role, func.count(OnboardingSurvey.id))
        .where(OnboardingSurvey.role.is_not(None))
        .group_by(OnboardingSurvey.role)
    )
    roles_breakdown = {str(row[0]): int(row[1]) for row in role_res.all() if row[0]}

    # Referrals breakdown
    ref_res = await db.execute(
        select(OnboardingSurvey.referral, func.count(OnboardingSurvey.id))
        .where(OnboardingSurvey.referral.is_not(None))
        .group_by(OnboardingSurvey.referral)
    )
    referrals_breakdown = {str(row[0]): int(row[1]) for row in ref_res.all() if row[0]}

    # Volume breakdown
    vol_res = await db.execute(
        select(OnboardingSurvey.volume, func.count(OnboardingSurvey.id))
        .where(OnboardingSurvey.volume.is_not(None))
        .group_by(OnboardingSurvey.volume)
    )
    volumes_breakdown = {str(row[0]): int(row[1]) for row in vol_res.all() if row[0]}

    # Features breakdown
    feat_res = await db.execute(select(OnboardingSurvey.features))
    features_breakdown: dict[str, int] = {}
    for (feats,) in feat_res.all():
        if isinstance(feats, list):
            for f in feats:
                if isinstance(f, str) and f:
                    features_breakdown[f] = features_breakdown.get(f, 0) + 1

    # Recent surveys
    recent_surveys_res = await db.execute(
        select(OnboardingSurvey, User.email, User.full_name)
        .join(User, OnboardingSurvey.user_id == User.id)
        .order_by(OnboardingSurvey.created_at.desc())
        .limit(limit)
    )
    recent_surveys = []
    for survey, email, full_name in recent_surveys_res.all():
        recent_surveys.append(
            OnboardingRecentSurveyItem(
                id=survey.id,
                user_id=survey.user_id,
                user_email=email,
                user_full_name=full_name,
                role=survey.role,
                referral=survey.referral,
                volume=survey.volume,
                features=survey.features or [],
                is_skipped=survey.is_skipped,
                created_at=survey.created_at,
            )
        )

    return OnboardingAnalyticsResponse(
        total_users=total_users,
        completed_count=completed_count,
        skipped_count=skipped_count,
        pending_count=pending_count,
        completion_rate=completion_rate,
        roles_breakdown=roles_breakdown,
        referrals_breakdown=referrals_breakdown,
        volumes_breakdown=volumes_breakdown,
        features_breakdown=features_breakdown,
        recent_surveys=recent_surveys,
    )
