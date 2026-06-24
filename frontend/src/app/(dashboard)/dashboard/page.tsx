"use client";

import { useAccounts } from "@/hooks/use-accounts";
import { useT } from "@/lib/i18n";
import {
  Smartphone,
  Send,
  AlertCircle,
  Plus,
  ExternalLink,
  Activity,
  Radio,
  BarChart3,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatsCardSkeleton, AccountRowSkeleton } from "@/components/ui/skeleton-cards";
import { AccountAvatar } from "@/components/accounts/account-avatar";

interface Account {
  id: string;
  phone: string;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  is_active: boolean;
  photo_version: number;
}

export default function DashboardPage() {
  const _ = useT();
  const { data: accountsData, isLoading } = useAccounts();
  const accounts = Array.isArray(accountsData) ? (accountsData as unknown as Account[]) : [];

  const activeCount = accounts?.filter((a) => a.is_active).length || 0;
  const totalCount = accounts?.length || 0;

  const stats = [
    {
      label: _("dashboard.totalAccounts"),
      value: totalCount,
      icon: Smartphone,
      gradient: "bg-primary",
      bgGlow: "bg-primary/10",
      description: _("dashboard.accountsConnected"),
      href: "/accounts",
    },
    {
      label: _("dashboard.activeAccounts"),
      value: activeCount,
      icon: Activity,
      gradient: "bg-primary",
      bgGlow: "bg-primary/10",
      description: _("dashboard.sessionsRunning"),
      href: "/accounts",
    },
    {
      label: _("dashboard.broadcast"),
      value: _("dashboard.newBroadcast"),
      icon: Send,
      gradient: "bg-primary",
      bgGlow: "bg-primary/10",
      description: _("dashboard.quickNewBroadcastDesc"),
      href: "/broadcast/new",
    },
    {
      label: _("dashboard.auditLog"),
      value: _("dashboard.viewLogs"),
      icon: BarChart3,
      gradient: "bg-primary",
      bgGlow: "bg-primary/10",
      description: _("dashboard.quickHistoryDesc"),
      href: "/broadcast/logs",
    },
  ];

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      {/* Hero Banner */}
      <div className="relative rounded-2xl bg-gradient-to-br from-slate-950 to-slate-900 p-6 sm:p-8 text-white">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-medium text-emerald-300 uppercase tracking-wider">
                {_("dashboard.systemOnline")}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight truncate">
              {_("dashboard.welcome")}
            </h1>
            <p className="text-white/60 text-sm mt-1 line-clamp-2">
              {_("dashboard.welcomeDesc")}
            </p>
          </div>
          <Link
            href="/accounts/add"
            className={cn(
              "inline-flex items-center gap-2 px-4 py-2.5 bg-white text-slate-900 rounded-xl text-sm font-semibold",
              "hover:bg-white/90 transition-all duration-200 shadow-lg shadow-black/20",
              "hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 flex-shrink-0 whitespace-nowrap"
            )}
          >
            <Plus className="h-4 w-4" /> {_("dashboard.addAccount")}
          </Link>
          </div>
        </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <StatsCardSkeleton key={i} />)
          : stats.map((stat) => (
          <Link key={stat.label} href={stat.href} className="block group">
            <Card className="h-full border-gray-200/80 bg-white hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 overflow-hidden">
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] sm:text-xs font-semibold text-gray-500 uppercase tracking-wider truncate mr-2">
                    {stat.label}
                  </span>
                  <div
                    className={cn(
                      "flex-shrink-0 p-2 rounded-xl text-white shadow-sm",
                      "group-hover:scale-110 transition-transform duration-300",
                      stat.gradient
                    )}
                  >
                    <stat.icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  </div>
                </div>
                <div className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-gray-900 tracking-tight truncate">
                  {stat.value}
                </div>
                <p className="text-[10px] sm:text-xs text-gray-500 mt-1.5 font-medium flex items-center gap-1 truncate">
                  <span className="truncate">{stat.description}</span>
                  <ExternalLink className="h-3 w-3 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {[
          {
            title: _("dashboard.quickNewBroadcast"),
            desc: _("dashboard.quickNewBroadcastDesc"),
            icon: Send,
            href: "/broadcast/new",
          },
          {
            title: _("dashboard.quickGroupLists"),
            desc: _("dashboard.quickGroupListsDesc"),
            icon: Radio,
            href: "/broadcast/group-lists",
          },
          {
            title: _("dashboard.quickHistory"),
            desc: _("dashboard.quickHistoryDesc"),
            icon: BarChart3,
            href: "/broadcast/history",
          },
        ].map((action) => (
          <Link key={action.title} href={action.href} className="block group">
            <div
              className={cn(
                "bg-white rounded-xl border border-gray-200/80 p-4 sm:p-5",
                "hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 relative"
              )}
            >
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 bg-primary p-2 rounded-xl text-white shadow-sm">
                  <action.icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold text-sm text-gray-900 truncate">{action.title}</h2>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">{action.desc}</p>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Accounts List */}
      <Card className="border-gray-200/80 shadow-sm bg-white overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between border-b border-gray-100 py-4 px-4 sm:px-6 gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base sm:text-lg font-bold text-gray-900 truncate">
              {_("dashboard.connectedAccounts")}
            </CardTitle>
            <CardDescription className="text-xs text-gray-500 mt-0.5 truncate">
              {_("dashboard.connectedAccountsDesc")}
            </CardDescription>
          </div>
          <Link
            href="/accounts/add"
            className="inline-flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 hover:underline font-semibold flex-shrink-0 whitespace-nowrap"
          >
            <Plus className="h-4 w-4" /> {_("dashboard.add")}
          </Link>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="divide-y divide-gray-100/80 p-4 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <AccountRowSkeleton key={i} />
              ))}
            </div>
          ) : accounts && accounts.length > 0 ? (
            <div className="divide-y divide-gray-100/80">
              {accounts.map((acc) => (
                <Link
                  key={acc.id}
                  href={`/accounts/${acc.id}`}
                  className="flex items-center gap-3 sm:gap-4 px-4 sm:px-6 py-3.5 hover:bg-gray-50/70 transition duration-200 min-w-0"
                >
                  <AccountAvatar
                    accountId={acc.id}
                    firstName={acc.first_name}
                    phone={acc.phone}
                    photoVersion={acc.photo_version}
                    size="lg"
                    className="border border-primary-100/50"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {acc.first_name || _("dashboard.unnamed")}{" "}
                      {acc.last_name || ""}
                    </p>
                    <p className="text-xs text-gray-500 truncate mt-0.5">
                      {acc.username ? `@${acc.username}` : acc.phone}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-semibold shadow-sm border flex-shrink-0 whitespace-nowrap",
                      acc.is_active
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200/60"
                        : "bg-gray-50 text-gray-500 border-gray-200/60"
                    )}
                  >
                    <span
                      className={cn(
                        "w-1.5 h-1.5 rounded-full flex-shrink-0",
                        acc.is_active ? "bg-emerald-500" : "bg-gray-400"
                      )}
                    />
                    {acc.is_active ? _("dashboard.online") : _("dashboard.offline")}
                  </Badge>
                </Link>
              ))}
            </div>
          ) : (
            <div className="p-8 sm:p-12 text-center max-w-md mx-auto">
              <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="h-8 w-8 text-gray-300" />
              </div>
              <h2 className="font-semibold text-gray-900 mb-1">{_("dashboard.noAccounts")}</h2>
              <p className="text-gray-500 text-sm mb-6 leading-relaxed">
                {_("dashboard.noAccountsDesc")}
              </p>
              <Link
                href="/accounts/add"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-semibold hover:bg-primary-700 transition shadow-sm hover:shadow-md active:shadow-sm"
              >
                <Plus className="h-4 w-4" /> {_("dashboard.addFirstAccount")}
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
