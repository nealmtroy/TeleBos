"use client";

import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import { useAdminStats } from "@/hooks/use-admin";
import {
  Shield, AlertCircle, Users, Send, UserPlus, Radio,
  Zap, Star, Crown, BarChart3,
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

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 bg-gray-100 rounded-xl animate-pulse" />
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
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Users}
          label={_("admin.totalUsers")}
          value={stats?.total_users ?? 0}
          color="blue"
        />
        <StatCard
          icon={Send}
          label={_("admin.totalBroadcastJobs")}
          value={stats?.total_broadcast_jobs ?? 0}
          color="indigo"
        />
        <StatCard
          icon={UserPlus}
          label={_("admin.totalInviteJobs")}
          value={stats?.total_invite_jobs ?? 0}
          color="purple"
        />
        <StatCard
          icon={Radio}
          label={_("admin.totalAccountsConnected")}
          value={stats?.total_accounts_connected ?? 0}
          color="emerald"
        />
      </div>

      {/* Role Breakdown */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Users by Role</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <RoleCard icon={Zap} label="Basic" value={stats?.total_basic_users ?? 0} color="gray" />
          <RoleCard icon={Star} label="Pro" value={stats?.total_pro_users ?? 0} color="blue" />
          <RoleCard icon={Crown} label="Premium" value={stats?.total_premium_users ?? 0} color="amber" />
          <RoleCard icon={Shield} label="Owner" value={stats?.total_owner_users ?? 0} color="purple" />
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
}: {
  icon: any;
  label: string;
  value: string | number;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    blue: "bg-blue-50 text-blue-600",
    indigo: "bg-indigo-50 text-indigo-600",
    purple: "bg-purple-50 text-purple-600",
    emerald: "bg-emerald-50 text-emerald-600",
  };

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-gray-500">{label}</p>
            <p className="text-2xl font-bold mt-1">
              {typeof value === "number" ? value.toLocaleString() : value}
            </p>
          </div>
          <div className={cn("p-2.5 rounded-lg", colorMap[color] || colorMap.blue)}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function RoleCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: any;
  label: string;
  value: string | number;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    gray: "bg-gray-100 text-gray-600 border-gray-200",
    blue: "bg-blue-50 text-blue-600 border-blue-200",
    amber: "bg-amber-50 text-amber-600 border-amber-200",
    purple: "bg-purple-50 text-purple-600 border-purple-200",
  };

  return (
    <div className={cn("flex items-center gap-3 p-3 rounded-xl border", colorMap[color] || colorMap.gray)}>
      <div className="p-2 rounded-lg bg-white/60">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-xs font-medium opacity-75">{label}</p>
        <p className="text-lg font-bold">{typeof value === "number" ? value.toLocaleString() : value}</p>
      </div>
    </div>
  );
}
