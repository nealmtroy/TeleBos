"""Pydantic v2 schemas for TeleBos Analytics Foundation."""

from datetime import date, datetime
from enum import StrEnum
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field


class EventCategory(StrEnum):
    """Domain categorization separating product, financial, automation, and system events."""

    PRODUCT = "product"
    FINANCIAL = "financial"
    AUTOMATION = "automation"
    ACCOUNT = "account"
    SUBSCRIPTION = "subscription"
    SYSTEM = "system"


class AnalyticsEventCreate(BaseModel):
    """Schema for recording a new analytics event."""

    event_name: str = Field(..., min_length=2, max_length=64, description="Standardized event name")
    event_category: EventCategory = Field(..., description="High-level domain category")
    user_id: UUID | None = Field(None, description="Owner/initiator user UUID if applicable")
    properties: dict[str, Any] = Field(default_factory=dict, description="Sanitized metadata payload")
    dedup_key: str | None = Field(None, max_length=128, description="Unique deduplication token")


class AnalyticsEventResponse(BaseModel):
    """Public representation of an analytics audit event."""

    id: UUID
    user_id: UUID | None
    event_category: str
    event_name: str
    properties: dict[str, Any]
    dedup_key: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class MetricTimePoint(BaseModel):
    """Point in time for charting trends."""

    date: str  # YYYY-MM-DD
    value: int | float
    secondary_value: int | float | None = None


class TimeSeriesResponse(BaseModel):
    """Timeseries trend data."""

    metric: str
    interval: str  # day, week, month
    points: list[MetricTimePoint]
    summary_total: int | float = 0
    summary_average: int | float = 0


class AnalyticsOverviewResponse(BaseModel):
    """Executive KPI Overview for admin dashboard."""

    period_start: str
    period_end: str
    total_registered_users: int = 0
    total_new_users: int
    user_growth_percentage: float
    dau: int = 0
    wau: int = 0
    mau: int = 0
    total_telegram_accounts: int = 0
    active_telegram_accounts: int
    spam_limited_accounts: int
    active_paid_subscriptions: int = 0
    total_broadcast_messages_sent: int
    total_broadcast_messages_failed: int = 0
    broadcast_delivery_rate: float
    gross_revenue: int
    prev_gross_revenue: int = 0
    revenue_growth_percentage: float = 0.0
    net_platform_margin: int
    net_cashflow: int
    topup_approved_volume: int
    withdraw_approved_volume: int
    current_balance_liability: int
    total_transactions_count: int = 0
    system_errors_count: int = 0
    top_failure_reasons: dict[str, int] = Field(default_factory=dict)


class RetentionCohortMetrics(BaseModel):
    """Retention metrics across D1, D7, and D30 with cohort maturity."""

    cohort_total_users: int = 0
    d1_eligible_users: int = 0
    d1_retained_users: int = 0
    d1_retention_rate: float | None = None
    d7_eligible_users: int = 0
    d7_retained_users: int = 0
    d7_retention_rate: float | None = None
    d30_eligible_users: int = 0
    d30_retained_users: int = 0
    d30_retention_rate: float | None = None


class FeatureAdoptionMetrics(BaseModel):
    """Adoption rate of key platform capabilities across users."""

    telegram_accounts_connected_users: int = 0
    telegram_accounts_adoption_rate: float = 0.0
    broadcast_users: int = 0
    broadcast_adoption_rate: float = 0.0
    invite_users: int = 0
    invite_adoption_rate: float = 0.0
    auto_reply_users: int = 0
    auto_reply_adoption_rate: float = 0.0
    smm_order_users: int = 0
    smm_order_adoption_rate: float = 0.0
    marketplace_traders: int = 0
    marketplace_adoption_rate: float = 0.0


class UserStatusBreakdown(BaseModel):
    """User operational status distribution."""

    active_users_count: int = 0
    dormant_users_count: int = 0
    suspended_users_count: int = 0
    banned_users_count: int = 0


class UserAnalyticsResponse(BaseModel):
    """Comprehensive user intelligence, retention, and lifecycle analytics."""

    total_users: int
    new_users_in_period: int
    user_growth_percentage: float = 0.0
    dau: int = 0
    wau: int = 0
    mau: int = 0
    stickiness_dau_mau_ratio: float = 0.0
    product_meaningful_active_users: int = 0
    product_meaningful_active_rate: float = 0.0
    churned_users_count: int = 0
    reactivated_users_count: int = 0
    status_breakdown: UserStatusBreakdown = Field(default_factory=UserStatusBreakdown)
    role_distribution: dict[str, int]
    retention: RetentionCohortMetrics = Field(default_factory=RetentionCohortMetrics)
    feature_adoption: FeatureAdoptionMetrics = Field(default_factory=FeatureAdoptionMetrics)
    onboarding_completion_rate: float
    persona_distribution: dict[str, int]
    referral_distribution: dict[str, int]
    expiring_subscriptions_30d: int
    suspended_users_count: int
    tracking_coverage_note: str = ""


class JobStatusBreakdown(BaseModel):
    """Logical jobs by status."""

    total_jobs: int = 0
    successful_completed: int = 0
    failed: int = 0
    cancelled: int = 0
    running: int = 0
    paused: int = 0
    pending: int = 0


class ExecutionPerformanceMetrics(BaseModel):
    """Execution performance, success/failure, retry and timeout metrics."""

    total_logical_jobs: int = 0
    total_execution_attempts: int = 0
    successful_executions: int = 0
    failed_executions: int = 0
    cancelled_executions: int = 0
    pending_executions: int = 0
    success_rate: float = 100.0
    failure_rate: float = 0.0
    retry_rate: float = 0.0
    timeout_rate: float = 0.0
    retried_executions_count: int = 0
    timeout_executions_count: int = 0
    average_duration_seconds: float = 0.0
    p95_duration_seconds: float = 0.0


class QueueWorkerHealthMetrics(BaseModel):
    """Redis queue backlog and worker health telemetry."""

    queue_backlog_count: int = 0
    average_queue_wait_seconds: float = 0.0
    p95_queue_wait_seconds: float = 0.0
    is_queue_connected: bool = True
    active_worker_consumers: int = 1
    worker_health_status: str = "healthy"  # "healthy", "degraded", "offline"
    worker_failures_count: int = 0
    active_running_tasks_count: int = 0


class AutomationTypeUsage(BaseModel):
    """Usage distribution across automation types."""

    broadcast_jobs_count: int = 0
    broadcast_executions_count: int = 0
    invite_jobs_count: int = 0
    invite_executions_count: int = 0
    autojoin_jobs_count: int = 0
    autojoin_executions_count: int = 0
    autoreply_executions_count: int = 0


class TaskErrorCategoryBreakdown(BaseModel):
    """Error breakdown per task type and normalized error category."""

    by_task_type: dict[str, int] = Field(default_factory=dict)
    by_error_category: dict[str, int] = Field(default_factory=dict)
    top_error_messages: list[dict[str, Any]] = Field(default_factory=list)


class AutomationAnalyticsResponse(BaseModel):
    """Comprehensive Automation jobs and task execution performance metrics."""

    period_start: str = ""
    period_end: str = ""
    performance: ExecutionPerformanceMetrics = Field(default_factory=ExecutionPerformanceMetrics)
    status_breakdown: JobStatusBreakdown = Field(default_factory=JobStatusBreakdown)
    queue_worker: QueueWorkerHealthMetrics = Field(default_factory=QueueWorkerHealthMetrics)
    usage_by_type: AutomationTypeUsage = Field(default_factory=AutomationTypeUsage)
    error_breakdown: TaskErrorCategoryBreakdown = Field(default_factory=TaskErrorCategoryBreakdown)

    # Backward-compatible fields
    total_broadcast_jobs: int = 0
    total_messages_sent: int = 0
    total_messages_failed: int = 0
    broadcast_success_rate: float = 100.0
    top_failure_reasons: dict[str, int] = Field(default_factory=dict)
    total_invite_jobs: int = 0
    total_members_invited: int = 0
    total_auto_join_jobs: int = 0
    total_auto_joins_succeeded: int = 0
    total_auto_replies_sent: int = 0


class RevenueBreakdown(BaseModel):
    """Detailed revenue streams, provider costs, and net margins."""

    gross_revenue: int = 0
    net_revenue: int = 0
    subscription_revenue: int = 0
    gross_smm_revenue: int = 0
    estimated_smm_provider_cost: int = 0
    net_smm_margin: int = 0
    marketplace_gmv: int = 0
    marketplace_seller_payout: int = 0
    marketplace_spread_margin: int = 0
    refunded_volume: int = 0
    refund_count: int = 0
    refund_rate_percentage: float = 0.0
    direct_provider_costs: int = 0
    estimated_taxes: int = 0


class SubscriptionLifecycleMetrics(BaseModel):
    """Subscription lifecycle, active tiers, MRR/ARR, and retention dynamics."""

    active_paid_subscriptions: int = 0
    new_subscriptions_in_period: int = 0
    renewals_in_period: int = 0
    expirations_in_period: int = 0
    upgrades_in_period: int = 0
    downgrades_in_period: int = 0
    cancellations_in_period: int = 0
    revenue_by_plan: dict[str, int] = Field(default_factory=dict)
    active_users_by_plan: dict[str, int] = Field(default_factory=dict)
    mrr: int = 0
    arr: int = 0
    arpu: float = 0.0
    churn_rate_percentage: float = 0.0
    methodology_notes: str = ""


class PaymentReliabilityMetrics(BaseModel):
    """Payment gateway and wallet transaction diagnostics."""

    total_payment_transactions: int = 0
    successful_payments: int = 0
    pending_payments: int = 0
    failed_payments: int = 0
    payment_success_rate: float = 100.0
    payment_failure_rate: float = 0.0
    methods_breakdown: dict[str, int] = Field(default_factory=dict)
    chargebacks_count: int = 0
    chargebacks_volume: int = 0


class BalanceLedgerMetrics(BaseModel):
    """Balance stored value, topups, burn rate, and double-entry totals."""

    current_user_balance_liability: int = 0
    topup_approved_volume: int = 0
    withdraw_approved_volume: int = 0
    balance_consumed_burned: int = 0
    total_ledger_credits_period: int = 0
    total_ledger_debits_period: int = 0
    net_cashflow: int = 0


class SystemReconciliationStatus(BaseModel):
    """Mathematical reconciliation between users table balance and ledger double-entry journal."""

    is_reconciled: bool = True
    users_total_balance: int = 0
    computed_ledger_balance: int = 0
    discrepancy: int = 0
    unreconciled_users_count: int = 0
    total_users_checked: int = 0
    reconciliation_status: str = "matched"  # "matched", "discrepancy_detected"
    reconciliation_timestamp: str = ""


class FinancialAnalyticsResponse(BaseModel):
    """Financial intelligence and platform margin breakdown."""

    period_start: str = ""
    period_end: str = ""
    revenue: RevenueBreakdown = Field(default_factory=RevenueBreakdown)
    subscriptions: SubscriptionLifecycleMetrics = Field(default_factory=SubscriptionLifecycleMetrics)
    payments: PaymentReliabilityMetrics = Field(default_factory=PaymentReliabilityMetrics)
    balance: BalanceLedgerMetrics = Field(default_factory=BalanceLedgerMetrics)
    reconciliation: SystemReconciliationStatus = Field(default_factory=SystemReconciliationStatus)

    # Backward-compatible fields
    gross_smm_revenue: int = 0
    estimated_smm_provider_cost: int = 0
    net_smm_margin: int = 0
    marketplace_gmv: int = 0
    marketplace_spread_margin: int = 0
    net_platform_profit: int = 0
    topup_approved_volume: int = 0
    withdraw_approved_volume: int = 0
    smm_orders_total_count: int = 0
    smm_orders_refunded_count: int = 0
    smm_orders_refunded_amount: int = 0
    refund_rate_percentage: float = 0.0
    current_user_balance_liability: int = 0


class AdminFinancialTransactionItem(BaseModel):
    """Sanitized financial transaction and ledger item for directory inspection."""

    transaction_id: str
    user_id: str
    user_email: str
    source_type: str  # "wallet_tx", "ledger"
    category_or_type: str  # "topup", "subscription", "order_smm", "marketplace_buy", etc.
    amount: int
    entry_type: str  # "CREDIT", "DEBIT", "PAYMENT"
    status: str  # "approved", "pending", "rejected", "settled"
    payment_method: str  # "QRIS", "WALLET", "VOUCHER", "MANUAL"
    reference_id: str | None = None
    description: str | None = None
    created_at: datetime
    processed_at: datetime | None = None


class AdminFinancialTransactionsTableResponse(BaseModel):
    """Paginated search response for Financial Transactions & Ledger Directory table."""

    transactions: list[AdminFinancialTransactionItem] = Field(default_factory=list)
    total: int = 0
    page: int = 1
    page_size: int = 20
    total_pages: int = 1


class AccountStatusCounts(BaseModel):
    """Actual account connection and operational status breakdown."""

    total_accounts: int = 0
    active_connected: int = 0
    disconnected_idle: int = 0
    expired_needs_reauth: int = 0
    selling_marketplace: int = 0
    spam_limited: int = 0
    spam_normal: int = 0
    spam_unknown: int = 0


class AccountConnectionMetrics(BaseModel):
    """Connection reliability and failure diagnostics."""

    total_connection_attempts: int = 0
    successful_connections: int = 0
    failed_connections: int = 0
    connection_success_rate: float = 100.0
    total_reconnect_attempts: int = 0
    successful_reconnects: int = 0
    reconnect_success_rate: float = 100.0
    top_failure_reasons: dict[str, int] = Field(default_factory=dict)


class AccountPlanDistribution(BaseModel):
    """Distribution of accounts across user subscription plans and per-user depth."""

    plan_distribution: dict[str, int] = Field(default_factory=dict)
    average_accounts_per_user: float = 0.0
    users_with_accounts_count: int = 0
    depth_distribution: dict[str, int] = Field(
        default_factory=lambda: {"1": 0, "2_to_5": 0, "6_to_10": 0, "more_than_10": 0}
    )


class AccountDirectoryItem(BaseModel):
    """Sanitized account entry for admin analytics table — NO session strings or tokens."""

    id: str
    user_id: str
    user_email: str
    user_role: str
    phone_masked: str
    username: str | None = None
    first_name: str | None = None
    is_active: bool = True
    is_premium: bool = False
    for_sale: bool = False
    spam_status: str = "unknown"
    spam_detail: str | None = None
    in_memory_connected: bool = False
    auto_reply_enabled: bool = False
    last_sync_at: datetime | None = None
    spam_last_checked_at: datetime | None = None
    updated_at: datetime | None = None
    created_at: datetime


class AccountStatusHistoryItem(BaseModel):
    """Sanitized status change and connection event history — strictly no credentials."""

    id: str
    event_name: str
    timestamp: datetime
    user_id: str | None = None
    user_email: str | None = None
    account_id: str | None = None
    phone_masked: str | None = None
    status_change: str | None = None
    error_reason: str | None = None


class TelegramAccountAnalyticsResponse(BaseModel):
    """Comprehensive Telegram account analytics payload for admin intelligence."""

    period_start: str
    period_end: str
    total_registered_accounts: int
    new_accounts_in_period: int
    deleted_accounts_in_period: int
    net_account_growth: int
    status_counts: AccountStatusCounts = Field(default_factory=AccountStatusCounts)
    connection_metrics: AccountConnectionMetrics = Field(default_factory=AccountConnectionMetrics)
    plan_distribution: AccountPlanDistribution = Field(default_factory=AccountPlanDistribution)
    recent_status_events: list[AccountStatusHistoryItem] = Field(default_factory=list)
    tracking_coverage_note: str = ""


class AdminTelegramAccountsTableResponse(BaseModel):
    """Paginated search response for Telegram accounts directory."""

    accounts: list[AccountDirectoryItem] = Field(default_factory=list)
    total: int = 0
    page: int = 1
    page_size: int = 20
    total_pages: int = 1


class AutomationTaskHistoryItem(BaseModel):
    """Sanitized individual automation task execution item for table/details."""

    task_id: str
    automation_type: str  # broadcast, invite, autojoin, autoreply
    user_id: str
    user_email: str
    status: str  # pending, running, completed, failed, cancelled, paused
    progress_percentage: float = 0.0
    total_items: int = 0
    successful_items: int = 0
    failed_items: int = 0
    started_at: datetime
    completed_at: datetime | None = None
    duration_seconds: float | None = None
    retry_count: int = 0
    error_summary: str | None = None
    queue_wait_seconds: float | None = None


class AdminAutomationTasksTableResponse(BaseModel):
    """Paginated search response for Automation Execution History table."""

    tasks: list[AutomationTaskHistoryItem] = Field(default_factory=list)
    total: int = 0
    page: int = 1
    page_size: int = 20
    total_pages: int = 1


class SystemResourceMetrics(BaseModel):
    """Host and application process utilization telemetry."""

    cpu_percent: float = 0.0
    process_cpu_percent: float = 0.0
    cpu_cores: int = 1
    memory_total_bytes: int = 0
    memory_used_bytes: int = 0
    memory_available_bytes: int = 0
    memory_percent: float = 0.0
    process_memory_rss_bytes: int = 0
    disk_total_bytes: int = 0
    disk_used_bytes: int = 0
    disk_free_bytes: int = 0
    disk_percent: float = 0.0
    network_bytes_sent: int = 0
    network_bytes_recv: int = 0


class ApiTrafficMetrics(BaseModel):
    """API traffic volume, percentiles latency, and HTTP status diagnostics."""

    total_requests: int = 0
    requests_per_minute: float = 0.0
    latency_p50_ms: float = 0.0
    latency_p95_ms: float = 0.0
    latency_p99_ms: float = 0.0
    latency_avg_ms: float = 0.0
    status_2xx_count: int = 0
    status_3xx_count: int = 0
    status_4xx_count: int = 0
    status_5xx_count: int = 0
    error_4xx_rate: float = 0.0
    error_5xx_rate: float = 0.0
    status_code_breakdown: dict[str, int] = Field(default_factory=dict)
    top_failing_routes: list[dict[str, Any]] = Field(default_factory=list)


class DatabaseHealthMetrics(BaseModel):
    """PostgreSQL connection pool status, probe latency, and slow queries."""

    is_connected: bool = True
    pool_size: int = 30
    checked_out_connections: int = 0
    checked_in_connections: int = 0
    overflow_connections: int = 0
    max_overflow: int = 30
    pool_utilization_percent: float = 0.0
    query_ping_latency_ms: float = 0.0
    database_dialect: str = "postgresql+asyncpg"
    slow_queries_count: int = 0
    slow_queries: list[dict[str, Any]] = Field(default_factory=list)


class SystemQueueWorkerMetrics(BaseModel):
    """Redis infrastructure, queues backlog, and async worker status."""

    is_redis_connected: bool = True
    redis_ping_latency_ms: float = 0.0
    redis_used_memory_human: str = "0B"
    queue_backlog_total: int = 0
    queue_backlog_by_name: dict[str, int] = Field(default_factory=dict)
    active_worker_consumers: int = 1
    worker_health_status: str = "healthy"
    worker_failures_count: int = 0


class RealtimeConnectionMetrics(BaseModel):
    """WebSocket client connections and pub/sub relay bridge telemetry."""

    active_websocket_connections: int = 0
    active_channels_count: int = 0
    redis_pubsub_bridge_status: str = "healthy"


class SystemIncidentItem(BaseModel):
    """Recorded operational incident or critical degradation event."""

    id: str
    timestamp: str
    severity: str  # "critical", "warning", "info"
    subsystem: str  # "api", "database", "redis", "worker"
    summary: str
    status_code: int | None = None
    route: str | None = None


class UptimeAndIncidentMetrics(BaseModel):
    """Uptime tracking and historical limitation transparency."""

    process_started_at: str
    uptime_seconds: int = 0
    uptime_human: str = ""
    system_status: str = "healthy"  # "healthy", "degraded", "critical"
    recent_incidents: list[SystemIncidentItem] = Field(default_factory=list)
    measurement_limitations_note: str = ""


class SystemHealthTimeSeriesPoint(BaseModel):
    """Rolling snapshot for telemetry trend charts."""

    timestamp: str
    request_volume: int = 0
    latency_p95_ms: float = 0.0
    error_count: int = 0
    cpu_percent: float = 0.0
    memory_percent: float = 0.0


class SystemHealthAnalyticsResponse(BaseModel):
    """Complete TeleBos system health analytics payload."""

    measured_at: str
    overall_status: str = "healthy"  # "healthy", "degraded", "critical"
    resources: SystemResourceMetrics = Field(default_factory=SystemResourceMetrics)
    api_traffic: ApiTrafficMetrics = Field(default_factory=ApiTrafficMetrics)
    database: DatabaseHealthMetrics = Field(default_factory=DatabaseHealthMetrics)
    queue_workers: SystemQueueWorkerMetrics = Field(default_factory=SystemQueueWorkerMetrics)
    realtime: RealtimeConnectionMetrics = Field(default_factory=RealtimeConnectionMetrics)
    uptime_incidents: UptimeAndIncidentMetrics = Field(default_factory=UptimeAndIncidentMetrics)
    timeseries: list[SystemHealthTimeSeriesPoint] = Field(default_factory=list)


# ── Security & Audit Analytics Schemas ──────────────────────────────────────────


class SecurityAuditLogItem(BaseModel):
    """Safe, sanitized representation of a security audit event."""

    id: UUID
    actor_id: UUID | None = None
    actor_email: str | None = None
    actor_role: str | None = None
    action: str
    target_type: str
    target_id: str | None = None
    target_label: str | None = None
    outcome: str
    severity: str
    ip_address: str | None = None
    user_agent: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict, alias="metadata_payload")
    created_at: datetime

    model_config = {"from_attributes": True, "populate_by_name": True}


class SecurityAuditLogsListResponse(BaseModel):
    """Paginated list of security audit log events."""

    events: list[SecurityAuditLogItem]
    total: int
    page: int
    page_size: int
    total_pages: int


class SecurityKPIMetrics(BaseModel):
    """Key security performance indicators."""

    successful_logins: int = 0
    failed_logins: int = 0
    password_changes: int = 0
    twofa_changes: int = 0
    api_key_actions: int = 0
    role_changes: int = 0
    balance_adjustments: int = 0
    sensitive_admin_actions: int = 0
    suspicious_events_count: int = 0


class SuspiciousSignalItem(BaseModel):
    """Evidence-based security risk signal."""

    signal_type: str
    severity: str  # "info", "warning", "critical"
    actor_identifier: str
    event_count: int
    evidence_summary: str
    recommended_action: str
    last_seen: str | None = None


class SecurityTimeSeriesPoint(BaseModel):
    """Daily audit event activity bucket."""

    timestamp: str  # YYYY-MM-DD
    total_events: int = 0
    failure_events: int = 0
    warning_events: int = 0


class SecurityAnalyticsResponse(BaseModel):
    """Aggregated security audit telemetry and analytics payload."""

    period_start: str
    period_end: str
    total_events: int
    kpis: SecurityKPIMetrics
    outcome_breakdown: dict[str, int] = Field(default_factory=dict)
    severity_breakdown: dict[str, int] = Field(default_factory=dict)
    top_actions: list[dict[str, Any]] = Field(default_factory=list)
    suspicious_signals: list[SuspiciousSignalItem] = Field(default_factory=list)
    timeseries: list[SecurityTimeSeriesPoint] = Field(default_factory=list)



