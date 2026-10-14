"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  XCircle,
  KeyRound,
  Lock,
  UserCheck,
  DollarSign,
  TrendingUp,
  RefreshCw,
  Search,
  Filter,
  Eye,
  Calendar,
  Globe,
  Terminal,
  BarChart3,
  Users,
  Radio,
  Bot,
  Activity,
  Layers,
  FileText,
  Clock,
  ArrowRight,
  Info,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  X,
} from "lucide-react";

import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import {
  useAdminSecurityAnalytics,
  useAdminSecurityAuditLogs,
  SecurityAuditLogItem,
  SuspiciousSignalItem,
} from "@/hooks/use-admin-analytics";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { AnalyticsAreaChart } from "@/components/admin/analytics-chart";
import { cn } from "@/lib/utils";

/**
 * Human-friendly action labels and colors.
 */
function getActionBadge(action: string) {
  if (action.startsWith("auth.login_failed")) {
    return { label: "Login Gagal", color: "border-destructive/40 text-destructive bg-destructive/5" };
  }
  if (action.startsWith("auth.login")) {
    return { label: "Login Berhasil", color: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5" };
  }
  if (action.startsWith("auth.password")) {
    return { label: "Ubah Password", color: "border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/5" };
  }
  if (action.startsWith("auth.2fa")) {
    return { label: "Konfigurasi 2FA", color: "border-sky-500/40 text-sky-600 dark:text-sky-400 bg-sky-500/5" };
  }
  if (action.startsWith("api_key.created")) {
    return { label: "Buat API Key", color: "border-blue-500/40 text-blue-600 dark:text-blue-400 bg-blue-500/5" };
  }
  if (action.startsWith("api_key.revoked")) {
    return { label: "Cabut API Key", color: "border-rose-500/40 text-rose-600 dark:text-rose-400 bg-rose-500/5" };
  }
  if (action.startsWith("admin.role")) {
    return { label: "Ubah Role", color: "border-sky-500/40 text-sky-600 dark:text-sky-400 bg-sky-500/5" };
  }
  if (action.startsWith("admin.balance")) {
    return { label: "Penyesuaian Saldo", color: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5" };
  }
  if (action.startsWith("admin.user_suspended")) {
    return { label: "Suspend User", color: "border-destructive text-destructive bg-destructive/10" };
  }
  if (action.startsWith("admin.user_unsuspended")) {
    return { label: "Unsuspend User", color: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5" };
  }
  if (action.startsWith("admin.user_deleted")) {
    return { label: "Hapus User", color: "border-destructive text-destructive bg-destructive/10" };
  }
  if (action.startsWith("security.")) {
    return { label: "Sinyal Keamanan", color: "border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/5" };
  }
  return { label: action, color: "border-border text-muted-foreground bg-muted/40" };
}

export default function AdminSecurityAnalyticsPage() {
  const _ = useT();
  const currentUser = useAuthStore((s) => s.user);

  // Strict Authorization Guard: Only Owner can access Security & Audit telemetry
  if (currentUser?.role !== "owner") {
    return (
      <div className="flex items-center justify-center min-h-[60vh] p-4">
        <div className="w-full max-w-md p-8 text-center bg-card border border-border rounded-2xl shadow-sm space-y-4">
          <div className="inline-flex p-3 rounded-2xl bg-destructive/10 text-destructive mb-2">
            <ShieldAlert className="h-10 w-10" />
          </div>
          <h2 className="text-xl font-bold text-foreground">
            {_("admin.accessDenied") || "Akses Ditolak"}
          </h2>
          <p className="text-sm text-muted-foreground">
            Akses ke Analitik Keamanan & Log Audit sensitif hanya diberikan kepada pemilik sistem (Owner).
          </p>
          <Button asChild className="mt-4">
            <Link href="/admin/dashboard">
              {_("admin.backToDashboard") || "Kembali ke Dashboard"}
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return <SecurityAnalyticsContent />;
}

function SecurityAnalyticsContent() {
  // Filters & State
  const [rangePreset, setRangePreset] = useState<"24h" | "7d" | "30d" | "90d">("7d");
  const [selectedAction, setSelectedAction] = useState<string>("all");
  const [selectedOutcome, setSelectedOutcome] = useState<string>("all");
  const [selectedSeverity, setSelectedSeverity] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  const pageSize = 15;

  // Chart Metric state
  const [chartMetric, setChartMetric] = useState<"total" | "failure" | "warning">("total");

  // Selected Log for Details Modal
  const [activeLogDetail, setActiveLogDetail] = useState<SecurityAuditLogItem | null>(null);
  const [copiedId, setCopiedId] = useState<boolean>(false);

  // Queries
  const {
    data: analyticsData,
    isLoading: isAnalyticsLoading,
    isFetching: isAnalyticsFetching,
    refetch: refetchAnalytics,
  } = useAdminSecurityAnalytics({ range: rangePreset });

  const {
    data: logsData,
    isLoading: isLogsLoading,
    isFetching: isLogsFetching,
    refetch: refetchLogs,
  } = useAdminSecurityAuditLogs({
    range: rangePreset,
    action: selectedAction !== "all" ? selectedAction : undefined,
    outcome: selectedOutcome !== "all" ? selectedOutcome : undefined,
    severity: selectedSeverity !== "all" ? selectedSeverity : undefined,
    search: searchTerm.trim() ? searchTerm.trim() : undefined,
    page,
    page_size: pageSize,
  });

  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefreshAll = async () => {
    setIsRefreshing(true);
    await Promise.all([refetchAnalytics(), refetchLogs()]);
    setIsRefreshing(false);
  };

  const handleCopyId = (idText: string) => {
    navigator.clipboard.writeText(idText);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const kpis = analyticsData?.kpis;
  const suspiciousSignals = analyticsData?.suspicious_signals || [];
  const timeseries = analyticsData?.timeseries || [];

  const chartPoints = timeseries.map((pt) => ({
    date: pt.timestamp,
    value:
      chartMetric === "total"
        ? pt.total_events
        : chartMetric === "failure"
        ? pt.failure_events
        : pt.warning_events,
  }));

  return (
    <div className="space-y-8 pb-16">
      {/* ── Page Header & Controls ──────────────────────────────────────────── */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-border pb-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20">
              <ShieldCheck className="h-3.5 w-3.5" />
              Audit Trail & Access Governance
            </span>
            <Badge variant="outline" className="text-xs font-normal">
              Append-Only Tamper-Resistant
            </Badge>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">
            Security & Audit Analytics
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Pemantauan audit log menyeluruh: autentikasi, perubahan password & 2FA, siklus hidup API key, modifikasi role & saldo manual, serta sinyal akses mencurigakan.
          </p>
        </div>

        {/* Range Buttons & Refresh */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex items-center p-1 bg-muted/70 border border-border/80 rounded-xl text-xs">
            {(
              [
                { id: "24h", label: "24 Jam" },
                { id: "7d", label: "7 Hari" },
                { id: "30d", label: "30 Hari" },
                { id: "90d", label: "90 Hari" },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setRangePreset(item.id);
                  setPage(1);
                }}
                className={cn(
                  "px-3 py-1 text-xs font-medium rounded-lg transition-all",
                  rangePreset === item.id
                    ? "bg-background text-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleRefreshAll}
            disabled={isRefreshing || isAnalyticsFetching || isLogsFetching}
            className="h-9 px-3 gap-2"
          >
            <RefreshCw
              className={cn("h-4 w-4 text-muted-foreground", (isRefreshing || isAnalyticsFetching || isLogsFetching) && "animate-spin")}
            />
            <span className="text-xs font-medium">Refresh</span>
          </Button>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-border/60 pb-3 overflow-x-auto">
        <Button asChild variant="ghost" size="sm" className="h-8 text-xs font-medium text-muted-foreground hover:text-foreground shrink-0">
          <Link href="/admin/analytics">
            <BarChart3 className="h-3.5 w-3.5 mr-1.5" />
            Analytics Overview
          </Link>
        </Button>
        <Button asChild variant="ghost" size="sm" className="h-8 text-xs font-medium text-muted-foreground hover:text-foreground shrink-0">
          <Link href="/admin/analytics/users">
            <Users className="h-3.5 w-3.5 mr-1.5" />
            User Analytics
          </Link>
        </Button>
        <Button asChild variant="ghost" size="sm" className="h-8 text-xs font-medium text-muted-foreground hover:text-foreground shrink-0">
          <Link href="/admin/analytics/telegram-accounts">
            <Radio className="h-3.5 w-3.5 mr-1.5" />
            Telegram Account Analytics
          </Link>
        </Button>
        <Button asChild variant="ghost" size="sm" className="h-8 text-xs font-medium text-muted-foreground hover:text-foreground shrink-0">
          <Link href="/admin/analytics/automation">
            <Bot className="h-3.5 w-3.5 mr-1.5" />
            Automation Analytics
          </Link>
        </Button>
        <Button asChild variant="ghost" size="sm" className="h-8 text-xs font-medium text-muted-foreground hover:text-foreground shrink-0">
          <Link href="/admin/analytics/financial">
            <DollarSign className="h-3.5 w-3.5 mr-1.5" />
            Revenue & Saldo
          </Link>
        </Button>
        <Button asChild variant="ghost" size="sm" className="h-8 text-xs font-medium text-muted-foreground hover:text-foreground shrink-0">
          <Link href="/admin/analytics/system-health">
            <Activity className="h-3.5 w-3.5 mr-1.5 text-emerald-500" />
            Kesehatan Sistem
          </Link>
        </Button>
        <Button variant="secondary" size="sm" className="h-8 text-xs font-semibold shadow-xs shrink-0">
          <Shield className="h-3.5 w-3.5 mr-1.5 text-sky-500" />
          Keamanan & Audit
        </Button>
        <Button asChild variant="ghost" size="sm" className="h-8 text-xs font-medium text-muted-foreground hover:text-foreground shrink-0">
          <Link href="/admin/users">
            <UserCheck className="h-3.5 w-3.5 mr-1.5" />
            Manajemen Pengguna
          </Link>
        </Button>
      </div>

      {/* ── Security Invariant Transparency Banner ─────────────────────────────── */}
      <div className="p-4 rounded-2xl bg-muted/40 border border-border/70 text-xs text-foreground/80 space-y-2">
        <div className="flex items-start gap-2.5">
          <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-foreground flex items-center gap-2">
              Jaminan Keamanan & Perlindungan Data Sensitif Audit Trail
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Seluruh rekaman audit bersifat <strong>append-only (tidak dapat dimodifikasi)</strong>. Sistem secara otomatis menerapkan redaksi rekursif: <strong>password, OTP, session token, API secret, dan private keys</strong> tidak pernah disimpan dalam audit payload. Alamat IP divalidasi secara kriptografis &amp; soket langsung untuk mencegah spoofing header.
            </p>
          </div>
        </div>
      </div>

      {/* ── Top Deck Primary KPI Cards (6 cards) ─────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {/* Card 1: Total Audit Events */}
        <Card className="border-border/60 hover:border-border transition-all">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">Total Aktivitas Audit</span>
              <FileText className="h-4 w-4 text-blue-500" />
            </div>
            <CardTitle className="text-xl font-bold tracking-tight mt-1">
              {isAnalyticsLoading ? "..." : (analyticsData?.total_events ?? 0).toLocaleString("id-ID")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-[11px] text-muted-foreground flex items-center justify-between">
            <span>Periode {rangePreset}</span>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
              Semua Aksi
            </Badge>
          </CardContent>
        </Card>

        {/* Card 2: Logins (Success vs Failed) */}
        <Card className="border-border/60 hover:border-border transition-all">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">Autentikasi & Login</span>
              <Lock className="h-4 w-4 text-emerald-500" />
            </div>
            <CardTitle className="text-xl font-bold tracking-tight mt-1">
              {isAnalyticsLoading ? "..." : (kpis?.successful_logins ?? 0).toLocaleString("id-ID")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-[11px] text-muted-foreground flex items-center justify-between">
            <span className="text-destructive font-medium">
              {kpis?.failed_logins ?? 0} gagal
            </span>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
              {kpis?.successful_logins ?? 0} berhasil
            </span>
          </CardContent>
        </Card>

        {/* Card 3: Password & 2FA Changes */}
        <Card className="border-border/60 hover:border-border transition-all">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">Password & 2FA</span>
              <KeyRound className="h-4 w-4 text-sky-500" />
            </div>
            <CardTitle className="text-xl font-bold tracking-tight mt-1">
              {isAnalyticsLoading ? "..." : ((kpis?.password_changes ?? 0) + (kpis?.twofa_changes ?? 0)).toLocaleString("id-ID")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-[11px] text-muted-foreground flex items-center justify-between">
            <span>{kpis?.password_changes ?? 0} kata sandi</span>
            <span className="text-[10px] text-sky-600 dark:text-sky-400 font-medium">
              {kpis?.twofa_changes ?? 0} config 2FA
            </span>
          </CardContent>
        </Card>

        {/* Card 4: API Key Lifecycle */}
        <Card className="border-border/60 hover:border-border transition-all">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">Siklus API Key</span>
              <Terminal className="h-4 w-4 text-blue-500" />
            </div>
            <CardTitle className="text-xl font-bold tracking-tight mt-1">
              {isAnalyticsLoading ? "..." : (kpis?.api_key_actions ?? 0).toLocaleString("id-ID")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-[11px] text-muted-foreground flex items-center justify-between">
            <span>Kunci integrasi</span>
            <span className="text-[10px] text-muted-foreground">Buat / Cabut</span>
          </CardContent>
        </Card>

        {/* Card 5: Role & Permissions */}
        <Card className="border-border/60 hover:border-border transition-all">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">Perubahan Role</span>
              <UserCheck className="h-4 w-4 text-sky-500" />
            </div>
            <CardTitle className="text-xl font-bold tracking-tight mt-1">
              {isAnalyticsLoading ? "..." : (kpis?.role_changes ?? 0).toLocaleString("id-ID")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-[11px] text-muted-foreground flex items-center justify-between">
            <span>Eskalasi hak akses</span>
            <span className="text-[10px] text-sky-600 dark:text-sky-400 font-medium">Admin Update</span>
          </CardContent>
        </Card>

        {/* Card 6: Manual Balance Adjustments */}
        <Card className="border-border/60 hover:border-border transition-all">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">Koreksi Saldo Manual</span>
              <DollarSign className="h-4 w-4 text-amber-500" />
            </div>
            <CardTitle className="text-xl font-bold tracking-tight mt-1">
              {isAnalyticsLoading ? "..." : (kpis?.balance_adjustments ?? 0).toLocaleString("id-ID")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-[11px] text-muted-foreground flex items-center justify-between">
            <span>Penyesuaian admin</span>
            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">Credit / Debit</span>
          </CardContent>
        </Card>
      </div>

      {/* ── Suspicious Access Signals (Evidence-Based, Calibrated) ────────────────── */}
      <Card className="border-border/60">
        <CardHeader className="pb-3 border-b border-border/40">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Sinyal Risiko & Aktivitas Akses Mencurigakan
              </CardTitle>
              <CardDescription className="text-xs">
                Deteksi anomali berbasis bukti nyata: lonjakan login gagal berulang, multi-IP pada akun pemilik, dan percobaan akses tanpa izin.
              </CardDescription>
            </div>
            <Badge variant="outline" className="text-xs w-fit">
              {suspiciousSignals.length} Sinyal Teridentifikasi
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-5">
          {suspiciousSignals.length === 0 ? (
            <div className="p-6 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-center space-y-1">
              <CheckCircle2 className="h-6 w-6 text-emerald-500 mx-auto" />
              <p className="text-xs font-semibold text-foreground">
                Tidak ada anomali atau sinyal mencurigakan terdeteksi
              </p>
              <p className="text-[11px] text-muted-foreground">
                Seluruh aktivitas autentikasi dan administratif berada dalam parameter operasional yang wajar.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {suspiciousSignals.map((sig, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl border border-border/70 bg-card hover:border-border transition-all space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] capitalize font-mono",
                        sig.severity === "critical"
                          ? "border-destructive text-destructive bg-destructive/5"
                          : sig.severity === "warning"
                          ? "border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/5"
                          : "border-blue-500/40 text-blue-600 dark:text-blue-400 bg-blue-500/5"
                      )}
                    >
                      {sig.signal_type.replace(/_/g, " ")}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {sig.event_count} kejadian
                    </span>
                  </div>

                  <p className="font-medium text-foreground text-xs leading-snug">
                    {sig.evidence_summary}
                  </p>

                  <div className="p-2 rounded-lg bg-muted/40 text-[11px] text-muted-foreground space-y-0.5">
                    <span className="font-semibold text-foreground block">Rekomendasi Tindakan:</span>
                    <span>{sig.recommended_action}</span>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border/40 font-mono">
                    <span>Aktor: {sig.actor_identifier}</span>
                    <span>{sig.last_seen ? new Date(sig.last_seen).toLocaleTimeString("id-ID") : "-"}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Telemetry Timeseries Chart ──────────────────────────────────────────── */}
      <Card className="border-border/60">
        <CardHeader className="p-5 pb-3 border-b border-border/40">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-500" />
                Tren Aktivitas & Kejadian Audit
              </CardTitle>
              <CardDescription className="text-xs">
                Distribusi harian volume aktivitas, percobaan gagal, dan peringatan operasional.
              </CardDescription>
            </div>

            <div className="inline-flex items-center p-1 bg-muted/60 border border-border/80 rounded-xl text-xs">
              {(
                [
                  { id: "total", label: "Semua Aktivitas" },
                  { id: "failure", label: "Kegagalan (Failure)" },
                  { id: "warning", label: "Peringatan (Warning)" },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setChartMetric(m.id)}
                  className={cn(
                    "px-2.5 py-1 text-xs font-medium rounded-lg transition-all",
                    chartMetric === m.id
                      ? "bg-background text-foreground shadow-xs font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-5">
          <AnalyticsAreaChart
            data={chartPoints}
            metricLabel={
              chartMetric === "total"
                ? "Total Aktivitas"
                : chartMetric === "failure"
                ? "Kegagalan Terdeteksi"
                : "Peringatan Terdeteksi"
            }
            color={chartMetric === "failure" ? "rose" : chartMetric === "warning" ? "amber" : "blue"}
            formatValue={(v) => v.toLocaleString("id-ID")}
            isLoading={isAnalyticsLoading}
            height={260}
          />
        </CardContent>
      </Card>

      {/* ── Filter Bar & Search ─────────────────────────────────────────────────── */}
      <Card className="border-border/60">
        <CardHeader className="p-5 pb-3 border-b border-border/40">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4 text-blue-500" />
                Log Audit & Jejak Aktivitas Sensitif
              </CardTitle>
              <CardDescription className="text-xs">
                Pencarian dan penjelajahan terperinci terhadap riwayat aktivitas pengguna dan administrator.
              </CardDescription>
            </div>

            <div className="text-xs text-muted-foreground">
              Total <strong>{logsData?.total ?? 0}</strong> entri log tercatat
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-5 space-y-4">
          {/* Controls: Search, Action, Outcome, Severity */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cari aktor, target, aksi, atau IP..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPage(1);
                }}
                className="pl-9 text-xs h-9"
              />
            </div>

            {/* Action Filter */}
            <select
              value={selectedAction}
              onChange={(e) => {
                setSelectedAction(e.target.value);
                setPage(1);
              }}
              className="h-9 px-3 rounded-md border border-input bg-background text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-ring"
            >
              <option value="all">Semua Jenis Aksi</option>
              <option value="auth.login">Login Berhasil (auth.login)</option>
              <option value="auth.login_failed">Login Gagal (auth.login_failed)</option>
              <option value="auth.password_changed">Ubah Password (auth.password_changed)</option>
              <option value="auth.2fa_*">Konfigurasi 2FA (auth.2fa_*)</option>
              <option value="api_key.*">Siklus API Key (api_key.*)</option>
              <option value="admin.role_changed">Perubahan Role (admin.role_changed)</option>
              <option value="admin.balance_adjusted">Koreksi Saldo (admin.balance_adjusted)</option>
              <option value="admin.user_suspended">Suspend Pengguna (admin.user_suspended)</option>
              <option value="admin.user_deleted">Hapus Pengguna (admin.user_deleted)</option>
              <option value="security.*">Sinyal Keamanan (security.*)</option>
            </select>

            {/* Outcome Filter */}
            <select
              value={selectedOutcome}
              onChange={(e) => {
                setSelectedOutcome(e.target.value);
                setPage(1);
              }}
              className="h-9 px-3 rounded-md border border-input bg-background text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-ring"
            >
              <option value="all">Semua Hasil (Outcome)</option>
              <option value="success">Berhasil (Success)</option>
              <option value="failure">Gagal (Failure)</option>
              <option value="warning">Peringatan (Warning)</option>
            </select>

            {/* Severity Filter */}
            <select
              value={selectedSeverity}
              onChange={(e) => {
                setSelectedSeverity(e.target.value);
                setPage(1);
              }}
              className="h-9 px-3 rounded-md border border-input bg-background text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-ring"
            >
              <option value="all">Semua Tingkat (Severity)</option>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </select>
          </div>

          {/* Audit Trail Table */}
          <div className="overflow-x-auto rounded-xl border border-border/60">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-border/60 bg-muted/30 text-muted-foreground font-medium">
                  <th className="py-3 px-4">Waktu</th>
                  <th className="py-3 px-4">Aktor</th>
                  <th className="py-3 px-4">Tindakan / Aksi</th>
                  <th className="py-3 px-4">Target</th>
                  <th className="py-3 px-4">Hasil</th>
                  <th className="py-3 px-4">Klien & IP</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 font-mono">
                {isLogsLoading ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-muted-foreground">
                      <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-primary" />
                      <span>Memuat catatan audit log...</span>
                    </td>
                  </tr>
                ) : !logsData?.events || logsData.events.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-muted-foreground">
                      <CheckCircle2 className="h-6 w-6 text-emerald-500 mx-auto mb-2" />
                      <span className="font-medium text-foreground block">
                        Tidak ada catatan audit yang cocok
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        Coba sesuaikan kata kunci pencarian atau filter yang dipilih.
                      </span>
                    </td>
                  </tr>
                ) : (
                  logsData.events.map((log) => {
                    const badgeInfo = getActionBadge(log.action);
                    return (
                      <tr key={log.id} className="hover:bg-muted/20 transition-colors">
                        {/* Waktu */}
                        <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">
                          {new Date(log.created_at).toLocaleString("id-ID", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                        </td>

                        {/* Aktor */}
                        <td className="py-3 px-4 font-sans">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-foreground text-xs truncate max-w-[150px]">
                              {log.actor_email || "Sistem"}
                            </span>
                            {log.actor_role && (
                              <Badge variant="outline" className="text-[9px] uppercase px-1 py-0 h-3.5">
                                {log.actor_role}
                              </Badge>
                            )}
                          </div>
                        </td>

                        {/* Aksi */}
                        <td className="py-3 px-4 font-sans">
                          <Badge variant="outline" className={cn("text-[10px] font-medium", badgeInfo.color)}>
                            {badgeInfo.label}
                          </Badge>
                          <span className="block text-[10px] font-mono text-muted-foreground mt-0.5 truncate max-w-[160px]">
                            {log.action}
                          </span>
                        </td>

                        {/* Target */}
                        <td className="py-3 px-4 font-sans text-xs">
                          <span className="text-foreground font-medium block truncate max-w-[140px]">
                            {log.target_label || log.target_id || "-"}
                          </span>
                          <span className="text-[10px] text-muted-foreground uppercase font-mono">
                            {log.target_type}
                          </span>
                        </td>

                        {/* Outcome */}
                        <td className="py-3 px-4 font-sans">
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] capitalize",
                              log.outcome === "success"
                                ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5"
                                : log.outcome === "failure"
                                ? "border-destructive text-destructive bg-destructive/5"
                                : "border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/5"
                            )}
                          >
                            {log.outcome}
                          </Badge>
                        </td>

                        {/* IP Address */}
                        <td className="py-3 px-4 text-muted-foreground text-[11px] whitespace-nowrap">
                          {log.ip_address || "unknown"}
                        </td>

                        {/* View Details */}
                        <td className="py-3 px-4 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setActiveLogDetail(log)}
                            className="h-7 px-2 text-xs text-primary hover:text-primary font-sans"
                          >
                            <Eye className="h-3.5 w-3.5 mr-1" />
                            Detail
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 text-xs text-muted-foreground">
            <div>
              Halaman <strong>{logsData?.page ?? 1}</strong> dari <strong>{logsData?.total_pages ?? 1}</strong>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || isLogsLoading}
                className="h-8 text-xs gap-1"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Sebelumnya
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(logsData?.total_pages ?? 1, p + 1))}
                disabled={page >= (logsData?.total_pages ?? 1) || isLogsLoading}
                className="h-8 text-xs gap-1"
              >
                Berikutnya
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Safe Details Modal / Dialog ────────────────────────────────────────── */}
      {activeLogDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs">
          <div className="w-full max-w-2xl bg-card border border-border rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-5 border-b border-border/60 flex items-center justify-between">
              <div className="space-y-0.5">
                <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-sky-500" />
                  Rincian Peristiwa Audit
                </h3>
                <p className="text-xs text-muted-foreground font-mono">
                  ID: {activeLogDetail.id}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveLogDetail(null)}
                className="h-7 w-7 rounded-md border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 hover:bg-rose-600 hover:text-white flex items-center justify-center transition shadow-2xs cursor-pointer"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-5 overflow-y-auto space-y-4 text-xs font-sans">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-muted/40 border border-border/60 space-y-1">
                  <span className="text-[10px] text-muted-foreground uppercase font-medium">Aksi / Tindakan</span>
                  <span className="font-bold text-foreground block font-mono">{activeLogDetail.action}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {getActionBadge(activeLogDetail.action).label}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-muted/40 border border-border/60 space-y-1">
                  <span className="text-[10px] text-muted-foreground uppercase font-medium">Status & Keparahan</span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Badge variant="outline" className="capitalize text-xs">
                      {activeLogDetail.outcome}
                    </Badge>
                    <Badge variant="secondary" className="capitalize text-xs font-mono">
                      {activeLogDetail.severity}
                    </Badge>
                  </div>
                  <span className="text-[10px] text-muted-foreground block">
                    Waktu: {new Date(activeLogDetail.created_at).toLocaleString("id-ID")}
                  </span>
                </div>
              </div>

              {/* Context Details */}
              <div className="p-3.5 rounded-xl border border-border/60 space-y-2 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-muted-foreground text-[11px] block">Aktor Penginisiasi:</span>
                    <strong className="text-foreground">{activeLogDetail.actor_email || "Sistem Internal"}</strong>
                    {activeLogDetail.actor_role && (
                      <span className="text-muted-foreground ml-1 font-mono">({activeLogDetail.actor_role})</span>
                    )}
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[11px] block">Target Tindakan:</span>
                    <strong className="text-foreground">{activeLogDetail.target_label || activeLogDetail.target_id || "-"}</strong>
                    <span className="text-muted-foreground ml-1 font-mono">[{activeLogDetail.target_type}]</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/40 text-[11px] font-mono">
                  <div>
                    <span className="text-muted-foreground block">Alamat IP Klien:</span>
                    <span className="text-foreground">{activeLogDetail.ip_address || "127.0.0.1"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">User Agent:</span>
                    <span className="text-foreground truncate block max-w-xs">{activeLogDetail.user_agent || "-"}</span>
                  </div>
                </div>
              </div>

              {/* Redacted Metadata Payload */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Terminal className="h-3.5 w-3.5 text-primary" />
                    Payload Metadata Teredaksi (Redacted)
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopyId(activeLogDetail.id)}
                    className="h-6 text-[10px] gap-1 text-muted-foreground"
                  >
                    {copiedId ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                    {copiedId ? "Tersalin" : "Salin Event ID"}
                  </Button>
                </div>
                <div className="p-3 rounded-xl bg-muted/60 border border-border/60 font-mono text-[11px] overflow-x-auto max-h-48">
                  <pre className="text-foreground">
                    {JSON.stringify(
                      activeLogDetail.metadata_payload || activeLogDetail.metadata || {},
                      null,
                      2
                    )}
                  </pre>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  * Kredensial rahasia, kata sandi, token autentikasi, dan OTP secara otomatis disanitasi dan tidak pernah disimpan.
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-border/60 bg-muted/20 flex justify-end">
              <Button size="sm" onClick={() => setActiveLogDetail(null)}>
                Tutup
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
