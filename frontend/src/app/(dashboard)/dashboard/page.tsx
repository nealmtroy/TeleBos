"use client";

import { useState, useEffect } from "react";
import { useAccountsPaginated, useAccountsSummary, type Account } from "@/hooks/use-accounts";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import {
  Smartphone,
  Send,
  AlertCircle,
  Plus,
  ExternalLink,
  Activity,
  Radio,
  BarChart3,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatsCardSkeleton, AccountRowSkeleton } from "@/components/ui/skeleton-cards";
import { AccountAvatar } from "@/components/accounts/account-avatar";

const RECENT_ACCOUNTS_LIMIT = 5;

export default function DashboardPage() {
  const _ = useT();
  const user = useAuthStore((s) => s.user);
  const [showOnboardingBanner, setShowOnboardingBanner] = useState(false);

  useEffect(() => {
    if (user?.id) {
      const isComplete = localStorage.getItem(`telebos_onboarding_completed_${user.id}`);
      const isDismissed = sessionStorage.getItem(`telebos_onboarding_dismissed_${user.id}`);
      if (!isComplete && !isDismissed) {
        setShowOnboardingBanner(true);
      }
    }
  }, [user]);

  const dismissOnboardingBanner = () => {
    setShowOnboardingBanner(false);
    if (user?.id) {
      sessionStorage.setItem(`telebos_onboarding_dismissed_${user.id}`, "true");
    }
  };
  const { data: accountsSummary } = useAccountsSummary();
  // Only the top 5 accounts are rendered below, so fetch 5 rather than the
  // full unpaginated list the widget used to request.
  const { data: recentAccountsData, isLoading } = useAccountsPaginated({
    page: 1,
    limit: RECENT_ACCOUNTS_LIMIT,
  });
  const accounts = (recentAccountsData?.accounts ?? []) as Account[];

  const activeCount = accountsSummary?.active ?? 0;
  const totalCount = accountsSummary?.total ?? recentAccountsData?.total ?? 0;

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
    <div className="space-y-4 sm:space-y-5 max-w-[1400px] mx-auto">
      {/* Onboarding Welcome Callout */}
      {showOnboardingBanner && (
        <div className="relative overflow-hidden rounded-xl border border-primary/30 bg-gradient-to-r from-primary/15 via-primary/5 to-transparent p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs">
          <div className="flex items-start sm:items-center gap-3.5 min-w-0">
            <div className="p-2.5 rounded-xl bg-primary/20 text-primary flex-shrink-0">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-semibold text-foreground truncate">
                {_("onboarding.welcomeBannerTitle")}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1 sm:line-clamp-2">
                {_("onboarding.welcomeBannerDesc")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto flex-shrink-0">
            <Link
              href="/onboarding"
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition shadow-xs w-full sm:w-auto whitespace-nowrap"
            >
              <Sparkles className="h-3.5 w-3.5" /> {_("onboarding.welcomeBannerCta")}
            </Link>
            <button
              type="button"
              onClick={dismissOnboardingBanner}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition cursor-pointer"
              aria-label="Dismiss banner"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Hero Banner */}
      <div className="relative rounded-xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4 sm:p-5 text-white border border-border/40 shadow-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 mb-1.5 text-blue-300">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-300" />
              <span className="text-[11px] font-medium tracking-wide">
                {_("dashboard.systemOnline")}
              </span>
            </div>
            <h1 className="text-lg sm:text-xl lg:text-2xl font-bold tracking-tight truncate">
              {_("dashboard.welcome")}
            </h1>
            <p className="text-white/70 text-xs sm:text-sm mt-0.5 line-clamp-1 sm:line-clamp-2 max-w-prose">
              {_("dashboard.welcomeDesc")}
            </p>
          </div>
          <Link
            href="/accounts/add"
            data-keep-white
            className={cn(
              "inline-flex items-center gap-2 px-3.5 py-2 bg-white text-slate-900 rounded-lg text-xs sm:text-sm font-semibold",
              "hover:bg-white/90 transition-all duration-200 shadow-sm",
              "hover:-translate-y-0.5 active:translate-y-0 flex-shrink-0 whitespace-nowrap"
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
            <Card className="h-full hover:border-primary/40 hover:shadow-xs transition-all duration-150 overflow-hidden">
              <CardContent className="p-3.5 sm:p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground truncate mr-2">
                    {stat.label}
                  </span>
                  <div
                    className={cn(
                      "flex-shrink-0 p-1.5 rounded-lg text-primary bg-primary/10",
                      "group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-150"
                    )}
                  >
                    <stat.icon className="h-3.5 w-3.5" />
                  </div>
                </div>
                <div className="text-xl sm:text-2xl font-bold text-foreground tracking-tight truncate">
                  {stat.value}
                </div>
                <p className="text-xs text-muted-foreground mt-1 font-normal flex items-center gap-1 truncate">
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
            <Card className="hover:border-primary/40 hover:shadow-xs transition-all duration-150">
              <CardContent className="p-3 sm:p-3.5">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 p-2 rounded-lg text-primary bg-primary/10 group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-150">
                    <action.icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-semibold text-xs sm:text-sm text-foreground truncate">{action.title}</h2>
                    <p className="text-xs text-muted-foreground truncate">{action.desc}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Accounts List */}
      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between border-b border-border/80 py-3 px-4 sm:px-5 gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-sm sm:text-base font-semibold text-foreground truncate">
              {_("dashboard.connectedAccounts")}
            </CardTitle>
            <CardDescription className="text-xs mt-0.5 truncate">
              {_("dashboard.connectedAccountsDesc")}
            </CardDescription>
          </div>
          <Link
            href="/accounts/add"
            className="inline-flex items-center gap-1 text-xs sm:text-sm text-primary hover:text-primary/80 font-semibold flex-shrink-0 whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5" /> {_("dashboard.add")}
          </Link>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="divide-y divide-border/60">
              {Array.from({ length: 3 }).map((_, i) => (
                <AccountRowSkeleton key={i} />
              ))}
            </div>
          ) : accounts && accounts.length > 0 ? (
            <>
              <div className="divide-y divide-border/60">
                {accounts.map((acc) => (
                  <Link
                    key={acc.id}
                    href={`/accounts/${acc.id}`}
                    className="flex items-center gap-3 px-4 sm:px-5 py-2.5 sm:py-3 hover:bg-muted/40 transition-colors duration-150 min-w-0"
                  >
                    <AccountAvatar
                      accountId={acc.id}
                      telegramId={acc.telegram_id}
                      firstName={acc.first_name}
                      phone={acc.phone}
                      colorId={acc.color_id}
                      hasProfilePhoto={acc.has_profile_photo}
                      photoVersion={acc.photo_version}
                      isActive={acc.is_active}
                      profilePhotoPath={acc.profile_photo_path}
                      size="md"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs sm:text-sm font-semibold text-foreground truncate">
                        {acc.first_name || _("dashboard.unnamed")}{" "}
                        {acc.last_name || ""}
                      </p>
                      <p className="text-[11px] sm:text-xs text-muted-foreground truncate mt-0.5">
                        {acc.username ? `@${acc.username}` : acc.phone}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium flex-shrink-0 whitespace-nowrap",
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
              {totalCount > accounts.length && (
                <div className="border-t border-border/60 px-4 sm:px-5 py-2.5 bg-muted/20 text-center">
                  <Link
                    href="/accounts"
                    className="text-xs font-semibold text-primary hover:text-primary/80 inline-flex items-center gap-1"
                  >
                    {_("dashboard.viewAllAccounts")} ({totalCount})
                  </Link>
                </div>
              )}
            </>
          ) : (
            <div className="p-8 sm:p-10 text-center max-w-md mx-auto">
              <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto mb-3">
                <AlertCircle className="h-6 w-6 text-muted-foreground/40" />
              </div>
              <h2 className="font-semibold text-foreground text-sm mb-1">{_("dashboard.noAccounts")}</h2>
              <p className="text-muted-foreground text-xs mb-4 leading-relaxed">
                {_("dashboard.noAccountsDesc")}
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
                <Link
                  href="/accounts/add"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 transition w-full sm:w-auto justify-center"
                >
                  <Plus className="h-3.5 w-3.5" /> {_("dashboard.addFirstAccount")}
                </Link>
                <Link
                  href="/onboarding"
                  className="inline-flex items-center gap-2 px-4 py-2 border border-border bg-card text-foreground rounded-lg text-xs font-semibold hover:bg-muted transition w-full sm:w-auto justify-center"
                >
                  <Sparkles className="h-3.5 w-3.5 text-primary" /> {_("onboarding.welcomeBannerCta")}
                </Link>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
