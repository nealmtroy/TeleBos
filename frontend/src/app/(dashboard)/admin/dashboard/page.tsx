"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import { useAdminStats } from "@/hooks/use-admin";
import { useAdminSmmStats, useAdminSmmProfile } from "@/hooks/use-admin-smm";
import {
  Shield,
  ShieldAlert,
  Users,
  Radio,
  UserPlus,
  Send,
  Package,
  ShoppingCart,
  DollarSign,
  Wallet,
  Ticket,
  Tag,
  LifeBuoy,
  Settings,
  RefreshCw,
  ArrowUpRight,
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Bot,
  Sliders,
  Clock,
  Layers,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export default function AdminDashboardPage() {
  const _ = useT();
  const currentUser = useAuthStore((s) => s.user);

  // Role Guard: Only owner can access
  if (currentUser?.role !== "owner") {
    return (
      <div className="flex items-center justify-center min-h-[60vh] p-4">
        <div className="w-full max-w-md p-8 text-center bg-card border border-border rounded-2xl shadow-sm space-y-4">
          <div className="inline-flex p-3 rounded-2xl bg-destructive/10 text-destructive mb-2">
            <ShieldAlert className="h-10 w-10" />
          </div>
          <h2 className="text-xl font-bold text-foreground">
            {_("admin.accessDenied") || "Access Denied"}
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {_("admin.accessDeniedDesc") ||
              "Only users with the Owner role are authorized to access the Admin Panel."}
          </p>
          <div className="pt-2">
            <Button asChild variant="outline" className="w-full">
              <Link href="/dashboard">
                {_("admin.backToDashboard") || "Return to Dashboard"}
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return <DashboardContent />;
}

function DashboardContent() {
  const _ = useT();
  const {
    data: stats,
    isLoading: isStatsLoading,
    error: statsError,
    refetch: refetchStats,
    isFetching: isStatsFetching,
  } = useAdminStats();

  const {
    data: smmStats,
    isLoading: isSmmStatsLoading,
    refetch: refetchSmmStats,
    isFetching: isSmmStatsFetching,
  } = useAdminSmmStats();

  const {
    data: smmProfile,
    isLoading: isSmmProfileLoading,
    refetch: refetchSmmProfile,
    isFetching: isSmmProfileFetching,
  } = useAdminSmmProfile();

  const isRefreshing = isStatsFetching || isSmmStatsFetching || isSmmProfileFetching;
  const isLoading = isStatsLoading || isSmmStatsLoading || isSmmProfileLoading;

  const handleRefresh = () => {
    refetchStats();
    refetchSmmStats();
    refetchSmmProfile();
  };

  // Calculations for visual health bars
  const accountBreakdown = useMemo(() => {
    const total = stats?.total_accounts_connected ?? 0;
    if (total === 0) {
      return { activePct: 0, sellingPct: 0, expiredPct: 0, limitedPct: 0 };
    }
    const active = stats?.accounts_active ?? 0;
    const selling = stats?.accounts_selling ?? 0;
    const expired = stats?.accounts_expired ?? 0;
    const limited = stats?.accounts_limited ?? 0;
    return {
      activePct: Math.round((active / total) * 100),
      sellingPct: Math.round((selling / total) * 100),
      expiredPct: Math.round((expired / total) * 100),
      limitedPct: Math.round((limited / total) * 100),
    };
  }, [stats]);

  const userBreakdown = useMemo(() => {
    const total = stats?.total_users ?? 0;
    if (total === 0) {
      return { basicPct: 0, proPct: 0, premiumPct: 0, ownerPct: 0 };
    }
    const basic = stats?.total_basic_users ?? 0;
    const pro = stats?.total_pro_users ?? 0;
    const premium = stats?.total_premium_users ?? 0;
    const owner = stats?.total_owner_users ?? 0;
    return {
      basicPct: Math.round((basic / total) * 100),
      proPct: Math.round((pro / total) * 100),
      premiumPct: Math.round((premium / total) * 100),
      ownerPct: Math.round((owner / total) * 100),
    };
  }, [stats]);

  return (
    <div className="space-y-8 pb-12">
      {/* ── Page Header ────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {_("admin.systemOperational") || "System Operational"}
            </span>
            <Badge variant="outline" className="text-xs font-normal">
              Owner Console
            </Badge>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">
            {_("admin.dashboard") || "Admin Dashboard"}
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            {_("admin.dashboardDesc") ||
              "Platform health, infrastructure metrics, and owner control center."}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="h-9 px-3 gap-2"
          >
            <RefreshCw
              className={cn("h-4 w-4 text-muted-foreground", isRefreshing && "animate-spin")}
            />
            <span className="text-xs font-medium">
              {_("admin.refreshData") || "Refresh Data"}
            </span>
          </Button>
          <Button asChild size="sm" className="h-9 px-3 gap-2">
            <Link href="/admin/users">
              <Users className="h-4 w-4" />
              <span className="text-xs font-medium">{_("admin.users") || "Users"}</span>
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="h-9 px-3 gap-2">
            <Link href="/admin/settings">
              <Settings className="h-4 w-4" />
              <span className="text-xs font-medium">
                {_("admin.systemConfig") || "Config"}
              </span>
            </Link>
          </Button>
        </div>
      </div>

      {/* ── Error Banner ───────────────────────────────────────────────────── */}
      {statsError && (
        <div className="flex items-center justify-between p-4 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-sm">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <span>Failed to load platform telemetry and statistics.</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            className="border-destructive/30 hover:bg-destructive/20 h-8"
          >
            Retry
          </Button>
        </div>
      )}

      {/* ── 1. Core Platform Statistics ────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold text-foreground tracking-tight">
              {_("admin.platformOverview") || "Platform Overview"}
            </h2>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-40 bg-muted/60 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {/* Total Users */}
            <StatCard
              icon={Users}
              label={_("admin.totalUsers") || "Total Users"}
              value={stats?.total_users ?? 0}
              color="blue"
              href="/admin/users"
              breakdown={[
                {
                  label: "Basic",
                  value: stats?.total_basic_users ?? 0,
                  color: "bg-muted text-muted-foreground border-border",
                },
                {
                  label: "Pro",
                  value: stats?.total_pro_users ?? 0,
                  color: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
                },
                {
                  label: "Premium",
                  value: stats?.total_premium_users ?? 0,
                  color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
                },
                {
                  label: "Owner",
                  value: stats?.total_owner_users ?? 0,
                  color: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
                },
              ]}
            />

            {/* Connected Accounts */}
            <StatCard
              icon={Radio}
              label={_("admin.totalAccountsConnected") || "Connected Accounts"}
              value={stats?.total_accounts_connected ?? 0}
              color="emerald"
              href="/accounts"
              breakdown={[
                {
                  label: _("admin.activeAccounts") || "Active",
                  value: stats?.accounts_active ?? 0,
                  color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
                },
                {
                  label: _("admin.sellingAccounts") || "Selling",
                  value: stats?.accounts_selling ?? 0,
                  color: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
                },
                {
                  label: _("admin.expiredAccounts") || "Expired",
                  value: stats?.accounts_expired ?? 0,
                  color: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
                },
                ...(stats?.accounts_limited
                  ? [
                      {
                        label: _("admin.limitedAccounts") || "Limited",
                        value: stats.accounts_limited,
                        color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
                      },
                    ]
                  : []),
              ]}
            />

            {/* Broadcast Jobs */}
            <StatCard
              icon={Send}
              label={_("admin.totalBroadcastJobs") || "Broadcast Jobs"}
              value={stats?.total_broadcast_jobs ?? 0}
              color="indigo"
              href="/admin/broadcasts"
              breakdown={[
                {
                  label: "Running",
                  value: stats?.broadcast_running ?? 0,
                  color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
                },
                {
                  label: "Stopped",
                  value: stats?.broadcast_stopped ?? 0,
                  color: "bg-muted text-muted-foreground border-border",
                },
              ]}
            />

            {/* Auto-Reply Jobs */}
            <StatCard
              icon={Bot}
              label={_("admin.totalAutoReplyJobs") || "Auto-Reply Jobs"}
              value={stats?.total_auto_reply_jobs ?? 0}
              color="blue"
              href="/admin/auto-replies"
              breakdown={[
                {
                  label: "Running",
                  value: stats?.auto_reply_running ?? 0,
                  color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
                },
                {
                  label: "Stopped",
                  value: stats?.auto_reply_stopped ?? 0,
                  color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
                },
                {
                  label: "Sent",
                  value: stats?.total_auto_reply_sent ?? 0,
                  color: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
                },
              ]}
            />

            {/* Invite Jobs */}
            <StatCard
              icon={UserPlus}
              label={_("admin.totalInviteJobs") || "Invite Jobs"}
              value={stats?.total_invite_jobs ?? 0}
              color="blue"
              href="/invite/logs"
              breakdown={[
                {
                  label: "Running",
                  value: stats?.invite_running ?? 0,
                  color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
                },
                {
                  label: "Stopped",
                  value: stats?.invite_stopped ?? 0,
                  color: "bg-muted text-muted-foreground border-border",
                },
              ]}
            />
          </div>
        )}
      </section>

      {/* ── 2. SMM Provider & Marketplace Operations ───────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold text-foreground tracking-tight">
              {_("admin.smmProviderStatus") || "SMM Provider Status"}
            </h2>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-36 bg-muted/60 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* SMM Provider Balance */}
            <StatCard
              icon={DollarSign}
              label="SMM Provider Balance"
              value={
                smmProfile?.balance
                  ? smmProfile.balance.startsWith("Rp")
                    ? smmProfile.balance
                    : `Rp ${Number(smmProfile.balance).toLocaleString("id-ID")}`
                  : "Rp 0"
              }
              color="amber"
              href="/admin/smm/settings"
              breakdown={[
                {
                  label: "SID",
                  value: smmProfile?.sid || "BuzzerPanel",
                  color: "bg-muted text-muted-foreground border-border",
                },
                {
                  label: "Currency",
                  value: smmProfile?.currency || "IDR",
                  color: "bg-muted text-muted-foreground border-border",
                },
              ]}
            />

            {/* SMM Services */}
            <StatCard
              icon={Package}
              label="SMM Services"
              value={smmStats?.total_services ?? 0}
              color="blue"
              href="/admin/smm/services"
              breakdown={[
                {
                  label: "Active",
                  value: smmStats?.active_services ?? 0,
                  color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
                },
              ]}
            />

            {/* SMM Orders */}
            <StatCard
              icon={ShoppingCart}
              label="SMM Orders"
              value={smmStats?.total_orders ?? 0}
              color="indigo"
              href="/admin/smm/orders"
              breakdown={[
                {
                  label: "Pending",
                  value: smmStats?.pending_orders ?? 0,
                  color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
                },
              ]}
            />

            {/* SMM Revenue */}
            <StatCard
              icon={Wallet}
              label="SMM Platform Revenue"
              value={`Rp ${(smmStats?.total_revenue ?? 0).toLocaleString("id-ID")}`}
              color="emerald"
              href="/admin/transactions"
              breakdown={[
                {
                  label: "Buyers",
                  value: smmStats?.total_users_with_orders ?? 0,
                  color: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
                },
              ]}
            />
          </div>
        )}
      </section>

      {/* ── 3. Health & Distribution Visuals ───────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold text-foreground tracking-tight">
            {_("admin.healthAndDistribution") || "System Health & Distribution"}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Account Distribution */}
          <Card className="border border-border bg-card">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-foreground">
                  {_("admin.accountDistribution") || "Account Status Breakdown"}
                </CardTitle>
                <span className="text-xs text-muted-foreground font-mono">
                  {stats?.total_accounts_connected ?? 0} Total
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Progress Bar */}
              <div className="h-3 w-full bg-muted rounded-full overflow-hidden flex">
                <div
                  style={{ width: `${accountBreakdown.activePct}%` }}
                  className="bg-emerald-500 transition-all duration-300"
                  title={`Active: ${accountBreakdown.activePct}%`}
                />
                <div
                  style={{ width: `${accountBreakdown.sellingPct}%` }}
                  className="bg-blue-500 transition-all duration-300"
                  title={`In Marketplace: ${accountBreakdown.sellingPct}%`}
                />
                <div
                  style={{ width: `${accountBreakdown.expiredPct}%` }}
                  className="bg-rose-500 transition-all duration-300"
                  title={`Expired: ${accountBreakdown.expiredPct}%`}
                />
                <div
                  style={{ width: `${accountBreakdown.limitedPct}%` }}
                  className="bg-amber-500 transition-all duration-300"
                  title={`Limited: ${accountBreakdown.limitedPct}%`}
                />
              </div>

              {/* Legend Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shrink-0" />
                  <span className="text-muted-foreground truncate">Active:</span>
                  <span className="font-semibold text-foreground">
                    {stats?.accounts_active ?? 0}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-blue-500 shrink-0" />
                  <span className="text-muted-foreground truncate">Selling:</span>
                  <span className="font-semibold text-foreground">
                    {stats?.accounts_selling ?? 0}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-500 shrink-0" />
                  <span className="text-muted-foreground truncate">Expired:</span>
                  <span className="font-semibold text-foreground">
                    {stats?.accounts_expired ?? 0}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-500 shrink-0" />
                  <span className="text-muted-foreground truncate">Limited:</span>
                  <span className="font-semibold text-foreground">
                    {stats?.accounts_limited ?? 0}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* User Plan Distribution */}
          <Card className="border border-border bg-card">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-foreground">
                  {_("admin.userDistribution") || "User Plan Distribution"}
                </CardTitle>
                <span className="text-xs text-muted-foreground font-mono">
                  {stats?.total_users ?? 0} Total
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Progress Bar */}
              <div className="h-3 w-full bg-muted rounded-full overflow-hidden flex">
                <div
                  style={{ width: `${userBreakdown.basicPct}%` }}
                  className="bg-slate-400 dark:bg-slate-600 transition-all duration-300"
                  title={`Basic: ${userBreakdown.basicPct}%`}
                />
                <div
                  style={{ width: `${userBreakdown.proPct}%` }}
                  className="bg-blue-500 transition-all duration-300"
                  title={`Pro: ${userBreakdown.proPct}%`}
                />
                <div
                  style={{ width: `${userBreakdown.premiumPct}%` }}
                  className="bg-amber-500 transition-all duration-300"
                  title={`Premium: ${userBreakdown.premiumPct}%`}
                />
                <div
                  style={{ width: `${userBreakdown.ownerPct}%` }}
                  className="bg-purple-500 transition-all duration-300"
                  title={`Owner: ${userBreakdown.ownerPct}%`}
                />
              </div>

              {/* Legend Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-400 dark:bg-slate-600 shrink-0" />
                  <span className="text-muted-foreground truncate">Basic:</span>
                  <span className="font-semibold text-foreground">
                    {stats?.total_basic_users ?? 0}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-blue-500 shrink-0" />
                  <span className="text-muted-foreground truncate">Pro:</span>
                  <span className="font-semibold text-foreground">
                    {stats?.total_pro_users ?? 0}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-500 shrink-0" />
                  <span className="text-muted-foreground truncate">Premium:</span>
                  <span className="font-semibold text-foreground">
                    {stats?.total_premium_users ?? 0}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-purple-500 shrink-0" />
                  <span className="text-muted-foreground truncate">Owner:</span>
                  <span className="font-semibold text-foreground">
                    {stats?.total_owner_users ?? 0}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ── 4. Owner Action Control Deck ───────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sliders className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold text-foreground tracking-tight">
              {_("admin.controlDeck") || "Owner Action Control Deck"}
            </h2>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <QuickLinkCard
            title="User Management"
            desc="Configure accounts, roles, balance deposits, and suspensions."
            href="/admin/users"
            icon={Users}
          />
          <QuickLinkCard
            title="Broadcast Management"
            desc="Monitor broadcast jobs, workers, queues, and bulk control."
            href="/admin/broadcasts"
            icon={Radio}
          />
          <QuickLinkCard
            title="Auto-Reply Management"
            desc="Configure keyword triggers and auto-responder bots across accounts."
            href="/admin/auto-replies"
            icon={Bot}
          />
          <QuickLinkCard
            title="SMM Services Catalog"
            desc="Activate services, calibrate pricing markup, and inspect sync."
            href="/admin/smm/services"
            icon={Package}
          />
          <QuickLinkCard
            title="SMM Orders Monitor"
            desc="Track order fulfillments, status changes, and provider callbacks."
            href="/admin/smm/orders"
            icon={ShoppingCart}
          />
          <QuickLinkCard
            title="SMM Settings & Markup"
            desc="Configure profit margins, account pricing rules, and watermarks."
            href="/admin/smm/settings"
            icon={Sliders}
          />
          <QuickLinkCard
            title="ID Prefix Prices"
            desc="Set customized price tiers based on Telegram phone prefixes."
            href="/admin/account-prices"
            icon={Tag}
          />
          <QuickLinkCard
            title="Redeem Codes"
            desc="Generate subscription vouchers and monitor redeem allocations."
            href="/admin/redeem-codes"
            icon={Ticket}
          />
          <QuickLinkCard
            title="Redeem Logs"
            desc="Audit activation histories, redeemed timestamps, and users."
            href="/admin/redeem-logs"
            icon={Clock}
          />
          <QuickLinkCard
            title="Financial Transactions"
            desc="Audit wallet top-up requests, balance ledger, and payouts."
            href="/admin/transactions"
            icon={Wallet}
          />
          <QuickLinkCard
            title="Support Tickets"
            desc="Review customer assistance inquiries and resolution tickets."
            href="/admin/tickets"
            icon={LifeBuoy}
          />
          <QuickLinkCard
            title="System Configuration"
            desc="Platform environment parameters, maintenance, and security."
            href="/admin/settings"
            icon={Settings}
          />
        </div>
      </section>
    </div>
  );
}

// ── Shared Stat Card Component ───────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  color,
  breakdown,
  prefix = "",
  href,
}: {
  icon: any;
  label: string;
  value: string | number;
  color: "blue" | "emerald" | "amber" | "indigo" | "rose";
  breakdown?: Array<{ label: string; value: number | string; color?: string }>;
  prefix?: string;
  href?: string;
}) {
  const router = useRouter();

  const colorIconMap = {
    blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    indigo: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
    rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  };

  return (
    <Card
      onClick={() => href && router.push(href)}
      className={cn(
        "bg-card text-card-foreground border border-border flex flex-col justify-between transition-all duration-200",
        href && "cursor-pointer hover:border-primary/50 hover:shadow-sm active:scale-[0.99]"
      )}
    >
      <CardContent className="p-4 flex flex-col justify-between h-full flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider truncate">
              {label}
            </p>
            <p className="text-2xl lg:text-3xl font-extrabold text-foreground tracking-tight truncate">
              {prefix}
              {typeof value === "number" ? value.toLocaleString() : value}
            </p>
          </div>
          <div className={cn("p-2.5 rounded-xl shrink-0", colorIconMap[color])}>
            <Icon className="h-5 w-5" />
          </div>
        </div>

        {breakdown && breakdown.length > 0 && (
          <div className="border-t border-border/60 pt-3 mt-3.5">
            <div className="flex flex-wrap gap-1.5">
              {breakdown.map((item, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium border transition",
                    item.color || "bg-muted text-muted-foreground border-border"
                  )}
                >
                  <span className="opacity-80 font-normal">{item.label}:</span>
                  <span className="font-semibold">
                    {typeof item.value === "number" ? item.value.toLocaleString() : item.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Quick Link Card Component ───────────────────────────────────────────────

function QuickLinkCard({
  title,
  desc,
  href,
  icon: Icon,
}: {
  title: string;
  desc: string;
  href: string;
  icon: any;
}) {
  const router = useRouter();

  return (
    <Card
      onClick={() => router.push(href)}
      className="group cursor-pointer bg-card text-card-foreground border border-border transition-all duration-200 hover:border-primary/50 hover:bg-muted/30 active:scale-[0.99]"
    >
      <CardContent className="p-4 flex items-start gap-3.5">
        <div className="p-2.5 rounded-xl bg-muted/60 text-foreground group-hover:text-primary group-hover:bg-primary/10 transition-colors shrink-0 border border-border/50">
          <Icon className="h-5 w-5" />
        </div>
        <div className="space-y-1 text-left min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1">
            <h4 className="font-semibold text-foreground text-sm truncate group-hover:text-primary transition-colors">
              {title}
            </h4>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/60 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all shrink-0" />
          </div>
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed font-normal">
            {desc}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
