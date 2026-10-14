"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Users,
  CheckCircle2,
  Clock,
  Sparkles,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Compass,
  ArrowRight,
  ShieldAlert,
  BarChart3,
  ExternalLink,
  ChevronRight,
  Bot,
  Send,
  Radio,
  Share2,
  Tag,
  Zap,
  Flame,
  Info,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuthStore } from "@/store/auth-store";
import { useT } from "@/lib/i18n";
import { useAdminOnboardingAnalytics, type OnboardingSurveyItem } from "@/hooks/use-admin";
import { cn } from "@/lib/utils";

// Role label mappings
const ROLE_MAP: Record<string, { labelId: string; labelEn: string; color: string }> = {
  solo: {
    labelId: "Solo Entrepreneur",
    labelEn: "Solo Entrepreneur",
    color: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  },
  agency: {
    labelId: "Agensi & Tim Marketing",
    labelEn: "Agency & Marketing",
    color: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20",
  },
  community: {
    labelId: "Komunitas / Admin Grup",
    labelEn: "Community Admin",
    color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  },
  developer: {
    labelId: "Developer / Otomasi API",
    labelEn: "Developer / Automation",
    color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  },
  explore: {
    labelId: "Eksplorasi Fitur",
    labelEn: "Exploring Features",
    color: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20",
  },
};

// Referral source mappings
const REFERRAL_MAP: Record<string, { labelId: string; labelEn: string }> = {
  friend: { labelId: "Rekomendasi Teman / Rekan", labelEn: "Friend Referral" },
  telegram: { labelId: "Channel / Grup Telegram", labelEn: "Telegram Channel" },
  social: { labelId: "Media Sosial", labelEn: "Social Media" },
  search: { labelId: "Mesin Pencari (Google)", labelEn: "Search Engine" },
  forum: { labelId: "Forum / Komunitas Bisnis", labelEn: "Forum / Community" },
  ads: { labelId: "Iklan Online", labelEn: "Online Ads" },
  direct: { labelId: "Akses Langsung", labelEn: "Direct Access" },
};

// Feature mappings
const FEATURE_MAP: Record<string, { label: string; icon: any }> = {
  broadcast: { label: "Mass Broadcast", icon: Send },
  scrape: { label: "Scraper & Filter", icon: Zap },
  webchat: { label: "Multi-WebChat", icon: Bot },
  proxy: { label: "Proxy Engine", icon: Radio },
  autoreply: { label: "Auto Reply Bot", icon: Flame },
  smm: { label: "SMM Panel", icon: Tag },
};

export default function AdminOnboardingPage() {
  const _ = useT();
  const currentUser = useAuthStore((s) => s.user);

  // Role Guard: Only owner can access
  if (currentUser?.role !== "owner") {
    return (
      <div className="flex items-center justify-center min-h-[60vh] p-4">
        <div className="w-full max-w-md p-8 text-center bg-card border border-border rounded-2xl shadow-sm space-y-4">
          <div className="inline-flex p-3 rounded-2xl bg-destructive/10 text-destructive mb-2">
            <ShieldAlert className="h-10 w-10" />
          </div>
          <h2 className="text-xl font-bold text-foreground">
            {_("admin.accessDenied") || "Access Denied"}
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {_("admin.accessDeniedDesc") ||
              "Only users with the Owner role are authorized to access the Admin Panel."}
          </p>
          <div className="pt-2">
            <Button asChild variant="outline" className="w-full">
              <Link href="/dashboard">
                {_("admin.backToDashboard") || "Return to Dashboard"}
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return <OnboardingAnalyticsContent />;
}

function OnboardingAnalyticsContent() {
  const _ = useT();
  const { data, isLoading, error, refetch, isFetching } = useAdminOnboardingAnalytics(100);

  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [selectedSurvey, setSelectedSurvey] = useState<OnboardingSurveyItem | null>(null);

  // Filtered recent surveys
  const filteredSurveys = useMemo(() => {
    if (!data?.recent_surveys) return [];
    return data.recent_surveys.filter((survey) => {
      const matchesSearch =
        searchQuery === "" ||
        survey.user_email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (survey.user_full_name &&
          survey.user_full_name.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesRole =
        roleFilter === "all" ||
        (survey.role && survey.role.toLowerCase() === roleFilter.toLowerCase());

      return matchesSearch && matchesRole;
    });
  }, [data?.recent_surveys, searchQuery, roleFilter]);

  return (
    <div className="space-y-8 pb-12 max-w-[1400px] mx-auto">
      {/* ── Page Header ────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
              <Sparkles className="h-3.5 w-3.5" />
              User Onboarding Telemetry
            </span>
            <Badge variant="outline" className="text-xs font-normal">
              Admin Insights
            </Badge>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">
            {_("admin.onboardingTitle") || "Onboarding & Discovery Analytics"}
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            {_("admin.onboardingSubtitle") ||
              "Survei onboarding pengguna baru, jalur referral, skala akun yang dikelola, dan preferensi modul utama TeleBos."}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-9 px-3 gap-2"
          >
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
            <span className="text-xs font-medium">
              {_("admin.refreshData") || "Refresh Data"}
            </span>
          </Button>
          <Button asChild variant="outline" size="sm" className="h-9 px-3 gap-2">
            <Link href="/admin/dashboard">
              <BarChart3 className="h-4 w-4" />
              <span className="text-xs font-medium">Dashboard</span>
            </Link>
          </Button>
          <Button asChild size="sm" className="h-9 px-3 gap-2">
            <Link href="/admin/users">
              <Users className="h-4 w-4" />
              <span className="text-xs font-medium">{_("admin.users") || "Users"}</span>
            </Link>
          </Button>
        </div>
      </div>

      {/* ── 1. Top KPI Summary Cards ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Users */}
        <Card className="rounded-2xl border-border bg-card shadow-xs">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">Total Pengguna Terdaftar</p>
              <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500">
                <Users className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3">
              <h3 className="text-2xl font-bold tracking-tight text-foreground">
                {isLoading ? "..." : (data?.total_users ?? 0).toLocaleString()}
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Basis akun terdaftar di sistem TeleBos
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Completed Onboarding */}
        <Card className="rounded-2xl border-border bg-card shadow-xs border-emerald-500/20">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                Selesai Onboarding
              </p>
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <h3 className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
                {isLoading ? "..." : (data?.completed_count ?? 0).toLocaleString()}
              </h3>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                {isLoading ? "0%" : `${data?.completion_rate ?? 0}%`}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Telah mengisi survei atau menyelesaikan alur onboarding
            </p>
          </CardContent>
        </Card>

        {/* Skipped */}
        <Card className="rounded-2xl border-border bg-card shadow-xs">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">Melewati Survei (Skipped)</p>
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500">
                <Clock className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3">
              <h3 className="text-2xl font-bold tracking-tight text-foreground">
                {isLoading ? "..." : (data?.skipped_count ?? 0).toLocaleString()}
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Memilih lewati langsung ke workspace utama
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Pending */}
        <Card className="rounded-2xl border-border bg-card shadow-xs">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">Pending / Belum Masuk</p>
              <div className="p-2 rounded-xl bg-zinc-500/10 text-zinc-500">
                <Compass className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3">
              <h3 className="text-2xl font-bold tracking-tight text-foreground">
                {isLoading ? "..." : (data?.pending_count ?? 0).toLocaleString()}
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Pengguna terdaftar yang belum membuka onboarding
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── 2. Breakdown Analytics Bento Grid ───────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Roles Distribution */}
        <Card className="rounded-2xl border-border bg-card shadow-xs">
          <CardHeader className="pb-3 border-b border-border/50">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Kategori & Peran Pengguna (Roles)
            </CardTitle>
            <CardDescription className="text-xs">
              Distribusi use case profil pengguna saat registrasi
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4 space-y-3.5">
            {Object.keys(ROLE_MAP).map((key) => {
              const count = data?.roles_breakdown?.[key] ?? 0;
              const total = Math.max(1, Object.values(data?.roles_breakdown ?? {}).reduce((a, b) => a + b, 0));
              const pct = Math.round((count / total) * 100);
              const info = ROLE_MAP[key];

              return (
                <div key={key} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground">{info.labelId}</span>
                    <span className="text-muted-foreground">
                      {count} ({pct}%)
                    </span>
                  </div>
                  <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-500 rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Acquisition / Referral Distribution */}
        <Card className="rounded-2xl border-border bg-card shadow-xs">
          <CardHeader className="pb-3 border-b border-border/50">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Share2 className="h-4 w-4 text-sky-500" />
              Saluran Akuisisi (Referral Source)
            </CardTitle>
            <CardDescription className="text-xs">
              Dari mana pengguna pertama kali mengetahui platform TeleBos
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4 space-y-3.5">
            {Object.keys(REFERRAL_MAP).map((key) => {
              const count = data?.referrals_breakdown?.[key] ?? 0;
              const total = Math.max(1, Object.values(data?.referrals_breakdown ?? {}).reduce((a, b) => a + b, 0));
              const pct = Math.round((count / total) * 100);
              const info = REFERRAL_MAP[key];

              return (
                <div key={key} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground">{info.labelId}</span>
                    <span className="text-muted-foreground">
                      {count} ({pct}%)
                    </span>
                  </div>
                  <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-sky-500 transition-all duration-500 rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Account Scale Volume */}
        <Card className="rounded-2xl border-border bg-card shadow-xs">
          <CardHeader className="pb-3 border-b border-border/50">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Tag className="h-4 w-4 text-emerald-500" />
              Skala Akun yang Dikelola (Volume)
            </CardTitle>
            <CardDescription className="text-xs">
              Estimasi jumlah akun Telegram yang direncanakan oleh pengguna
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4 space-y-3.5">
            {[
              { id: "1-5", label: "1 - 5 Akun Telegram (Pemula/Solo)" },
              { id: "6-20", label: "6 - 20 Akun Telegram (Bisnis Menengah)" },
              { id: "21-50", label: "21 - 50 Akun Telegram (Agensi Pro)" },
              { id: "50+", label: "50+ Akun Telegram (Enterprise/Power)" },
            ].map(({ id, label }) => {
              const count = data?.volumes_breakdown?.[id] ?? 0;
              const total = Math.max(1, Object.values(data?.volumes_breakdown ?? {}).reduce((a, b) => a + b, 0));
              const pct = Math.round((count / total) * 100);

              return (
                <div key={id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground">{label}</span>
                    <span className="text-muted-foreground">
                      {count} ({pct}%)
                    </span>
                  </div>
                  <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-500 rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Feature Preferences */}
        <Card className="rounded-2xl border-border bg-card shadow-xs">
          <CardHeader className="pb-3 border-b border-border/50">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              Fitur yang Paling Diminati (Feature Demands)
            </CardTitle>
            <CardDescription className="text-xs">
              Kebutuhan utama yang dicari pengguna di dashboard
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4 space-y-3.5">
            {Object.keys(FEATURE_MAP).map((key) => {
              const count = data?.features_breakdown?.[key] ?? 0;
              const total = Math.max(1, Object.values(data?.features_breakdown ?? {}).reduce((a, b) => a + b, 0));
              const pct = Math.round((count / total) * 100);
              const info = FEATURE_MAP[key];

              return (
                <div key={key} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground">{info.label}</span>
                    <span className="text-muted-foreground">
                      {count} votes ({pct}%)
                    </span>
                  </div>
                  <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-500 transition-all duration-500 rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* ── 3. Recent Survey Submissions Table ───────────────────────────────── */}
      <Card className="rounded-2xl border-border bg-card shadow-xs overflow-hidden">
        <CardHeader className="pb-4 border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              Daftar Respon Onboarding Terbaru
            </CardTitle>
            <CardDescription className="text-xs mt-0.5">
              Data individual respon formulir onboarding yang tersimpan di database
            </CardDescription>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Cari email / nama pengguna..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-9 text-xs rounded-xl"
              />
            </div>

            {/* Role Filter */}
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="h-9 w-full sm:w-[180px] text-xs rounded-xl">
                <SelectValue placeholder="Semua Peran" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Peran</SelectItem>
                <SelectItem value="solo">Solo Entrepreneur</SelectItem>
                <SelectItem value="agency">Agensi Marketing</SelectItem>
                <SelectItem value="community">Komunitas</SelectItem>
                <SelectItem value="developer">Developer</SelectItem>
                <SelectItem value="explore">Eksplorasi</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-12 text-center text-sm text-muted-foreground animate-pulse">
              Memuat data analitik onboarding...
            </div>
          ) : filteredSurveys.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              Tidak ada data respon onboarding yang cocok dengan filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-xs font-semibold">Pengguna</TableHead>
                    <TableHead className="text-xs font-semibold">Peran / Use Case</TableHead>
                    <TableHead className="text-xs font-semibold">Saluran Referral</TableHead>
                    <TableHead className="text-xs font-semibold">Skala Akun</TableHead>
                    <TableHead className="text-xs font-semibold">Status</TableHead>
                    <TableHead className="text-xs font-semibold">Waktu</TableHead>
                    <TableHead className="text-xs font-semibold text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSurveys.map((survey) => {
                    const roleInfo = survey.role ? ROLE_MAP[survey.role] : null;
                    const refInfo = survey.referral ? REFERRAL_MAP[survey.referral] : null;
                    const dateFormatted = survey.created_at
                      ? new Date(survey.created_at).toLocaleString("id-ID", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : "-";

                    return (
                      <TableRow key={survey.id} className="border-border hover:bg-muted/40">
                        <TableCell className="py-3">
                          <div className="flex flex-col">
                            <span className="text-xs font-medium text-foreground">
                              {survey.user_full_name || "Tanpa Nama"}
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              {survey.user_email}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="py-3">
                          {roleInfo ? (
                            <Badge
                              variant="outline"
                              className={cn("text-[11px] font-normal", roleInfo.color)}
                            >
                              {roleInfo.labelId}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="py-3">
                          <span className="text-xs text-foreground">
                            {refInfo?.labelId || survey.referral || "-"}
                          </span>
                        </TableCell>
                        <TableCell className="py-3">
                          <span className="text-xs font-medium text-foreground">
                            {survey.volume || "-"} Akun
                          </span>
                        </TableCell>
                        <TableCell className="py-3">
                          {survey.is_skipped ? (
                            <Badge
                              variant="outline"
                              className="text-[11px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                            >
                              Dilewati
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-[11px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                            >
                              Selesai
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {dateFormatted}
                        </TableCell>
                        <TableCell className="py-3 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedSurvey(survey)}
                            className="h-7 px-2.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-card hover:bg-accent text-foreground shadow-2xs"
                          >
                            Detail
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Detail Survey Dialog ────────────────────────────────────────────── */}
      <Dialog open={Boolean(selectedSurvey)} onOpenChange={(open) => !open && setSelectedSurvey(null)}>
        <DialogContent className="sm:max-w-md border-border bg-card rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">
              Detail Respon Onboarding
            </DialogTitle>
            <DialogDescription className="text-xs">
              {selectedSurvey?.user_email}
            </DialogDescription>
          </DialogHeader>

          {selectedSurvey && (
            <div className="space-y-4 pt-2 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-muted/50 border border-border/50">
                <div>
                  <span className="text-muted-foreground">Nama Lengkap:</span>
                  <p className="font-semibold text-foreground mt-0.5">
                    {selectedSurvey.user_full_name || "-"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Status Pengerjaan:</span>
                  <p className="font-semibold mt-0.5">
                    {selectedSurvey.is_skipped ? "Dilewati (Skipped)" : "Selesai 100%"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Peran / Kategori:</span>
                  <p className="font-semibold text-foreground mt-0.5">
                    {selectedSurvey.role ? ROLE_MAP[selectedSurvey.role]?.labelId || selectedSurvey.role : "-"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Sumber Referral:</span>
                  <p className="font-semibold text-foreground mt-0.5">
                    {selectedSurvey.referral
                      ? REFERRAL_MAP[selectedSurvey.referral]?.labelId || selectedSurvey.referral
                      : "-"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Skala Akun Telegram:</span>
                  <p className="font-semibold text-foreground mt-0.5">
                    {selectedSurvey.volume ? `${selectedSurvey.volume} Akun` : "-"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Waktu Kirim:</span>
                  <p className="font-semibold text-foreground mt-0.5">
                    {new Date(selectedSurvey.created_at).toLocaleString("id-ID")}
                  </p>
                </div>
              </div>

              <div>
                <span className="font-medium text-foreground">Fitur yang Diminati:</span>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {selectedSurvey.features && selectedSurvey.features.length > 0 ? (
                    selectedSurvey.features.map((feat) => (
                      <Badge key={feat} variant="secondary" className="text-xs">
                        {FEATURE_MAP[feat]?.label || feat}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-muted-foreground">Tidak memilih fitur khusus</span>
                  )}
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedSurvey(null)}
                >
                  Tutup
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
