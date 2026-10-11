"""Admin Analytics API — Executive overview, time-series, and domain analytics."""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_role
from app.models.analytics_event import AnalyticsEvent
from app.models.user import User
from app.schemas.analytics import (
    AdminAutomationTasksTableResponse,
    AdminFinancialTransactionsTableResponse,
    AdminTelegramAccountsTableResponse,
    AnalyticsEventResponse,
    AnalyticsOverviewResponse,
    AutomationAnalyticsResponse,
    FinancialAnalyticsResponse,
    TelegramAccountAnalyticsResponse,
    TimeSeriesResponse,
    UserAnalyticsResponse,
    SystemHealthAnalyticsResponse,
    SecurityAnalyticsResponse,
    SecurityAuditLogsListResponse,
)
from app.services import analytics_query_service, analytics_tracking_service, security_audit_service
from app.services.system_health_service import system_telemetry
from app.utils.timezone import ensure_utc

router = APIRouter(prefix="/admin/analytics", tags=["admin-analytics"])


def _parse_date_bounds(
    start: str | None,
    end: str | None,
    range_val: str | None = None,
) -> tuple[datetime, datetime]:
    """Parse ISO date strings or relative range into UTC datetime bounds."""
    now = datetime.now(timezone.utc)
    if not end:
        end_dt = now
    else:
        try:
            end_dt = ensure_utc(datetime.fromisoformat(end.replace("Z", "+00:00")))
        except (ValueError, TypeError):
            end_dt = now

    if start:
        try:
            start_dt = ensure_utc(datetime.fromisoformat(start.replace("Z", "+00:00")))
        except (ValueError, TypeError):
            start_dt = end_dt - timedelta(days=30)
    else:
        if range_val == "24h":
            start_dt = end_dt - timedelta(hours=24)
        elif range_val == "7d":
            start_dt = end_dt - timedelta(days=7)
        elif range_val == "90d":
            start_dt = end_dt - timedelta(days=90)
        else:
            start_dt = end_dt - timedelta(days=30)

    # Ensure start is before end
    if start_dt > end_dt:
        start_dt, end_dt = end_dt - timedelta(days=30), end_dt

    return start_dt, end_dt


@router.get("/overview", response_model=AnalyticsOverviewResponse)
async def get_overview(
    range: str | None = Query(None, description="Time range preset: 24h, 7d, 30d, 90d"),
    start_date: str | None = Query(None, description="Start date ISO string (YYYY-MM-DD)"),
    end_date: str | None = Query(None, description="End date ISO string (YYYY-MM-DD)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """Retrieve top-level executive KPI metrics for the specified period. Owner only."""
    start_dt, end_dt = _parse_date_bounds(start_date, end_date, range_val=range)
    return await analytics_query_service.get_overview_metrics(db, start_dt, end_dt)


@router.get("/timeseries", response_model=TimeSeriesResponse)
async def get_timeseries(
    metric: str = Query("revenue", description="Metric to bucket: 'revenue', 'users', or 'broadcasts'"),
    interval: str = Query("day", description="Bucket interval ('day')"),
    range: str | None = Query(None, description="Time range preset: 24h, 7d, 30d, 90d"),
    start_date: str | None = Query(None, description="Start date ISO string"),
    end_date: str | None = Query(None, description="End date ISO string"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """Retrieve daily timeseries data for trend charts. Owner only."""
    start_dt, end_dt = _parse_date_bounds(start_date, end_date, range_val=range)
    return await analytics_query_service.get_timeseries_metrics(
        db, metric=metric, start_date=start_dt, end_date=end_dt, interval=interval
    )


@router.get("/users", response_model=UserAnalyticsResponse)
async def get_users_analytics(
    range: str | None = Query(None, description="Time range preset: 24h, 7d, 30d, 90d"),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """Retrieve user growth, onboarding, and subscription demographics. Owner only."""
    start_dt, end_dt = _parse_date_bounds(start_date, end_date, range_val=range)
    return await analytics_query_service.get_user_analytics(db, start_dt, end_dt)


@router.get("/automation", response_model=AutomationAnalyticsResponse)
async def get_automation_analytics(
    range: str | None = Query(None, description="Time range preset: 24h, 7d, 30d, 90d"),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """Retrieve automation execution statistics. Owner only."""
    start_dt, end_dt = _parse_date_bounds(start_date, end_date, range_val=range)
    return await analytics_query_service.get_automation_analytics(db, start_dt, end_dt)


@router.get("/automation/tasks", response_model=AdminAutomationTasksTableResponse)
async def get_automation_tasks(
    search: str | None = Query(None, description="Search by task ID or user email"),
    automation_type: str | None = Query(None, description="Filter: broadcast, invite, autojoin, all"),
    status: str | None = Query(None, description="Filter: pending, running, completed, failed, cancelled, all"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """Retrieve paginated list of unified automation task execution history. Owner only."""
    return await analytics_query_service.get_automation_tasks_directory(
        db,
        search=search,
        automation_type=automation_type,
        status=status,
        page=page,
        page_size=page_size,
    )


@router.get("/financial", response_model=FinancialAnalyticsResponse)
async def get_financial_analytics(
    range: str | None = Query(None, description="Time range preset: 24h, 7d, 30d, 90d"),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """Retrieve financial breakdown, SMM margin, and marketplace spread. Owner only."""
    start_dt, end_dt = _parse_date_bounds(start_date, end_date, range_val=range)
    return await analytics_query_service.get_financial_analytics(db, start_dt, end_dt)


@router.get("/financial/transactions", response_model=AdminFinancialTransactionsTableResponse)
async def get_financial_transactions(
    search: str | None = Query(None, description="Search by transaction ID, user email, or note"),
    tx_type: str | None = Query(None, description="Filter: topup, withdraw, subscription, redeem, all"),
    status: str | None = Query(None, description="Filter: approved, pending, rejected, all"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """Retrieve paginated financial transactions directory with search and status filtering. Owner only."""
    return await analytics_query_service.get_financial_transactions_directory(
        db,
        search=search,
        tx_type=tx_type,
        status=status,
        page=page,
        page_size=page_size,
    )


@router.get("/telegram-accounts", response_model=TelegramAccountAnalyticsResponse)
async def get_telegram_accounts_analytics(
    range: str | None = Query(None, description="Time range preset: 24h, 7d, 30d, 90d"),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """Retrieve Telegram fleet analytics, connection reliability, and plan distribution. Owner only."""
    start_dt, end_dt = _parse_date_bounds(start_date, end_date, range_val=range)
    return await analytics_query_service.get_telegram_accounts_analytics(db, start_dt, end_dt)


@router.get("/telegram-accounts/directory", response_model=AdminTelegramAccountsTableResponse)
async def get_telegram_accounts_directory(
    search: str | None = Query(None, description="Search by phone, username, name, or user email"),
    status: str | None = Query(None, description="Filter by status: active, expired, limited, selling"),
    role: str | None = Query(None, description="Filter by user subscription role"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """Retrieve paginated, sanitized directory of Telegram accounts. Owner only."""
    return await analytics_query_service.get_telegram_accounts_directory(
        db,
        search=search,
        status=status,
        role=role,
        page=page,
        page_size=page_size,
    )


@router.get("/system-health", response_model=SystemHealthAnalyticsResponse)
async def get_system_health_analytics(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """Retrieve TeleBos system health, resource utilization, latency percentiles, and incident history. Owner only."""
    return await system_telemetry.get_system_health_analytics(db)


@router.get("/security", response_model=SecurityAnalyticsResponse)
async def get_security_analytics(
    range: str | None = Query("7d", description="Time range preset: 24h, 7d, 30d, 90d"),
    start_date: str | None = Query(None, description="Start date ISO string"),
    end_date: str | None = Query(None, description="End date ISO string"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """Retrieve security audit metrics, outcome distribution, and calibrated suspicious signals. Owner only."""
    start_dt, end_dt = _parse_date_bounds(start_date, end_date, range_val=range)
    return await security_audit_service.get_security_analytics_summary(
        db, start_date=start_dt, end_date=end_dt
    )


@router.get("/security/logs", response_model=SecurityAuditLogsListResponse)
async def get_security_audit_logs(
    range: str | None = Query(None, description="Time range preset: 24h, 7d, 30d, 90d"),
    start_date: str | None = Query(None, description="Start date ISO string"),
    end_date: str | None = Query(None, description="End date ISO string"),
    actor: str | None = Query(None, description="Filter by actor email or UUID"),
    action: str | None = Query(None, description="Filter by action name or prefix"),
    outcome: str | None = Query(None, description="Filter by outcome: success, failure, warning"),
    severity: str | None = Query(None, description="Filter by severity: info, warning, critical"),
    search: str | None = Query(None, description="Free-text search query across target, email, IP"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """Retrieve filtered and paginated security audit logs with sanitized metadata. Owner only."""
    start_dt, end_dt = (None, None)
    if start_date or end_date or range:
        start_dt, end_dt = _parse_date_bounds(start_date, end_date, range_val=range)

    logs, total = await security_audit_service.query_security_audit_logs(
        db=db,
        start_date=start_dt,
        end_date=end_dt,
        actor=actor,
        action=action,
        outcome=outcome,
        severity=severity,
        search=search,
        page=page,
        page_size=page_size,
    )

    total_pages = max(1, (total + page_size - 1) // page_size) if total > 0 else 1
    return {
        "events": logs,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }


@router.get("/events", response_model=list[AnalyticsEventResponse])
async def list_recent_events(
    category: str | None = Query(None, description="Filter by event_category"),
    event_name: str | None = Query(None, description="Filter by event_name"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """Paginated stream of recent sanitized analytics audit events. Owner only."""
    stmt = select(AnalyticsEvent).order_by(AnalyticsEvent.created_at.desc()).offset(offset).limit(limit)
    if category:
        stmt = stmt.where(AnalyticsEvent.event_category == category.lower().strip())
    if event_name:
        stmt = stmt.where(AnalyticsEvent.event_name == event_name.strip())

    res = await db.execute(stmt)
    return list(res.scalars().all())


@router.post("/prune", status_code=status.HTTP_200_OK)
async def prune_events(
    retention_days: int = Query(90, ge=30, le=365),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """Prune ephemeral automation and system events older than retention_days. Owner only."""
    deleted_count = await analytics_tracking_service.prune_ephemeral_events(
        db, retention_days=retention_days
    )
    await db.commit()
    return {
        "status": "success",
        "deleted_count": deleted_count,
        "retention_days": retention_days,
    }
