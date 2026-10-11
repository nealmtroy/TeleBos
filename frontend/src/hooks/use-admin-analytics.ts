import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";

export type AnalyticsRange = "24h" | "7d" | "30d" | "90d" | "custom";

export interface AnalyticsOverviewData {
  period_start: string;
  period_end: string;
  total_registered_users: number;
  total_new_users: number;
  user_growth_percentage: number;
  dau: number;
  wau: number;
  mau: number;
  total_telegram_accounts: number;
  active_telegram_accounts: number;
  spam_limited_accounts: number;
  active_paid_subscriptions: number;
  total_broadcast_messages_sent: number;
  total_broadcast_messages_failed: number;
  broadcast_delivery_rate: number;
  gross_revenue: number;
  prev_gross_revenue: number;
  revenue_growth_percentage: number;
  net_platform_margin: number;
  net_cashflow: number;
  topup_approved_volume: number;
  withdraw_approved_volume: number;
  current_balance_liability: number;
  total_transactions_count: number;
  system_errors_count: number;
  top_failure_reasons: Record<string, number>;
}

export interface MetricTimePoint {
  date: string;
  value: number;
  secondary_value?: number | null;
}

export interface TimeSeriesData {
  metric: string;
  interval: string;
  points: MetricTimePoint[];
  summary_total: number;
  summary_average: number;
}

export interface JobStatusBreakdown {
  total_jobs: number;
  successful_completed: number;
  failed: number;
  cancelled: number;
  running: number;
  paused: number;
  pending: number;
}

export interface ExecutionPerformanceMetrics {
  total_logical_jobs: number;
  total_execution_attempts: number;
  successful_executions: number;
  failed_executions: number;
  cancelled_executions: number;
  pending_executions: number;
  success_rate: number;
  failure_rate: number;
  retry_rate: number;
  timeout_rate: number;
  retried_executions_count: number;
  timeout_executions_count: number;
  average_duration_seconds: number;
  p95_duration_seconds: number;
}

export interface QueueWorkerHealthMetrics {
  queue_backlog_count: number;
  average_queue_wait_seconds: number;
  p95_queue_wait_seconds: number;
  is_queue_connected: boolean;
  active_worker_consumers: number;
  worker_health_status: string;
  worker_failures_count: number;
  active_running_tasks_count: number;
}

export interface AutomationTypeUsage {
  broadcast_jobs_count: number;
  broadcast_executions_count: number;
  invite_jobs_count: number;
  invite_executions_count: number;
  autojoin_jobs_count: number;
  autojoin_executions_count: number;
  autoreply_executions_count: number;
}

export interface TaskErrorCategoryBreakdown {
  by_task_type: Record<string, number>;
  by_error_category: Record<string, number>;
  top_error_messages: Array<{ message: string; count: number }>;
}

export interface AutomationAnalyticsData {
  period_start?: string;
  period_end?: string;
  performance?: ExecutionPerformanceMetrics;
  status_breakdown?: JobStatusBreakdown;
  queue_worker?: QueueWorkerHealthMetrics;
  usage_by_type?: AutomationTypeUsage;
  error_breakdown?: TaskErrorCategoryBreakdown;

  total_broadcast_jobs: number;
  total_messages_sent: number;
  total_messages_failed: number;
  broadcast_success_rate: number;
  top_failure_reasons: Record<string, number>;
  total_invite_jobs: number;
  total_members_invited: number;
  total_auto_join_jobs: number;
  total_auto_joins_succeeded: number;
  total_auto_replies_sent: number;
}

export interface AnalyticsFilterParams {
  range: AnalyticsRange;
  start_date?: string;
  end_date?: string;
}

export function useAdminAnalyticsOverview(params: AnalyticsFilterParams) {
  return useQuery<AnalyticsOverviewData>({
    queryKey: ["admin", "analytics", "overview", params],
    queryFn: async () => {
      const q = new URLSearchParams();
      q.set("range", params.range);
      if (params.range === "custom") {
        if (params.start_date) q.set("start_date", params.start_date);
        if (params.end_date) q.set("end_date", params.end_date);
      }
      const { data } = await api.get(`/admin/analytics/overview?${q.toString()}`);
      return data;
    },
    staleTime: 30_000,
  });
}

export function useAdminAnalyticsTimeseries(
  metric:
    | "users"
    | "broadcasts"
    | "revenue"
    | "transactions"
    | "accounts"
    | "accounts_added"
    | "accounts_deleted"
    | "invites"
    | "autojoins"
    | "automation_executions"
    | "topups"
    | "balance_consumed"
    | "subscriptions",
  params: AnalyticsFilterParams
) {
  return useQuery<TimeSeriesData>({
    queryKey: ["admin", "analytics", "timeseries", metric, params],
    queryFn: async () => {
      const q = new URLSearchParams();
      q.set("metric", metric);
      q.set("range", params.range);
      if (params.range === "custom") {
        if (params.start_date) q.set("start_date", params.start_date);
        if (params.end_date) q.set("end_date", params.end_date);
      }
      const { data } = await api.get(`/admin/analytics/timeseries?${q.toString()}`);
      return data;
    },
    staleTime: 30_000,
  });
}

export function useAdminAnalyticsAutomation(params: AnalyticsFilterParams) {
  return useQuery<AutomationAnalyticsData>({
    queryKey: ["admin", "analytics", "automation", params],
    queryFn: async () => {
      const q = new URLSearchParams();
      q.set("range", params.range);
      if (params.range === "custom") {
        if (params.start_date) q.set("start_date", params.start_date);
        if (params.end_date) q.set("end_date", params.end_date);
      }
      const { data } = await api.get(`/admin/analytics/automation?${q.toString()}`);
      return data;
    },
    staleTime: 30_000,
  });
}

export interface RetentionCohortMetrics {
  cohort_total_users: number;
  d1_eligible_users: number;
  d1_retained_users: number;
  d1_retention_rate: number | null;
  d7_eligible_users: number;
  d7_retained_users: number;
  d7_retention_rate: number | null;
  d30_eligible_users: number;
  d30_retained_users: number;
  d30_retention_rate: number | null;
}

export interface FeatureAdoptionMetrics {
  telegram_accounts_connected_users: number;
  telegram_accounts_adoption_rate: number;
  broadcast_users: number;
  broadcast_adoption_rate: number;
  invite_users: number;
  invite_adoption_rate: number;
  auto_reply_users: number;
  auto_reply_adoption_rate: number;
  smm_order_users: number;
  smm_order_adoption_rate: number;
  marketplace_traders: number;
  marketplace_adoption_rate: number;
}

export interface UserStatusBreakdown {
  active_users_count: number;
  dormant_users_count: number;
  suspended_users_count: number;
  banned_users_count: number;
}

export interface UserAnalyticsData {
  total_users: number;
  new_users_in_period: number;
  user_growth_percentage: number;
  dau: number;
  wau: number;
  mau: number;
  stickiness_dau_mau_ratio: number;
  product_meaningful_active_users: number;
  product_meaningful_active_rate: number;
  churned_users_count: number;
  reactivated_users_count: number;
  status_breakdown: UserStatusBreakdown;
  role_distribution: Record<string, number>;
  retention: RetentionCohortMetrics;
  feature_adoption: FeatureAdoptionMetrics;
  onboarding_completion_rate: number;
  persona_distribution: Record<string, number>;
  referral_distribution: Record<string, number>;
  expiring_subscriptions_30d: number;
  suspended_users_count: number;
  tracking_coverage_note: string;
}

export function useAdminUserAnalytics(params: AnalyticsFilterParams) {
  return useQuery<UserAnalyticsData>({
    queryKey: ["admin", "analytics", "users", params],
    queryFn: async () => {
      const q = new URLSearchParams();
      q.set("range", params.range);
      if (params.range === "custom") {
        if (params.start_date) q.set("start_date", params.start_date);
        if (params.end_date) q.set("end_date", params.end_date);
      }
      const { data } = await api.get(`/admin/analytics/users?${q.toString()}`);
      return data;
    },
    staleTime: 30_000,
  });
}

export interface AccountStatusCounts {
  total_accounts: number;
  active_connected: number;
  disconnected_idle: number;
  expired_needs_reauth: number;
  selling_marketplace: number;
  spam_limited: number;
  spam_normal: number;
  spam_unknown: number;
}

export interface AccountConnectionMetrics {
  total_connection_attempts: number;
  successful_connections: number;
  failed_connections: number;
  connection_success_rate: number;
  total_reconnect_attempts: number;
  successful_reconnects: number;
  reconnect_success_rate: number;
  top_failure_reasons: Record<string, number>;
}

export interface AccountPlanDistribution {
  plan_distribution: Record<string, number>;
  average_accounts_per_user: number;
  users_with_accounts_count: number;
  depth_distribution: Record<string, number>;
}

export interface AccountDirectoryItem {
  id: string;
  user_id: string;
  user_email: string;
  user_role: string;
  phone_masked: string;
  username?: string | null;
  first_name?: string | null;
  is_active: boolean;
  is_premium: boolean;
  for_sale: boolean;
  spam_status: string;
  spam_detail?: string | null;
  in_memory_connected: boolean;
  auto_reply_enabled: boolean;
  last_sync_at?: string | null;
  spam_last_checked_at?: string | null;
  updated_at?: string | null;
  created_at: string;
}

export interface AccountStatusHistoryItem {
  id: string;
  event_name: string;
  timestamp: string;
  user_id?: string | null;
  user_email?: string | null;
  account_id?: string | null;
  phone_masked?: string | null;
  status_change?: string | null;
  error_reason?: string | null;
}

export interface TelegramAccountAnalyticsData {
  period_start: string;
  period_end: string;
  total_registered_accounts: number;
  new_accounts_in_period: number;
  deleted_accounts_in_period: number;
  net_account_growth: number;
  status_counts: AccountStatusCounts;
  connection_metrics: AccountConnectionMetrics;
  plan_distribution: AccountPlanDistribution;
  recent_status_events: AccountStatusHistoryItem[];
  tracking_coverage_note: string;
}

export interface AdminTelegramAccountsTableData {
  accounts: AccountDirectoryItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface TelegramAccountsDirectoryParams {
  search?: string;
  status?: string;
  role?: string;
  page?: number;
  page_size?: number;
}

export function useAdminTelegramAccountsAnalytics(params: AnalyticsFilterParams) {
  return useQuery<TelegramAccountAnalyticsData>({
    queryKey: ["admin", "analytics", "telegram-accounts", params],
    queryFn: async () => {
      const q = new URLSearchParams();
      q.set("range", params.range);
      if (params.range === "custom") {
        if (params.start_date) q.set("start_date", params.start_date);
        if (params.end_date) q.set("end_date", params.end_date);
      }
      const { data } = await api.get(`/admin/analytics/telegram-accounts?${q.toString()}`);
      return data;
    },
    staleTime: 30_000,
  });
}

export function useAdminTelegramAccountsDirectory(params: TelegramAccountsDirectoryParams) {
  return useQuery<AdminTelegramAccountsTableData>({
    queryKey: ["admin", "analytics", "telegram-accounts", "directory", params],
    queryFn: async () => {
      const q = new URLSearchParams();
      if (params.search) q.set("search", params.search);
      if (params.status && params.status !== "all") q.set("status", params.status);
      if (params.role && params.role !== "all") q.set("role", params.role);
      if (params.page) q.set("page", String(params.page));
      if (params.page_size) q.set("page_size", String(params.page_size));
      const { data } = await api.get(`/admin/analytics/telegram-accounts/directory?${q.toString()}`);
      return data;
    },
    staleTime: 15_000,
  });
}

export interface AutomationTaskHistoryItem {
  task_id: string;
  automation_type: string;
  user_id: string;
  user_email: string;
  status: string;
  progress_percentage: number;
  total_items: number;
  successful_items: number;
  failed_items: number;
  started_at: string;
  completed_at?: string | null;
  duration_seconds?: number | null;
  retry_count: number;
  error_summary?: string | null;
  queue_wait_seconds?: number | null;
}

export interface AdminAutomationTasksTableData {
  tasks: AutomationTaskHistoryItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface AutomationTasksDirectoryParams {
  search?: string;
  automation_type?: string;
  status?: string;
  page?: number;
  page_size?: number;
}

export function useAdminAutomationTasksDirectory(params: AutomationTasksDirectoryParams) {
  return useQuery<AdminAutomationTasksTableData>({
    queryKey: ["admin", "analytics", "automation", "tasks", params],
    queryFn: async () => {
      const q = new URLSearchParams();
      if (params.search) q.set("search", params.search);
      if (params.automation_type && params.automation_type !== "all") {
        q.set("automation_type", params.automation_type);
      }
      if (params.status && params.status !== "all") {
        q.set("status", params.status);
      }
      if (params.page) q.set("page", String(params.page));
      if (params.page_size) q.set("page_size", String(params.page_size));
      const { data } = await api.get(`/admin/analytics/automation/tasks?${q.toString()}`);
      return data;
    },
    staleTime: 15_000,
  });
}

export interface RevenueBreakdown {
  gross_revenue: number;
  net_revenue: number;
  subscription_revenue: number;
  gross_smm_revenue: number;
  estimated_smm_provider_cost: number;
  net_smm_margin: number;
  marketplace_gmv: number;
  marketplace_seller_payout: number;
  marketplace_spread_margin: number;
  refunded_volume: number;
  refund_count: number;
  refund_rate_percentage: number;
  direct_provider_costs: number;
  estimated_taxes: number;
}

export interface SubscriptionLifecycleMetrics {
  active_paid_subscriptions: number;
  new_subscriptions_in_period: number;
  renewals_in_period: number;
  expirations_in_period: number;
  upgrades_in_period: number;
  downgrades_in_period: number;
  cancellations_in_period: number;
  revenue_by_plan: Record<string, number>;
  active_users_by_plan: Record<string, number>;
  mrr: number;
  arr: number;
  arpu: number;
  churn_rate_percentage: number;
  methodology_notes: string;
}

export interface PaymentReliabilityMetrics {
  total_payment_transactions: number;
  successful_payments: number;
  pending_payments: number;
  failed_payments: number;
  payment_success_rate: number;
  payment_failure_rate: number;
  methods_breakdown: Record<string, number>;
  chargebacks_count: number;
  chargebacks_volume: number;
}

export interface BalanceLedgerMetrics {
  current_user_balance_liability: number;
  topup_approved_volume: number;
  withdraw_approved_volume: number;
  balance_consumed_burned: number;
  total_ledger_credits_period: number;
  total_ledger_debits_period: number;
  net_cashflow: number;
}

export interface SystemReconciliationStatus {
  is_reconciled: boolean;
  users_total_balance: number;
  computed_ledger_balance: number;
  discrepancy: number;
  unreconciled_users_count: number;
  total_users_checked: number;
  reconciliation_status: string;
  reconciliation_timestamp: string;
}

export interface FinancialAnalyticsData {
  period_start: string;
  period_end: string;
  revenue: RevenueBreakdown;
  subscriptions: SubscriptionLifecycleMetrics;
  payments: PaymentReliabilityMetrics;
  balance: BalanceLedgerMetrics;
  reconciliation: SystemReconciliationStatus;

  // Backward-compatible fields
  gross_smm_revenue: number;
  estimated_smm_provider_cost: number;
  net_smm_margin: number;
  marketplace_gmv: number;
  marketplace_spread_margin: number;
  net_platform_profit: number;
  topup_approved_volume: number;
  withdraw_approved_volume: number;
  smm_orders_total_count: number;
  smm_orders_refunded_count: number;
  smm_orders_refunded_amount: number;
  refund_rate_percentage: number;
  current_user_balance_liability: number;
}

export interface AdminFinancialTransactionItem {
  transaction_id: string;
  user_id: string;
  user_email: string;
  source_type: string;
  category_or_type: string;
  amount: number;
  entry_type: string;
  status: string;
  payment_method: string;
  reference_id?: string | null;
  description?: string | null;
  created_at: string;
  processed_at?: string | null;
}

export interface AdminFinancialTransactionsTableData {
  transactions: AdminFinancialTransactionItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface FinancialTransactionsDirectoryParams {
  search?: string;
  tx_type?: string;
  status?: string;
  page?: number;
  page_size?: number;
}

export function useAdminFinancialAnalytics(params: AnalyticsFilterParams) {
  return useQuery<FinancialAnalyticsData>({
    queryKey: ["admin", "analytics", "financial", params],
    queryFn: async () => {
      const q = new URLSearchParams();
      q.set("range", params.range);
      if (params.range === "custom") {
        if (params.start_date) q.set("start_date", params.start_date);
        if (params.end_date) q.set("end_date", params.end_date);
      }
      const { data } = await api.get(`/admin/analytics/financial?${q.toString()}`);
      return data;
    },
    staleTime: 30_000,
  });
}

export function useAdminFinancialTransactionsDirectory(params: FinancialTransactionsDirectoryParams) {
  return useQuery<AdminFinancialTransactionsTableData>({
    queryKey: ["admin", "analytics", "financial", "transactions", params],
    queryFn: async () => {
      const q = new URLSearchParams();
      if (params.search) q.set("search", params.search);
      if (params.tx_type && params.tx_type !== "all") {
        q.set("tx_type", params.tx_type);
      }
      if (params.status && params.status !== "all") {
        q.set("status", params.status);
      }
      if (params.page) q.set("page", String(params.page));
      if (params.page_size) q.set("page_size", String(params.page_size));
      const { data } = await api.get(`/admin/analytics/financial/transactions?${q.toString()}`);
      return data;
    },
    staleTime: 15_000,
  });
}

export interface SystemResourceMetrics {
  cpu_percent: number;
  process_cpu_percent: number;
  cpu_cores: number;
  memory_total_bytes: number;
  memory_used_bytes: number;
  memory_available_bytes: number;
  memory_percent: number;
  process_memory_rss_bytes: number;
  disk_total_bytes: number;
  disk_used_bytes: number;
  disk_free_bytes: number;
  disk_percent: number;
  network_bytes_sent: number;
  network_bytes_recv: number;
}

export interface FailingRouteItem {
  route: string;
  requests: number;
  errors: number;
  error_rate: number;
  avg_duration_ms: number;
}

export interface ApiTrafficMetrics {
  total_requests: number;
  requests_per_minute: number;
  latency_p50_ms: number;
  latency_p95_ms: number;
  latency_p99_ms: number;
  latency_avg_ms: number;
  status_2xx_count: number;
  status_3xx_count: number;
  status_4xx_count: number;
  status_5xx_count: number;
  error_4xx_rate: number;
  error_5xx_rate: number;
  status_code_breakdown: Record<string, number>;
  top_failing_routes: FailingRouteItem[];
}

export interface SlowQueryItem {
  pid?: number;
  query: string;
  state?: string;
  duration_ms: number;
  timestamp: string;
}

export interface DatabaseHealthMetrics {
  is_connected: boolean;
  pool_size: number;
  checked_out_connections: number;
  checked_in_connections: number;
  overflow_connections: number;
  max_overflow: number;
  pool_utilization_percent: number;
  query_ping_latency_ms: number;
  database_dialect: string;
  slow_queries_count: number;
  slow_queries: SlowQueryItem[];
}

export interface SystemQueueWorkerMetrics {
  is_redis_connected: boolean;
  redis_ping_latency_ms: number;
  redis_used_memory_human: string;
  queue_backlog_total: number;
  queue_backlog_by_name: Record<string, number>;
  active_worker_consumers: number;
  worker_health_status: string;
  worker_failures_count: number;
}

export interface RealtimeConnectionMetrics {
  active_websocket_connections: number;
  active_channels_count: number;
  redis_pubsub_bridge_status: string;
}

export interface SystemIncidentItem {
  id: string;
  timestamp: string;
  severity: "critical" | "warning" | "info";
  subsystem: string;
  summary: string;
  status_code?: number | null;
  route?: string | null;
}

export interface UptimeAndIncidentMetrics {
  process_started_at: string;
  uptime_seconds: number;
  uptime_human: string;
  system_status: "healthy" | "degraded" | "critical";
  recent_incidents: SystemIncidentItem[];
  measurement_limitations_note: string;
}

export interface SystemHealthTimeSeriesPoint {
  timestamp: string;
  request_volume: number;
  latency_p95_ms: number;
  error_count: number;
  cpu_percent: number;
  memory_percent: number;
}

export interface SystemHealthAnalyticsData {
  measured_at: string;
  overall_status: "healthy" | "degraded" | "critical";
  resources: SystemResourceMetrics;
  api_traffic: ApiTrafficMetrics;
  database: DatabaseHealthMetrics;
  queue_workers: SystemQueueWorkerMetrics;
  realtime: RealtimeConnectionMetrics;
  uptime_incidents: UptimeAndIncidentMetrics;
  timeseries: SystemHealthTimeSeriesPoint[];
}

export function useAdminSystemHealthAnalytics(refreshIntervalMs?: number) {
  return useQuery<SystemHealthAnalyticsData>({
    queryKey: ["admin", "analytics", "system-health"],
    queryFn: async () => {
      const { data } = await api.get("/admin/analytics/system-health");
      return data;
    },
    refetchInterval: refreshIntervalMs ?? false,
    staleTime: 5_000,
  });
}

// ── Security & Audit Analytics Types & Hooks ──────────────────────────────────

export interface SecurityKPIMetrics {
  successful_logins: number;
  failed_logins: number;
  password_changes: number;
  twofa_changes: number;
  api_key_actions: number;
  role_changes: number;
  balance_adjustments: number;
  sensitive_admin_actions: number;
  suspicious_events_count: number;
}

export interface SuspiciousSignalItem {
  signal_type: string;
  severity: "info" | "warning" | "critical";
  actor_identifier: string;
  event_count: number;
  evidence_summary: string;
  recommended_action: string;
  last_seen?: string | null;
}

export interface SecurityTimeSeriesPoint {
  timestamp: string;
  total_events: number;
  failure_events: number;
  warning_events: number;
}

export interface SecurityAnalyticsData {
  period_start: string;
  period_end: string;
  total_events: number;
  kpis: SecurityKPIMetrics;
  outcome_breakdown: Record<string, number>;
  severity_breakdown: Record<string, number>;
  top_actions: Array<{ action: string; count: number }>;
  suspicious_signals: SuspiciousSignalItem[];
  timeseries: SecurityTimeSeriesPoint[];
}

export interface SecurityAuditLogItem {
  id: string;
  actor_id?: string | null;
  actor_email?: string | null;
  actor_role?: string | null;
  action: string;
  target_type: string;
  target_id?: string | null;
  target_label?: string | null;
  outcome: "success" | "failure" | "warning";
  severity: "info" | "warning" | "critical";
  ip_address?: string | null;
  user_agent?: string | null;
  metadata_payload?: Record<string, any>;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface SecurityAuditLogsTableData {
  events: SecurityAuditLogItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface SecurityAuditLogsParams {
  range?: string;
  start_date?: string;
  end_date?: string;
  actor?: string;
  action?: string;
  outcome?: string;
  severity?: string;
  search?: string;
  page?: number;
  page_size?: number;
}

export function useAdminSecurityAnalytics(params: AnalyticsFilterParams) {
  return useQuery<SecurityAnalyticsData>({
    queryKey: ["admin", "analytics", "security", params],
    queryFn: async () => {
      const q = new URLSearchParams();
      q.set("range", params.range);
      if (params.range === "custom") {
        if (params.start_date) q.set("start_date", params.start_date);
        if (params.end_date) q.set("end_date", params.end_date);
      }
      const { data } = await api.get(`/admin/analytics/security?${q.toString()}`);
      return data;
    },
    staleTime: 15_000,
  });
}

export function useAdminSecurityAuditLogs(params: SecurityAuditLogsParams) {
  return useQuery<SecurityAuditLogsTableData>({
    queryKey: ["admin", "analytics", "security", "logs", params],
    queryFn: async () => {
      const q = new URLSearchParams();
      if (params.range) q.set("range", params.range);
      if (params.start_date) q.set("start_date", params.start_date);
      if (params.end_date) q.set("end_date", params.end_date);
      if (params.actor) q.set("actor", params.actor);
      if (params.action && params.action !== "all") q.set("action", params.action);
      if (params.outcome && params.outcome !== "all") q.set("outcome", params.outcome);
      if (params.severity && params.severity !== "all") q.set("severity", params.severity);
      if (params.search) q.set("search", params.search);
      if (params.page) q.set("page", String(params.page));
      if (params.page_size) q.set("page_size", String(params.page_size));
      const { data } = await api.get(`/admin/analytics/security/logs?${q.toString()}`);
      return data;
    },
    staleTime: 10_000,
  });
}





