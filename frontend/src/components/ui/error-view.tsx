"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Compass,
  Copy,
  Check,
  Home,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  LogIn,
  RotateCcw,
  ServerCrash,
  ShieldAlert,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import { BrandLogo } from "@/components/ui/brand-logo";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { LanguageSwitcher } from "@/components/layout/language-switcher";

export type ErrorStatusCode = 401 | 403 | 404 | 500 | 503;

export interface ErrorViewProps {
  statusCode: ErrorStatusCode;
  title?: string;
  description?: string;
  error?: Error | { message?: string; digest?: string; stack?: string };
  reset?: () => void;
  showHomeButton?: boolean;
  showDashboardButton?: boolean;
  showBackButton?: boolean;
  showLoginButton?: boolean;
  showRetryButton?: boolean;
  customActions?: React.ReactNode;
}

interface StatusConfig {
  icon: React.ComponentType<{ className?: string }>;
  badgeColor: string;
  accentGlow: string;
  gradientText: string;
}

const statusConfigs: Record<ErrorStatusCode, StatusConfig> = {
  401: {
    icon: KeyRound,
    badgeColor:
      "bg-indigo-50 text-indigo-700 border-indigo-200/80 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800/60",
    accentGlow: "from-indigo-500/15 via-violet-500/10 to-transparent",
    gradientText: "from-indigo-500 via-violet-500 to-purple-600",
  },
  403: {
    icon: ShieldAlert,
    badgeColor:
      "bg-rose-50 text-rose-700 border-rose-200/80 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800/60",
    accentGlow: "from-rose-500/15 via-pink-500/10 to-transparent",
    gradientText: "from-rose-500 via-pink-500 to-red-600",
  },
  404: {
    icon: Compass,
    badgeColor:
      "bg-sky-50 text-sky-700 border-sky-200/80 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800/60",
    accentGlow: "from-sky-500/15 via-blue-500/10 to-transparent",
    gradientText: "from-sky-500 via-blue-500 to-indigo-600",
  },
  500: {
    icon: ServerCrash,
    badgeColor:
      "bg-red-50 text-red-700 border-red-200/80 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800/60",
    accentGlow: "from-red-500/15 via-orange-500/10 to-transparent",
    gradientText: "from-red-500 via-rose-500 to-orange-600",
  },
  503: {
    icon: Wrench,
    badgeColor:
      "bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/60",
    accentGlow: "from-amber-500/15 via-yellow-500/10 to-transparent",
    gradientText: "from-amber-500 via-yellow-500 to-orange-600",
  },
};

export function ErrorView({
  statusCode,
  title,
  description,
  error,
  reset,
  showHomeButton,
  showDashboardButton,
  showBackButton,
  showLoginButton,
  showRetryButton,
  customActions,
}: ErrorViewProps) {
  const _ = useT();
  const router = useRouter();
  const authUser = useAuthStore((s) => s.user);
  const [copied, setCopied] = React.useState(false);
  const [showDetails, setShowDetails] = React.useState(false);

  const config = statusConfigs[statusCode] || statusConfigs[500];
  const Icon = config.icon;

  // Defaults per status code
  const defaultTitle =
    statusCode === 401
      ? _("errors.unauthorized.title")
      : statusCode === 403
      ? _("errors.forbidden.title")
      : statusCode === 404
      ? _("errors.notFound.title")
      : statusCode === 503
      ? _("errors.serviceUnavailable.title")
      : _("errors.serverError.title");

  const defaultDescription =
    statusCode === 401
      ? _("errors.unauthorized.description")
      : statusCode === 403
      ? _("errors.forbidden.description")
      : statusCode === 404
      ? _("errors.notFound.description")
      : statusCode === 503
      ? _("errors.serviceUnavailable.description")
      : _("errors.serverError.description");

  const displayTitle = title || defaultTitle;
  const displayDescription = description || defaultDescription;

  // Button visibility logic
  const is401 = statusCode === 401;
  const is403 = statusCode === 403;
  const is404 = statusCode === 404;
  const isServer = statusCode === 500 || statusCode === 503;

  const shouldShowLogin = showLoginButton ?? is401;
  const shouldShowRetry = showRetryButton ?? isServer;
  const shouldShowDashboard = showDashboardButton ?? (is403 || (!!authUser && !is401));
  const shouldShowHome = showHomeButton ?? true;
  const shouldShowBack = showBackButton ?? (is404 || is403);

  const errorDetails = error?.stack || error?.message || (error as any)?.digest;

  const handleCopyDetails = async () => {
    if (!errorDetails) return;
    try {
      await navigator.clipboard.writeText(
        `Error ${statusCode}: ${displayTitle}\n${displayDescription}\nDetails: ${errorDetails}`
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleRetry = () => {
    if (reset) {
      reset();
    } else {
      window.location.reload();
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/70 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col relative overflow-hidden transition-colors selection:bg-primary/20">
      {/* ── Ambient Radial Background Glow ───────────────────────────── */}
      <div
        className={cn(
          "pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[500px] rounded-full blur-3xl opacity-75 dark:opacity-40 bg-gradient-to-b",
          config.accentGlow
        )}
        aria-hidden="true"
      />

      {/* ── Header ────────────────────────────────────────────────────── */}
      <header className="border-b border-slate-200/80 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md sticky top-0 z-40 transition-colors">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 group transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg"
            aria-label="TeleBos Home"
          >
            <BrandLogo size="sm" />
          </Link>

          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* ── Main Error Card ───────────────────────────────────────────── */}
      <main className="flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-8 py-12 relative z-10">
        <div className="max-w-xl w-full text-center">
          {/* Watermark Status Code & Floating Icon */}
          <div className="relative mb-6 flex flex-col items-center justify-center">
            {/* Background Watermark */}
            <span
              className="text-8xl sm:text-9xl font-black text-slate-200/60 dark:text-slate-800/50 select-none tracking-tighter leading-none"
              aria-hidden="true"
            >
              {statusCode}
            </span>

            {/* Icon Container with subtle glow and gradient border */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-20 sm:size-24 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xl dark:shadow-2xl flex items-center justify-center">
              <div
                className={cn(
                  "size-14 sm:size-16 rounded-xl flex items-center justify-center bg-gradient-to-br",
                  config.accentGlow
                )}
              >
                <Icon className="size-7 sm:size-8 text-slate-800 dark:text-slate-200" />
              </div>
            </div>
          </div>

          {/* Status Badge */}
          <div className="mb-4 inline-flex items-center">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold tracking-wide border shadow-2xs",
                config.badgeColor
              )}
            >
              <span className="size-1.5 rounded-full bg-current animate-pulse" />
              {_(`errors.badge.${statusCode}`) || `${statusCode}`}
            </span>
          </div>

          {/* Heading */}
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-slate-900 dark:text-slate-50 tracking-tight mb-3">
            {displayTitle}
          </h1>

          {/* Description */}
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed max-w-md mx-auto mb-8">
            {displayDescription}
          </p>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-3 mb-8">
            {shouldShowRetry && (
              <Button
                onClick={handleRetry}
                variant="default"
                size="lg"
                className="gap-2 shadow-sm font-semibold rounded-xl cursor-pointer"
              >
                <RotateCcw className="size-4" />
                {statusCode === 503
                  ? _("errors.serviceUnavailable.actionRetry")
                  : _("errors.serverError.actionRetry")}
              </Button>
            )}

            {shouldShowLogin && (
              <Button asChild variant="default" size="lg" className="rounded-xl shadow-sm font-semibold">
                <Link href="/login" className="gap-2">
                  <LogIn className="size-4" />
                  {_("errors.unauthorized.actionLogin")}
                </Link>
              </Button>
            )}

            {shouldShowDashboard && (
              <Button asChild variant={is403 ? "default" : "outline"} size="lg" className="rounded-xl">
                <Link href="/dashboard" className="gap-2">
                  <LayoutDashboard className="size-4" />
                  {_("errors.forbidden.actionDashboard")}
                </Link>
              </Button>
            )}

            {shouldShowHome && (
              <Button asChild variant="outline" size="lg" className="rounded-xl">
                <Link href="/" className="gap-2">
                  <Home className="size-4" />
                  {_("notFound.backHome")}
                </Link>
              </Button>
            )}

            {shouldShowBack && (
              <Button
                type="button"
                variant="ghost"
                size="lg"
                onClick={() => router.back()}
                className="gap-2 rounded-xl text-slate-600 dark:text-slate-400 cursor-pointer"
              >
                <ArrowLeft className="size-4" />
                {_("errors.notFound.actionBack")}
              </Button>
            )}

            {customActions}
          </div>

          {/* Optional Collapsible Technical Details (for 500 / 503 or error object) */}
          {errorDetails && (
            <div className="max-w-md mx-auto mb-6 text-left">
              <button
                type="button"
                onClick={() => setShowDetails(!showDetails)}
                className="flex items-center justify-between w-full text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors py-2 px-1 focus:outline-none"
              >
                <span>{_("errors.technicalDetails")}</span>
                {showDetails ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
              </button>

              {showDetails && (
                <div className="relative mt-2 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 text-slate-700 dark:text-slate-300 font-mono text-xs shadow-inner overflow-hidden">
                  <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-[11px] text-slate-400">Digest / Message</span>
                    <button
                      type="button"
                      onClick={handleCopyDetails}
                      className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline cursor-pointer"
                    >
                      {copied ? (
                        <>
                          <Check className="size-3 text-emerald-500" />
                          <span className="text-emerald-500">{_("errors.copied")}</span>
                        </>
                      ) : (
                        <>
                          <Copy className="size-3" />
                          <span>{_("errors.copyError")}</span>
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="max-h-36 overflow-auto text-[11px] whitespace-pre-wrap break-all select-all font-mono">
                    {String(errorDetails)}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Support / Help link */}
          <div className="border-t border-slate-200/80 dark:border-slate-800/80 pt-6 mt-4">
            <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center justify-center gap-1.5">
              <span>{_("errors.needHelp")}</span>
              <Link
                href="/help"
                className="text-primary hover:underline inline-flex items-center gap-1 font-medium"
              >
                <LifeBuoy className="size-3.5" />
                {_("errors.contactSupport")}
              </Link>
            </p>
          </div>
        </div>
      </main>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-200/60 dark:border-slate-800/60 py-4 text-center text-xs text-slate-500 dark:text-slate-400 relative z-10">
        <p>&copy; {new Date().getFullYear()} TeleBos. All rights reserved.</p>
      </footer>
    </div>
  );
}
