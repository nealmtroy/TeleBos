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
      description: _("dashboard.accountsConnected"),
      href: "/accounts",
    },
    {
      label: _("dashboard.activeAccounts"),
      value: activeCount,
      icon: Activity,
      description: _("dashboard.sessionsRunning"),
      href: "/accounts",
    },
    {
      label: _("dashboard.broadcast"),
      value: _("dashboard.newBroadcast"),
      icon: Send,
      description: _("dashboard.quickNewBroadcastDesc"),
      href: "/broadcast/new",
    },
    {
      label: _("dashboard.auditLog"),
      value: _("dashboard.viewLogs"),
      icon: BarChart3,
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
            <div className="flex items-center gap-1.5 mb-2 text-blue-400">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              <span className="text-xs font-medium">
                {_("dashboard.systemOnline")}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight truncate">
              {_("dashboard.welcome")}
            </h1>
            <p className="text-white/60 text-sm mt-1 line-clamp-2 max-w-prose">
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
            <Card className="h-full bg-white hover:shadow-lg transition-all duration-200 overflow-hidden">
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-muted-foreground truncate mr-2">
                    {stat.label}
                  </span>
                  <div
                    className={cn(
                      "flex-shrink-0 p-2 rounded-xl text-primary bg-primary/10",
                      "group-hover:bg-primary group-hover:text-white transition-colors duration-200"
                    )}
                  >
                    <stat.icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  </div>
                </div>
                <div className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-foreground tracking-tight truncate">
                  {stat.value}
                </div>
                <p className="text-xs text-muted-foreground mt-1.5 font-medium flex items-center gap-1 truncate">
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
            <Card className="bg-white hover:shadow-lg transition-all duration-200">
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 p-2 rounded-xl text-primary bg-primary/10">
                    <action.icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-semibold text-sm text-foreground truncate">{action.title}</h2>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{action.desc}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Accounts List */}
      <Card className="bg-white overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between border-b border-foreground/10 py-4 px-4 sm:px-6 gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base sm:text-lg font-bold text-foreground truncate">
              {_("dashboard.connectedAccounts")}
            </CardTitle>
            <CardDescription className="text-xs mt-0.5 truncate">
              {_("dashboard.connectedAccountsDesc")}
            </CardDescription>
          </div>
          <Link
            href="/accounts/add"
            className="inline-flex items-center gap-1 text-sm text-primary hover:text-primary/80 font-semibold flex-shrink-0 whitespace-nowrap"
          >
            <Plus className="h-4 w-4" /> {_("dashboard.add")}
          </Link>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="divide-y divide-foreground/10 p-4 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <AccountRowSkeleton key={i} />
              ))}
            </div>
          ) : accounts && accounts.length > 0 ? (
            <div className="divide-y divide-foreground/10">
              {accounts.map((acc) => (
                <Link
                  key={acc.id}
                  href={`/accounts/${acc.id}`}
                  className="flex items-center gap-3 sm:gap-4 px-4 sm:px-6 py-3.5 hover:bg-muted/50 transition duration-150 min-w-0"
                >
                  <AccountAvatar
                    accountId={acc.id}
                    firstName={acc.first_name}
                    phone={acc.phone}
                    photoVersion={acc.photo_version}
                    size="lg"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {acc.first_name || _("dashboard.unnamed")}{" "}
                      {acc.last_name || ""}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {acc.username ? `@${acc.username}` : acc.phone}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium flex-shrink-0 whitespace-nowrap",
                      acc.is_active
                        ? "bg-primary/10 text-primary border-primary/20"
                        : "bg-muted text-muted-foreground border-border"
                    )}
                  >
                    <span
                      className={cn(
                        "w-1.5 h-1.5 rounded-full flex-shrink-0",
                        acc.is_active ? "bg-primary" : "bg-muted-foreground/50"
                      )}
                    />
                    {acc.is_active ? _("dashboard.online") : _("dashboard.offline")}
                  </Badge>
                </Link>
              ))}
            </div>
          ) : (
            <div className="p-10 sm:p-14 text-center max-w-md mx-auto">
              <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="h-7 w-7 text-muted-foreground/40" />
              </div>
              <h2 className="font-semibold text-foreground mb-1">{_("dashboard.noAccounts")}</h2>
              <p className="text-muted-foreground text-sm mb-6 leading-relaxed">
                {_("dashboard.noAccountsDesc")}
              </p>
              <Link
                href="/accounts/add"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 transition"
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
