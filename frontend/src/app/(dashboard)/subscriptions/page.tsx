"use client";

import React from "react";

import Link from "next/link";
import { useT } from "@/lib/i18n";
import { useMySubscription } from "@/hooks/use-subscriptions";
import { useAuthStore } from "@/store/auth-store";
import { Card, CardContent } from "@/components/ui/card";
import {
  Crown,
  Star,
  Zap,
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock,
  ArrowRight,
  Ticket,
  Minus,
  Check,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const PLAN_KEYS = ["basic", "pro", "premium"] as const;
type PlanKey = (typeof PLAN_KEYS)[number];
type CurrentPlanKey = PlanKey | "owner";

const PLAN_META: Record<
  CurrentPlanKey,
  {
    icon: typeof Zap;
    statusBg: string;
    statusText: string;
    cardRing: string;
    iconColor: string;
    iconBg: string;
  }
> = {
  basic: {
    icon: Zap,
    statusBg: "bg-slate-50",
    statusText: "text-slate-700",
    cardRing: "ring-slate-200",
    iconColor: "text-slate-500",
    iconBg: "bg-slate-100",
  },
  pro: {
    icon: Star,
    statusBg: "bg-primary-50",
    statusText: "text-primary-700",
    cardRing: "ring-primary-200",
    iconColor: "text-primary-600",
    iconBg: "bg-primary-50",
  },
  premium: {
    icon: Crown,
    statusBg: "bg-amber-50",
    statusText: "text-amber-700",
    cardRing: "ring-amber-200",
    iconColor: "text-amber-600",
    iconBg: "bg-amber-50",
  },
  owner: {
    icon: Crown,
    statusBg: "bg-indigo-50",
    statusText: "text-indigo-700",
    cardRing: "ring-indigo-200",
    iconColor: "text-indigo-600",
    iconBg: "bg-indigo-50",
  },
};

// Features matrix: which features are included in which plans
const FEATURE_MATRIX: { key: string; basic: boolean; pro: boolean; premium: boolean }[] = [
  { key: "featureAccounts", basic: false, pro: true, premium: true },
  { key: "featureChat", basic: true, pro: true, premium: true },
  { key: "featureBroadcast", basic: false, pro: true, premium: true },
  { key: "featureInvite", basic: false, pro: true, premium: true },
  { key: "featureAutoReply", basic: false, pro: true, premium: true },
  { key: "featureContacts", basic: false, pro: true, premium: true },
  { key: "featurePriority", basic: false, pro: false, premium: true },
  { key: "featureAllFuture", basic: false, pro: false, premium: true },
];

// Features listed per plan card
const PLAN_FEATURES: Record<PlanKey, string[]> = {
  basic: ["featureChat"],
  pro: ["featureAccounts", "featureBroadcast", "featureInvite", "featureAutoReply", "featureContacts"],
  premium: ["featureAccounts", "featureBroadcast", "featureInvite", "featureAutoReply", "featureContacts", "featurePriority", "featureAllFuture"],
};

export default function SubscriptionPage() {
  const _ = useT();
  const user = useAuthStore((s) => s.user);
  const { data: subscription, isLoading, error } = useMySubscription();

  const currentPlan = (subscription?.plan || user?.role || "basic") as CurrentPlanKey;
  const isActive = subscription?.is_active ?? false;
  const expiresAt = subscription?.expires_at ?? null;
  const daysRemaining = subscription?.days_remaining ?? null;

  const meta = PLAN_META[currentPlan] || PLAN_META.basic;
  const StatusIcon = meta.icon;

  // The next tier up from current plan (for "recommended" badge)
  const nextTier: PlanKey | null =
    currentPlan === "basic" ? "pro" : currentPlan === "pro" ? "premium" : null;

  // Progress bar percentage (based on 30-day cycle as default)
  const progressPercent =
    daysRemaining !== null && daysRemaining >= 0
      ? Math.min(100, Math.max(0, (daysRemaining / 30) * 100))
      : 0;

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{_("subscription.title")}</h1>
          <p className="text-muted-foreground text-sm mt-1">{_("subscription.desc")}</p>
        </div>
        <Link
          href="/redeem"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
        >
          <Ticket className="h-4 w-4" />
          {_("subscription.redeemBtn")}
        </Link>
      </div>

      {/* Current Plan Status */}
      {isLoading ? (
        <div className="h-36 bg-muted rounded-xl animate-pulse" />
      ) : error ? (
        <div className="flex items-center gap-3 p-4 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p className="text-sm">Failed to load subscription info</p>
        </div>
      ) : (
        <Card className={cn("overflow-visible")}>
          <CardContent className="p-0">
            <div className={cn("flex flex-col sm:flex-row items-start sm:items-center gap-6 p-6", meta.statusBg, "rounded-xl")}>
              {/* Plan Icon & Name */}
              <div className="flex items-center gap-4 min-w-0">
                <div className={cn("p-3.5 rounded-xl", meta.iconBg)}>
                  <StatusIcon className={cn("h-7 w-7", meta.iconColor)} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">{_("subscription.currentPlan")}</p>
                  <p className={cn("text-2xl font-semibold capitalize", meta.statusText)}>{_(`subscription.plan${currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)}` as any)}</p>
                </div>
              </div>

              {/* Status & Expiry */}
              <div className="flex-1 flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:justify-end w-full">
                {currentPlan !== "basic" ? (
                  <>
                    {/* Active / Expired badge */}
                    <div
                      className={cn(
                        "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold",
                        isActive
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-red-100 text-red-700"
                      )}
                    >
                      {isActive ? (
                        <CheckCircle className="h-3.5 w-3.5" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5" />
                      )}
                      {isActive ? _("subscription.active") : _("subscription.expired")}
                    </div>

                    {/* Expiry info */}
                    {currentPlan === "owner" ? (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        <span>
                          {_("subscription.expiresAt")}:{" "}
                          <span className="font-medium text-foreground">
                            {_("subscription.lifetime")}
                          </span>
                        </span>
                      </div>
                    ) : expiresAt ? (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        <span>
                          {_("subscription.expiresAt")}:{" "}
                          <span className="font-medium text-foreground">
                            {new Date(expiresAt).toLocaleDateString("en-GB", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </span>
                        </span>
                      </div>
                    ) : null}

                    {/* Days remaining */}
                    {daysRemaining !== null && isActive && (
                      <div className="text-xs font-semibold text-primary-600">
                        {daysRemaining} {_("subscription.daysRemaining")}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-wrap">
                    <p className="text-sm text-muted-foreground">{_("subscription.noSubscription")}</p>
                    <Link
                      href="/redeem"
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors flex-wrap"
                    >
                      {_("subscription.upgradePrompt")}
                      <ArrowRight className="h-3 w-3 shrink-0" />
                    </Link>
                  </div>
                )}
              </div>
            </div>

            {/* Progress bar — only for active non-basic plans */}
            {currentPlan !== "basic" && currentPlan !== "owner" && isActive && daysRemaining !== null && (
              <div className="px-6 pb-5 pt-3">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1.5">
                  <span>{_("subscription.daysRemaining")}</span>
                  <span className="font-medium text-foreground">{daysRemaining} / 30</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      progressPercent > 30 ? "bg-primary-500" : progressPercent > 10 ? "bg-amber-500" : "bg-red-500"
                    )}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Plan Comparison Cards */}
      <div>
        <h2 className="text-base font-semibold text-foreground mb-4">{_("subscription.upgradePlans")}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {PLAN_KEYS.map((planKey) => {
            const isCurrent = currentPlan === planKey;
            const isRecommended = nextTier === planKey;
            const pm = PLAN_META[planKey];
            const PlanIcon = pm.icon;
            const features = PLAN_FEATURES[planKey];
            const descKey = `subscription.${planKey}Desc` as any;

            return (
              <Card
                key={planKey}
                className={cn(
                  "relative transition-all duration-200",
                  isCurrent && "ring-2 ring-primary-500",
                  isRecommended && !isCurrent && "ring-2 ring-primary-300",
                  !isCurrent && !isRecommended && "hover:ring-2 hover:ring-foreground/15"
                )}
              >
                {/* Current / Recommended badge */}
                {(isCurrent || isRecommended) && (
                  <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 z-10">
                    <span
                      className={cn(
                        "text-[11px] font-semibold px-3 py-0.5 rounded-full whitespace-nowrap",
                        isCurrent
                          ? "bg-primary-600 text-white"
                          : "bg-primary-100 text-primary-700"
                      )}
                    >
                      {isCurrent ? _("subscription.currentPlan") : _("subscription.recommended")}
                    </span>
                  </div>
                )}

                <CardContent className="p-5 pt-6 space-y-4">
                  {/* Plan Header */}
                  <div className="flex items-center gap-3">
                    <div className={cn("p-2 rounded-lg", pm.iconBg)}>
                      <PlanIcon className={cn("h-5 w-5", pm.iconColor)} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground capitalize">{_(`subscription.plan${planKey.charAt(0).toUpperCase() + planKey.slice(1)}` as any)}</p>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-muted-foreground leading-relaxed">{_(descKey)}</p>

                  {/* Feature List */}
                  <ul className="space-y-2 pt-1">
                    {features.map((featureKey, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-foreground/80">
                        <Check className={cn("h-4 w-4 mt-0.5 shrink-0", pm.iconColor)} />
                        <span>{_(`subscription.${featureKey}` as any)}</span>
                      </li>
                    ))}
                  </ul>

                  {/* CTA for upgrade */}
                  {!isCurrent && currentPlan !== "owner" && (
                    <Link
                      href="/redeem"
                      className={cn(
                        "flex items-center justify-center gap-2 w-full py-2 rounded-lg text-sm font-medium transition-colors mt-2",
                        isRecommended
                          ? "bg-primary-600 text-white hover:bg-primary-700"
                          : "bg-slate-100 text-foreground hover:bg-slate-200"
                      )}
                    >
                      <Ticket className="h-3.5 w-3.5" />
                      {_("subscription.redeemBtn")}
                    </Link>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Feature Comparison Table */}
      <Card>
        <CardContent className="p-0">
          <div className="p-5 pb-3">
            <h3 className="text-sm font-semibold text-foreground">{_("subscription.compareFeatures")}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-t border-b border-border">
                  <th className="text-left py-3 px-5 text-xs font-medium text-muted-foreground whitespace-nowrap">{_("subscription.feature")}</th>
                  {PLAN_KEYS.map((pk) => (
                    <th key={pk} className="text-center py-3 px-4 text-xs font-medium text-muted-foreground capitalize whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1.5">
                        {React.createElement(PLAN_META[pk].icon, {
                          className: cn("h-3.5 w-3.5", PLAN_META[pk].iconColor),
                        })}
                        {_(`subscription.plan${pk.charAt(0).toUpperCase() + pk.slice(1)}` as any)}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FEATURE_MATRIX.map((row, i) => (
                  <tr key={row.key} className={cn("border-b border-border last:border-0", i % 2 === 0 && "bg-muted/30")}>
                    <td className="py-2.5 px-5 text-foreground/80 whitespace-nowrap">{_(`subscription.${row.key}` as any)}</td>
                    {PLAN_KEYS.map((pk) => {
                      const included = row[pk];
                      return (
                        <td key={pk} className="text-center py-2.5 px-4">
                          {included ? (
                            <Check className="h-4 w-4 text-emerald-500 mx-auto" />
                          ) : (
                            <Minus className="h-4 w-4 text-slate-300 mx-auto" />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
