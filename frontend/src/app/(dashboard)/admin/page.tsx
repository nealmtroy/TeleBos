"use client";

import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import { useAdminStats } from "@/hooks/use-admin";
import { useAdminSmmStats, useAdminSmmProfile } from "@/hooks/use-admin-smm";
import {
  Shield, AlertCircle, Users, Send, UserPlus, Radio,
  Zap, Star, Crown, BarChart3, Package, ShoppingCart, DollarSign, Settings,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
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
            title="SMM settings"
            desc="Configure pricing markup, default pricing, and marketplace settings."
            href="/admin/smm"
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
