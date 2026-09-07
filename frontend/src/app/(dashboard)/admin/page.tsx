"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import {
  useAdminStats,
  useAdminAutoReplies,
  useAdminToggleAutoReply,
  AdminAutoReplyItem,
} from "@/hooks/use-admin";
import { useAdminSmmStats, useAdminSmmProfile } from "@/hooks/use-admin-smm";
import {
  Shield,
  AlertCircle,
  Users,
  Send,
  UserPlus,
  Radio,
  Star,
  BarChart3,
  Package,
  ShoppingCart,
  DollarSign,
  Settings,
  MessageCircleReply,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Copy,
  Check,
  Power,
  Loader2,
  Bot,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn, formatDate, formatRelative } from "@/lib/utils";

export default function AdminOverviewPage() {
  const _ = useT();
  const currentUser = useAuthStore((s) => s.user);

  if (currentUser?.role !== "owner") {
    return (
      <div className="text-center py-16">
        <Shield className="h-16 w-16 mx-auto mb-4 text-gray-300" />
        <h3 className="font-semibold text-gray-900 mb-1">Access Denied</h3>
        <p className="text-sm text-gray-500">Only owners can access the admin panel.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{_("admin.title")}</h1>
        <p className="text-gray-500 mt-1">{_("admin.desc")}</p>
      </div>
      <OverviewContent />
    </div>
  );
}

function OverviewContent() {
  const _ = useT();
  const { data: stats, isLoading, error } = useAdminStats();
  const { data: smmStats } = useAdminSmmStats();
  const { data: smmProfile } = useAdminSmmProfile();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-40 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
        <AlertCircle className="h-5 w-5" />
        <p className="text-sm">Failed to load statistics</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Platform Stats Grid */}
      <div className="space-y-3.5">
        <h3 className="text-sm font-bold text-gray-700 tracking-wide uppercase">Platform Overview</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          <StatCard
            icon={Users}
            label={_("admin.totalUsers")}
            value={stats?.total_users ?? 0}
            color="blue"
            breakdown={[
              { label: "Basic", value: stats?.total_basic_users ?? 0, color: "bg-gray-50 text-gray-700 border-gray-100" },
              { label: "Pro", value: stats?.total_pro_users ?? 0, color: "bg-blue-50 text-blue-700 border-blue-100" },
              { label: "Premium", value: stats?.total_premium_users ?? 0, color: "bg-amber-50 text-amber-700 border-amber-100" },
              { label: "Owner", value: stats?.total_owner_users ?? 0, color: "bg-purple-50 text-purple-700 border-purple-100" },
            ]}
          />
          <StatCard
            icon={Radio}
            label={_("admin.totalAccountsConnected") || "Connected Accounts"}
            value={stats?.total_accounts_connected ?? 0}
            color="emerald"
            breakdown={[
              { label: "Active", value: stats?.accounts_active ?? 0, color: "bg-emerald-50 text-emerald-700 border-emerald-100" },
              { label: "Selling", value: stats?.accounts_selling ?? 0, color: "bg-blue-50 text-blue-700 border-blue-100" },
              { label: "Expired", value: stats?.accounts_expired ?? 0, color: "bg-red-50 text-red-700 border-red-100" },
            ]}
          />
          <StatCard
            icon={Send}
            label={_("admin.totalBroadcastJobs")}
            value={stats?.total_broadcast_jobs ?? 0}
            color="indigo"
            breakdown={[
              { label: "Running", value: stats?.broadcast_running ?? 0, color: "bg-blue-50 text-blue-700 border-blue-100" },
              { label: "Stopped", value: stats?.broadcast_stopped ?? 0, color: "bg-gray-50 text-gray-700 border-gray-100" },
            ]}
          />
          <StatCard
            icon={UserPlus}
            label={_("admin.totalInviteJobs")}
            value={stats?.total_invite_jobs ?? 0}
            color="purple"
            breakdown={[
              { label: "Running", value: stats?.invite_running ?? 0, color: "bg-blue-50 text-blue-700 border-blue-100" },
              { label: "Stopped", value: stats?.invite_stopped ?? 0, color: "bg-gray-50 text-gray-700 border-gray-100" },
            ]}
          />
          <StatCard
            icon={MessageCircleReply}
            label={_("admin.totalAutoReplyJobs") || "Auto-Reply Jobs"}
            value={stats?.total_auto_reply_jobs ?? 0}
            color="teal"
            breakdown={[
              { label: "Running", value: stats?.auto_reply_running ?? 0, color: "bg-emerald-50 text-emerald-700 border-emerald-100" },
              { label: "Stopped", value: stats?.auto_reply_stopped ?? 0, color: "bg-amber-50 text-amber-700 border-amber-100" },
              { label: "Sent", value: stats?.total_auto_reply_sent ?? 0, color: "bg-blue-50 text-blue-700 border-blue-100" },
            ]}
          />
        </div>
      </div>

      {/* SMM Provider Status Grid */}
      <div className="space-y-3.5">
        <h3 className="text-sm font-bold text-gray-700 tracking-wide uppercase">SMM Provider Status</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <StatCard
            icon={Package}
            label="SMM Services"
            value={smmStats?.total_services ?? 0}
            color="blue"
            breakdown={[
              { label: "Active", value: smmStats?.active_services ?? 0, color: "bg-green-50 text-green-700 border-green-100" },
            ]}
          />
          <StatCard
            icon={ShoppingCart}
            label="SMM Orders"
            value={smmStats?.total_orders ?? 0}
            color="indigo"
            breakdown={[
              { label: "Pending", value: smmStats?.pending_orders ?? 0, color: "bg-yellow-50 text-yellow-700 border-yellow-100 animate-pulse" },
            ]}
          />
          <StatCard
            icon={DollarSign}
            label="SMM Revenue"
            value={smmStats?.total_revenue ?? 0}
            color="emerald"
            prefix="Rp "
          />
          {smmProfile?.balance && (
            <StatCard
              icon={DollarSign}
              label="SMM Provider Balance"
              value={smmProfile.balance}
              color="amber"
            />
          )}
        </div>
      </div>

      {/* Auto-Reply Jobs Live Monitor */}
      <AutoReplyJobsMonitor />

      {/* Admin Quick Action Panel */}
      <div className="space-y-3.5">
        <h3 className="text-sm font-bold text-gray-700 tracking-wide uppercase">Owner Action Control Deck</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <QuickLinkCard
            title="User Management"
            desc="Configure user accounts, roles, balances, and permissions."
            href="/admin/users"
            icon={Users}
            color="blue"
          />
          <QuickLinkCard
            title="Auto-Reply System"
            desc="Configure and monitor greetings, reply templates, and automated bot accounts."
            href="/auto-reply"
            icon={MessageCircleReply}
            color="teal"
          />
          <QuickLinkCard
            title="Broadcast Management"
            desc="Monitor broadcast jobs, looping engines, duplicate accounts, and logs."
            href="/admin/broadcasts"
            icon={Radio}
            color="indigo"
          />
          <QuickLinkCard
            title="SMM settings"
            desc="Configure pricing markup, default pricing, and marketplace settings."
            href="/admin/smm/settings"
            icon={Settings}
            color="purple"
          />
          <QuickLinkCard
            title="SMM Services"
            desc="Active, disable, or adjust pricing markup for SMM services."
            href="/admin/smm/services"
            icon={Package}
            color="blue"
          />
          <QuickLinkCard
            title="SMM Orders"
            desc="Monitor SMM orders, status histories, and refresh updates."
            href="/admin/smm/orders"
            icon={ShoppingCart}
            color="indigo"
          />
          <QuickLinkCard
            title="ID Prefix Prices"
            desc="Set customized price tiers based on Telegram ID prefixes."
            href="/admin/account-prices"
            icon={BarChart3}
            color="indigo"
          />
          <QuickLinkCard
            title="Redeem Codes"
            desc="Create subscription vouchers and monitor redeem logs."
            href="/admin/redeem-codes"
            icon={Star}
            color="amber"
          />
        </div>
      </div>
    </div>
  );
}

// ── Auto-Reply Jobs Monitor ──────────────────────────────────────────────────

function AutoReplyJobsMonitor() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "running" | "stopped">("all");
  const [page, setPage] = useState(1);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading, isFetching, refetch } = useAdminAutoReplies({
    search: debouncedSearch,
    status: statusFilter,
    page,
    limit: 10,
  });

  const toggleMutation = useAdminToggleAutoReply();

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / 10)) : 1;

  return (
    <div className="space-y-3.5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h3 className="text-sm font-bold text-gray-700 tracking-wide uppercase">Auto-Reply Jobs Monitor</h3>
            {data && (
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1 animate-pulse" />
                  {data.running_count} Running
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-700 border border-gray-200">
                  {data.stopped_count} Stopped
                </span>
              </div>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            Real-time status of automated auto-reply bot responders across accounts
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search phone, user, or text..."
              className="pl-8 h-8 text-xs bg-white"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-8 px-2.5 text-xs text-gray-600 hover:text-gray-900 shrink-0"
            title="Refresh jobs"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin text-teal-600")} />
          </Button>
          <Link href="/auto-reply">
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2.5 text-xs text-teal-700 border-teal-200 bg-teal-50/50 hover:bg-teal-100 hover:text-teal-800 shrink-0 flex items-center gap-1"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>Manage</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            setStatusFilter("all");
            setPage(1);
          }}
          className={cn(
            "px-3 py-1 rounded-lg text-xs font-semibold transition border",
            statusFilter === "all"
              ? "bg-teal-600 text-white border-teal-600 shadow-sm"
              : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
          )}
        >
          All Configured ({data?.total ?? 0})
        </button>
        <button
          onClick={() => {
            setStatusFilter("running");
            setPage(1);
          }}
          className={cn(
            "px-3 py-1 rounded-lg text-xs font-semibold transition border flex items-center gap-1.5",
            statusFilter === "running"
              ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
              : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
          )}
        >
          <span className={cn("w-2 h-2 rounded-full", statusFilter === "running" ? "bg-white" : "bg-emerald-500")} />
          Running ({data?.running_count ?? 0})
        </button>
        <button
          onClick={() => {
            setStatusFilter("stopped");
            setPage(1);
          }}
          className={cn(
            "px-3 py-1 rounded-lg text-xs font-semibold transition border flex items-center gap-1.5",
            statusFilter === "stopped"
              ? "bg-rose-600 text-white border-rose-600 shadow-sm"
              : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
          )}
        >
          <span className={cn("w-2 h-2 rounded-full", statusFilter === "stopped" ? "bg-white" : "bg-rose-500")} />
          Stopped ({data?.stopped_count ?? 0})
        </button>
      </div>

      {/* Table Card */}
      <Card className="border border-gray-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50/80 text-gray-500 font-semibold border-b border-gray-200 uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Account</th>
                <th className="py-3 px-4">Owner / User</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 min-w-[200px]">Auto-Reply Text</th>
                <th className="py-3 px-4 text-center">Replies Sent</th>
                <th className="py-3 px-4">Last Sent</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="py-3.5 px-4"><div className="h-4 bg-gray-100 rounded w-28" /></td>
                    <td className="py-3.5 px-4"><div className="h-4 bg-gray-100 rounded w-32" /></td>
                    <td className="py-3.5 px-4"><div className="h-5 bg-gray-100 rounded-full w-16" /></td>
                    <td className="py-3.5 px-4"><div className="h-4 bg-gray-100 rounded w-48" /></td>
                    <td className="py-3.5 px-4"><div className="h-4 bg-gray-100 rounded w-10 mx-auto" /></td>
                    <td className="py-3.5 px-4"><div className="h-4 bg-gray-100 rounded w-16" /></td>
                    <td className="py-3.5 px-4"><div className="h-6 bg-gray-100 rounded w-16 ml-auto" /></td>
                  </tr>
                ))
              ) : !data?.items || data.items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-400">
                    <Bot className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                    <p className="font-medium text-gray-600">No auto-reply jobs found</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {search ? "Try adjusting your search terms" : "Configure auto-reply messages in the Auto-Reply section"}
                    </p>
                  </td>
                </tr>
              ) : (
                data.items.map((item: AdminAutoReplyItem) => {
                  const isExpanded = expandedId === item.id;
                  const isRunning = item.status === "running";
                  const isStopped = item.status === "stopped";

                  return (
                    <tr key={item.id} className="hover:bg-gray-50/70 transition-colors">
                      {/* Account */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-teal-50 text-teal-700 flex items-center justify-center font-bold text-xs shrink-0 border border-teal-100">
                            {item.first_name ? item.first_name[0].toUpperCase() : "T"}
                          </div>
                          <div>
                            <div className="font-mono font-bold text-gray-900 text-xs tracking-tight">
                              {item.phone}
                            </div>
                            <div className="text-[11px] text-gray-500 truncate max-w-[140px]">
                              {[item.first_name, item.last_name].filter(Boolean).join(" ") || "No Name"}
                              {item.username && (
                                <span className="text-teal-600 font-medium ml-1">@{item.username}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Owner / User */}
                      <td className="py-3.5 px-4">
                        <div className="text-xs font-semibold text-gray-800 truncate max-w-[160px]">
                          {item.user_email || "Unknown User"}
                        </div>
                        {item.user_full_name && (
                          <div className="text-[11px] text-gray-400 truncate max-w-[160px]">
                            {item.user_full_name}
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        {isRunning ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Running
                          </span>
                        ) : isStopped ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                            Stopped
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-gray-50 text-gray-600 border border-gray-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                            Disabled
                          </span>
                        )}
                      </td>

                      {/* Message Preview */}
                      <td className="py-3.5 px-4">
                        {item.auto_reply_text ? (
                          <div className="space-y-1">
                            <div
                              onClick={() => setExpandedId(isExpanded ? null : item.id)}
                              className={cn(
                                "cursor-pointer p-2 rounded-md bg-gray-50 border border-gray-100 text-[11px] text-gray-700 leading-relaxed font-normal hover:bg-gray-100/70 transition",
                                !isExpanded && "line-clamp-2"
                              )}
                              title="Click to toggle full text"
                            >
                              "{item.auto_reply_text}"
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleCopy(item.id, item.auto_reply_text!)}
                                className="text-[10px] text-gray-400 hover:text-teal-600 flex items-center gap-0.5 transition"
                              >
                                {copiedId === item.id ? (
                                  <>
                                    <Check className="h-3 w-3 text-emerald-500" />
                                    <span className="text-emerald-600">Copied</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="h-3 w-3" />
                                    <span>Copy</span>
                                  </>
                                )}
                              </button>
                              {item.auto_reply_text.length > 80 && (
                                <button
                                  onClick={() => setExpandedId(isExpanded ? null : item.id)}
                                  className="text-[10px] text-teal-600 hover:underline"
                                >
                                  {isExpanded ? "Collapse" : "Show more"}
                                </button>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-gray-400 italic text-[11px]">No reply message configured</span>
                        )}
                      </td>

                      {/* Total Replies Sent */}
                      <td className="py-3.5 px-4 text-center">
                        <span className="inline-flex items-center gap-1 font-mono font-bold text-xs text-gray-900 bg-gray-100 px-2 py-0.5 rounded-md">
                          <MessageCircleReply className="h-3 w-3 text-teal-600" />
                          {item.total_replied.toLocaleString()}
                        </span>
                      </td>

                      {/* Last Sent */}
                      <td className="py-3.5 px-4 text-gray-500 whitespace-nowrap">
                        {item.last_replied_at ? (
                          <div className="flex items-center gap-1 text-[11px]">
                            <Clock className="h-3 w-3 text-gray-400" />
                            <span>{formatRelative(item.last_replied_at)}</span>
                          </div>
                        ) : (
                          <span className="text-gray-300 text-[11px]">—</span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={toggleMutation.isPending}
                            onClick={() => toggleMutation.mutate(item.id)}
                            className={cn(
                              "h-7 px-2 text-[11px] font-medium transition",
                              item.auto_reply_enabled
                                ? "text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                                : "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                            )}
                            title={item.auto_reply_enabled ? "Turn OFF Auto-Reply" : "Turn ON Auto-Reply"}
                          >
                            <Power className="h-3 w-3 mr-1" />
                            {item.auto_reply_enabled ? "Disable" : "Enable"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {data && data.total > 0 && (
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50/70 border-t border-gray-100 text-xs text-gray-500">
            <div>
              Showing <span className="font-semibold text-gray-800">{(page - 1) * 10 + 1}</span> to{" "}
              <span className="font-semibold text-gray-800">{Math.min(page * 10, data.total)}</span> of{" "}
              <span className="font-semibold text-gray-800">{data.total}</span> accounts
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || isFetching}
                className="h-7 w-7 p-0"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="px-2 font-medium text-gray-700">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || isFetching}
                className="h-7 w-7 p-0"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

// ── Shared Stat Card ─────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  color,
  breakdown,
  prefix = "",
}: {
  icon: any;
  label: string;
  value: string | number;
  color: string;
  breakdown?: Array<{ label: string; value: number | string; color?: string }>;
  prefix?: string;
}) {
  const colorMap: Record<string, string> = {
    blue: "bg-blue-50 text-blue-600",
    indigo: "bg-indigo-50 text-indigo-600",
    purple: "bg-purple-50 text-purple-600",
    emerald: "bg-emerald-50 text-emerald-600",
    teal: "bg-teal-50 text-teal-600",
    amber: "bg-amber-50 text-amber-600",
  };

  return (
    <Card className="hover:shadow-md transition-shadow duration-300 flex flex-col justify-between min-h-[175px] border border-gray-200">
      <CardContent className="p-5 flex flex-col justify-between h-full flex-1">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
            <p className="text-3xl font-extrabold text-gray-900 tracking-tight">
              {prefix}
              {typeof value === "number" ? value.toLocaleString() : value}
            </p>
          </div>
          <div className={cn("p-2.5 rounded-xl shrink-0", colorMap[color] || colorMap.blue)}>
            <Icon className="h-5 w-5" />
          </div>
        </div>

        {breakdown && breakdown.length > 0 && (
          <div className="border-t border-gray-100 pt-3.5 mt-4">
            <div className="flex flex-wrap gap-1.5">
              {breakdown.map((item, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold border transition",
                    item.color || "bg-gray-50 text-gray-600 border-gray-100 hover:bg-gray-50"
                  )}
                >
                  <span className="opacity-80 font-normal">{item.label}:</span>
                  <span>
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

// ── Quick Link Card ─────────────────────────────────────────────────────────

function QuickLinkCard({
  title,
  desc,
  href,
  icon: Icon,
  color,
}: {
  title: string;
  desc: string;
  href: string;
  icon: any;
  color: string;
}) {
  const router = useRouter();
  const colorMap: Record<string, string> = {
    blue: "hover:border-blue-400 hover:bg-blue-50/5 text-blue-600",
    indigo: "hover:border-indigo-400 hover:bg-indigo-50/5 text-indigo-600",
    purple: "hover:border-purple-400 hover:bg-purple-50/5 text-purple-600",
    amber: "hover:border-amber-400 hover:bg-amber-50/5 text-amber-600",
    teal: "hover:border-teal-400 hover:bg-teal-50/5 text-teal-600",
  };

  return (
    <Card
      onClick={() => router.push(href)}
      className={cn(
        "cursor-pointer border border-gray-200 transition-all duration-300 hover:shadow-sm active:scale-[0.99]",
        colorMap[color] || colorMap.blue
      )}
    >
      <CardContent className="p-5 flex items-start gap-4">
        <div className="p-3 rounded-xl bg-gray-50 text-current shrink-0 border border-gray-100">
          <Icon className="h-5 w-5" />
        </div>
        <div className="space-y-1 text-left min-w-0 flex-1">
          <h4 className="font-bold text-gray-900 text-sm truncate">{title}</h4>
          <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed font-normal">{desc}</p>
        </div>
      </CardContent>
    </Card>
  );
}
