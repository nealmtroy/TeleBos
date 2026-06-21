"use client";

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
  Loader2,
  Clock,
  ArrowRight,
  Ticket,
} from "lucide-react";
import { cn } from "@/lib/utils";

const PLANS = [
  {
    key: "basic",
    icon: Zap,
    color: "gray",
    bg: "bg-gray-50 border-gray-200",
    iconBg: "bg-gray-100 text-gray-600",
    accent: "text-gray-700",
    features: ["1 Telegram account", "Basic chat management", "Groups & Channels view"],
    disabled: false,
  },
  {
    key: "pro",
    icon: Star,
    color: "blue",
    bg: "bg-blue-50/30 border-blue-200",
    iconBg: "bg-blue-100 text-blue-600",
    accent: "text-blue-700",
    features: [
      "Up to 5 Telegram accounts",
      "Smart broadcast",
      "Member invite & scraping",
      "Auto-reply system",
      "Contact management",
    ],
    disabled: false,
  },
  {
    key: "premium",
    icon: Crown,
    color: "amber",
    bg: "bg-amber-50/30 border-amber-200",
    iconBg: "bg-amber-100 text-amber-600",
    accent: "text-amber-700",
    features: [
      "Unlimited Telegram accounts",
      "Everything in Pro",
      "Priority support",
      "All future features",
    ],
    disabled: false,
  },
];

export default function SubscriptionPage() {
  const _ = useT();
  const user = useAuthStore((s) => s.user);
  const { data: subscription, isLoading, error } = useMySubscription();

  const currentPlan = subscription?.plan || user?.role || "basic";
  const isActive = subscription?.is_active ?? false;
  const expiresAt = subscription?.expires_at ?? null;
  const daysRemaining = subscription?.days_remaining ?? null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{_("subscription.title")}</h1>
          <p className="text-gray-500 mt-1">{_("subscription.desc")}</p>
        </div>
        <Link
          href="/redeem"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
        >
          <Ticket className="h-4 w-4" />
          {_("subscription.redeemBtn")}
        </Link>
      </div>

      {/* Current Plan Status */}
      {isLoading ? (
        <div className="h-32 bg-gray-100 rounded-xl animate-pulse" />
      ) : error ? (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
          <AlertCircle className="h-5 w-5" />
          <p className="text-sm">Failed to load subscription info</p>
        </div>
      ) : (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <div
                  className={cn(
                    "p-3 rounded-xl",
                    currentPlan === "premium"
                      ? "bg-amber-100 text-amber-600"
                      : currentPlan === "pro"
                      ? "bg-blue-100 text-blue-600"
                      : "bg-gray-100 text-gray-600"
                  )}
                >
                  {currentPlan === "premium" ? (
                    <Crown className="h-6 w-6" />
                  ) : currentPlan === "pro" ? (
                    <Star className="h-6 w-6" />
                  ) : (
                    <Zap className="h-6 w-6" />
                  )}
                </div>
                <div>
                  <p className="text-sm text-gray-500">{_("subscription.currentPlan")}</p>
                  <p className="text-xl font-bold text-gray-900 capitalize">{currentPlan}</p>
                </div>
              </div>

              {currentPlan === "pro" || currentPlan === "premium" ? (
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-50 border border-green-200">
                    {isActive ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500" />
                    )}
                    <span
                      className={cn(
                        "text-sm font-medium",
                        isActive ? "text-green-700" : "text-red-600"
                      )}
                    >
                      {isActive ? _("subscription.active") : _("subscription.expired")}
                    </span>
                  </div>
                  {expiresAt && (
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Clock className="h-4 w-4" />
                      {_("subscription.expiresAt")}:{" "}
                      <span className="font-medium text-gray-700">
                        {new Date(expiresAt).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  )}
                  {daysRemaining !== null && isActive && (
                    <div className="text-sm font-medium text-primary-600">
                      {daysRemaining} {_("subscription.daysRemaining")}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-gray-500">{_("subscription.noSubscription")}</div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Plan Comparison */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{_("subscription.upgradePlans")}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PLANS.map((plan) => {
            const isCurrent = currentPlan === plan.key;
            const Icon = plan.icon;
            return (
              <Card
                key={plan.key}
                className={cn(
                  "relative border-2",
                  isCurrent ? "border-primary-500 ring-1 ring-primary-500" : plan.bg,
                  isCurrent && plan.key === "basic" && "border-gray-300 ring-0"
                )}
              >
                {isCurrent && plan.key !== "basic" && (
                  <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                    <span className="bg-primary-600 text-white text-xs font-medium px-3 py-0.5 rounded-full">
                      Current
                    </span>
                  </div>
                )}
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className={cn("p-2 rounded-lg", plan.iconBg)}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 capitalize">{plan.key}</p>
                    </div>
                  </div>

                  <ul className="space-y-2">
                    {plan.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                        <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
