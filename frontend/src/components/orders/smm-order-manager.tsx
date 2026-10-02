"use client";

import { clampQuantity, parseQuantityInput } from "./smm-quantity";
import { useMemo, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import {
  useTelegramServices,
  usePlaceOrder,
  SMMService,
} from "@/hooks/use-orders";
import { useToast } from "@/components/ui/toast";
import {
  parseSmmSpeed,
  getFastestSpeedDisplay,
  parseDurationToSeconds,
} from "@/lib/smm-speed-parser";
import {
  ShoppingCart,
  Plus,
  Minus,
  Search,
  AlertCircle,
  Loader2,
  Wallet,
  ChevronDown,
  ChevronUp,
  X,
  Zap,
  CheckCircle2,
  Users,
  Heart,
  Eye,
  History,
  Info,
  Clock,
  ArrowRight,
  ShieldCheck,
  Tag,
  Layers,
  ArrowUpDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SortOption = "default" | "price_asc" | "price_desc" | "speed" | "min_asc";

interface SmmOrderManagerProps {
  title: string;
  description: string;
  allowedServiceIds: number[];
  categoryKey?: "members" | "reactions" | "auto-reactions" | "post-views";
  targetPlaceholder?: string;
  targetHelperText?: string;
  targetExample?: string;
}

const SMM_NAV_ITEMS = [
  {
    id: "members",
    href: "/orders/members",
    label: "Telegram Members",
    icon: Users,
    tag: "Channel & Group",
  },
  {
    id: "reactions",
    href: "/orders/reactions",
    label: "Reactions",
    icon: Heart,
    tag: "Post Emojis",
  },
  {
    id: "auto-reactions",
    href: "/orders/auto-reactions",
    label: "Auto Reactions",
    icon: Zap,
    tag: "Future Posts",
  },
  {
    id: "post-views",
    href: "/orders/post-views",
    label: "Post Views",
    icon: Eye,
    tag: "Impressions",
  },
  {
    id: "history",
    href: "/orders",
    label: "Riwayat Order",
    icon: History,
    tag: "Semua Pesanan",
  },
];

export function SmmOrderManager({
  title,
  description,
  allowedServiceIds,
  targetPlaceholder,
  targetHelperText,
  targetExample,
}: SmmOrderManagerProps) {
  const _ = useT();
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const { data: services, isLoading, error } = useTelegramServices();

  const [selectedService, setSelectedService] = useState<SMMService | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const filteredServices = useMemo(() => {
    return services?.filter((s) => allowedServiceIds.includes(Number(s.id))) ?? [];
  }, [services, allowedServiceIds]);

  // Executive KPI stats derived from available services
  const stats = useMemo(() => {
    if (filteredServices.length === 0) {
      return {
        total: 0,
        minPrice: 0,
        fastestSpeed: "Real-time",
        activeCount: 0,
      };
    }
    const prices = filteredServices.map((s) => s.price);
    const minPrice = Math.min(...prices);
    const speeds = filteredServices.map((s) => s.speed);
    const fastestSpeed = getFastestSpeedDisplay(speeds);

    return {
      total: filteredServices.length,
      minPrice,
      fastestSpeed,
      activeCount: filteredServices.length,
    };
  }, [filteredServices]);

  const handleOrderSelect = (service: SMMService) => {
    setSelectedService(service);
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* SMM Category Navigator Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar border-b border-border/50">
        {SMM_NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.id}
              href={item.href}
              className={cn(
                "flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-150 shrink-0",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/40"
              )}
            >
              <Icon className={cn("h-3.5 w-3.5", isActive ? "text-white" : "text-muted-foreground")} />
              <span>{item.label}</span>
              {isActive && (
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              )}
            </Link>
          );
        })}
      </div>

      {/* Double-Bezel Header & Wallet Balance */}
      <div className="rounded-2xl border border-border/70 dark:border-slate-800 bg-muted/20 dark:bg-slate-900/40 p-1.5">
        <div className="rounded-xl bg-card border border-border/40 p-5 md:p-6 flex flex-col md:flex-row md:items-center justify-between gap-5 shadow-xs">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-primary/10 text-primary text-[11px] font-bold uppercase tracking-wider">
                <Zap className="h-3 w-3" />
                TeleBos SMM Hub
              </span>
              <span className="text-xs text-muted-foreground">• Server Aktif</span>
            </div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-foreground text-balance">
              {title}
            </h1>
            <p className="text-xs md:text-sm text-muted-foreground max-w-2xl leading-relaxed">
              {description}
            </p>
          </div>

          {/* Executive Wallet Card */}
          {user && (
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 dark:bg-emerald-950/20 p-3.5 flex items-center justify-between md:justify-end gap-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
                  <Wallet className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {_("orders.yourBalance") || "Saldo Tersedia"}
                  </div>
                  <div className="text-base md:text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    Rp {user.balance?.toLocaleString("id-ID") || 0}
                  </div>
                </div>
              </div>
              <Link
                href="/wallet"
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors shrink-0"
              >
                <span>Top Up</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* 4-Card Executive KPI Bento Deck */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Card 1: Total Services */}
        <div className="rounded-xl border border-border/60 bg-card p-4 space-y-2 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Layanan Aktif
            </span>
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <Layers className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="text-xl font-bold text-foreground tabular-nums">
            {stats.total}{" "}
            <span className="text-xs font-normal text-muted-foreground">Pilihan</span>
          </div>
          <div className="text-[11px] text-muted-foreground">
            Semua teruji & terhubung
          </div>
        </div>

        {/* Card 2: Starting Price */}
        <div className="rounded-xl border border-border/60 bg-card p-4 space-y-2 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Harga Mulai
            </span>
            <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500">
              <Tag className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="text-xl font-bold text-foreground tabular-nums">
            {stats.minPrice > 0 ? (
              <>
                Rp {stats.minPrice.toLocaleString("id-ID")}{" "}
                <span className="text-xs font-normal text-muted-foreground">/1k</span>
              </>
            ) : (
              "—"
            )}
          </div>
          <div className="text-[11px] text-muted-foreground">
            Tarif termurah tersedia
          </div>
        </div>

        {/* Card 3: Average Speed */}
        <div className="rounded-xl border border-border/60 bg-card p-4 space-y-2 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Kecepatan Rata-Rata
            </span>
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500">
              <Clock className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="text-xl font-bold text-foreground tabular-nums truncate" title={stats.fastestSpeed}>
            {stats.fastestSpeed}
          </div>
          <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
            <Zap className="h-3 w-3" /> Diproses otomatis
          </div>
        </div>

        {/* Card 4: Status Server */}
        <div className="rounded-xl border border-border/60 bg-card p-4 space-y-2 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Status Sistem
            </span>
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500">
              <ShieldCheck className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block" />
            Online
          </div>
          <div className="text-[11px] text-muted-foreground">
            TeleBos Cloud Engine
          </div>
        </div>
      </div>

      {/* Services Catalog View (Direct without tab headers) */}
      <div className="pt-1">
        <ServicesListView
          services={filteredServices}
          isLoading={isLoading}
          error={error}
          onOrderSelect={handleOrderSelect}
          targetPlaceholder={targetPlaceholder}
          targetHelperText={targetHelperText}
          targetExample={targetExample}
        />
      </div>

      {/* Order Modal Portal */}
      {isModalOpen && selectedService && (
        <OrderModal
          service={selectedService}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedService(null);
          }}
          targetPlaceholder={targetPlaceholder}
          targetHelperText={targetHelperText}
          targetExample={targetExample}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SERVICES LIST VIEW (CATALOG)
// ─────────────────────────────────────────────────────────────────────────────

interface ServicesListViewProps {
  services: SMMService[];
  isLoading: boolean;
  error: any;
  onOrderSelect: (service: SMMService) => void;
  targetPlaceholder?: string;
  targetHelperText?: string;
  targetExample?: string;
}

function ServicesListView({
  services,
  isLoading,
  error,
  onOrderSelect,
  targetPlaceholder,
  targetHelperText,
  targetExample,
}: ServicesListViewProps) {
  const [search, setSearch] = useState("");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortOption>("default");
  const [expandedNotes, setExpandedNotes] = useState<Record<number, boolean>>({});

  const toggleNote = (serviceId: number) => {
    setExpandedNotes((prev) => ({ ...prev, [serviceId]: !prev[serviceId] }));
  };

  // Extract unique categories for quick filtering
  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    for (const s of services) {
      if (s.category) set.add(s.category);
    }
    return Array.from(set).sort();
  }, [services]);

  // Filtered & Sorted Services
  const processedServices = useMemo(() => {
    let result = services.filter((s) => {
      const matchesSearch =
        !search ||
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.category.toLowerCase().includes(search.toLowerCase()) ||
        String(s.id).includes(search);

      const matchesCategory =
        selectedCategoryFilter === "all" || s.category === selectedCategoryFilter;

      return matchesSearch && matchesCategory;
    });

    // Accurate Sorting
    if (sortBy === "price_asc") {
      result.sort((a, b) => a.price - b.price);
    } else if (sortBy === "price_desc") {
      result.sort((a, b) => b.price - a.price);
    } else if (sortBy === "min_asc") {
      result.sort((a, b) => a.min - b.min);
    } else if (sortBy === "speed") {
      // Sort accurately by duration in seconds (fastest duration first)
      result.sort((a, b) => {
        const secA = parseDurationToSeconds(a.speed);
        const secB = parseDurationToSeconds(b.speed);
        if (secA !== secB) return secA - secB;
        return a.price - b.price; // secondary tie-breaker by price
      });
    }

    return result;
  }, [services, search, selectedCategoryFilter, sortBy]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-full sm:max-w-md bg-muted/40 animate-pulse rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl border border-border/60 bg-muted/20 p-1.5 animate-pulse"
            >
              <div className="rounded-xl bg-card border border-border/40 p-5 space-y-4">
                <div className="h-4 bg-muted rounded w-24" />
                <div className="h-6 bg-muted rounded w-3/4" />
                <div className="h-10 bg-muted/50 rounded-lg" />
                <div className="flex justify-between items-center pt-2">
                  <div className="h-6 bg-muted rounded w-28" />
                  <div className="h-9 bg-muted rounded-xl w-32" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-destructive flex items-center gap-3">
        <AlertCircle className="h-5 w-5 shrink-0" />
        <div>
          <div className="font-bold text-sm">Gagal Memuat Layanan</div>
          <div className="text-xs opacity-90 mt-0.5">
            Terjadi kendala saat menyinkronkan katalog layanan SMM. Silakan muat ulang halaman.
          </div>
        </div>
      </div>
    );
  }

  if (services.length === 0) {
    return (
      <div className="rounded-2xl border border-border/70 bg-card p-12 text-center space-y-3">
        <div className="w-12 h-12 rounded-full bg-muted/60 flex items-center justify-center mx-auto text-muted-foreground">
          <Search className="h-6 w-6" />
        </div>
        <h3 className="text-base font-bold text-foreground">Tidak Ada Layanan</h3>
        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
          Layanan untuk kategori ini sedang diperbarui atau belum tersedia saat ini.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Search & Sort Controls Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Anti-Glitch Search Bar */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari ID, nama layanan, atau kata kunci..."
            className="w-full pl-9 pr-9 py-2 rounded-xl text-sm bg-background border border-input text-foreground placeholder:text-muted-foreground outline-none focus:outline-none focus:ring-offset-0 focus:ring-offset-transparent focus:ring-2 focus:ring-primary/25 focus:border-primary transition-[border-color,box-shadow] duration-150"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground hover:text-foreground rounded-full hover:bg-muted"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Sort Select */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground whitespace-nowrap flex items-center gap-1">
            <ArrowUpDown className="h-3.5 w-3.5" /> Urutkan:
          </span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="rounded-xl border border-input bg-background text-foreground text-xs px-3 py-2 outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary font-medium cursor-pointer"
          >
            <option value="default">Default</option>
            <option value="price_asc">Harga: Termurah</option>
            <option value="price_desc">Harga: Termahal</option>
            <option value="speed">Kecepatan: Tercepat</option>
            <option value="min_asc">Min Order: Terkecil</option>
          </select>
        </div>
      </div>

      {/* Subcategory Pills Filter (if > 1 categories exist) */}
      {availableCategories.length > 1 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          <button
            onClick={() => setSelectedCategoryFilter("all")}
            className={cn(
              "px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors",
              selectedCategoryFilter === "all"
                ? "bg-primary text-primary-foreground"
                : "bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/40"
            )}
          >
            Semua Subkategori ({services.length})
          </button>
          {availableCategories.map((cat) => {
            const count = services.filter((s) => s.category === cat).length;
            const isCatActive = selectedCategoryFilter === cat;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategoryFilter(cat)}
                className={cn(
                  "px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors",
                  isCatActive
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/40"
                )}
              >
                {cat} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Results Count */}
      <div className="text-xs text-muted-foreground flex items-center justify-between">
        <div>
          Menampilkan <span className="font-bold text-foreground">{processedServices.length}</span> dari{" "}
          <span className="font-bold text-foreground">{services.length}</span> layanan
        </div>
        {search && (
          <button
            onClick={() => setSearch("")}
            className="text-primary hover:underline text-xs"
          >
            Reset pencarian
          </button>
        )}
      </div>

      {/* Double-Bezel Services Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {processedServices.map((service) => {
          const speedInfo = parseSmmSpeed(service.speed);
          const isNoteExpanded = expandedNotes[service.id] || false;

          return (
            <div
              key={service.id}
              className="rounded-2xl border border-border/70 dark:border-slate-800 bg-muted/20 dark:bg-slate-900/40 p-1.5 hover:border-primary/40 transition-colors group"
            >
              <div className="rounded-xl bg-card border border-border/40 p-5 flex flex-col justify-between gap-4 h-full shadow-xs">
                {/* Header: ID + Badges */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-md bg-muted text-foreground border border-border/50">
                        #{service.id}
                      </span>
                      {service.category && (
                        <span className="text-[11px] font-semibold text-muted-foreground px-2 py-0.5 rounded-md bg-muted/40 border border-border/30 truncate max-w-[200px]">
                          {service.category}
                        </span>
                      )}
                    </div>

                    {/* Speed & Order Stats Badges */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {speedInfo?.avgSpeed && (
                        <div
                          className={cn(
                            "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold border",
                            speedInfo.isFast
                              ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
                              : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                          )}
                          title={speedInfo.tooltip}
                        >
                          <Zap className="h-3 w-3 shrink-0" />
                          <span>⚡ {speedInfo.avgSpeed}</span>
                        </div>
                      )}

                      {speedInfo?.avgOrders && (
                        <div
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                          title={`Rata-rata ${speedInfo.avgOrders} order berhasil diselesaikan`}
                        >
                          <CheckCircle2 className="h-3 w-3 shrink-0" />
                          <span>{speedInfo.avgOrders} Selesai</span>
                        </div>
                      )}

                      {!speedInfo && (
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-muted text-muted-foreground border border-border/40">
                          <Clock className="h-3 w-3 shrink-0" />
                          <span>Real-time</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Service Title */}
                  <h3 className="text-sm md:text-base font-bold text-foreground leading-snug">
                    {service.name}
                  </h3>
                </div>

                {/* Service Specs Strip (Flat layout, no nested cards) */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 py-2.5 px-3 rounded-lg bg-muted/30 border border-border/30 text-xs">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                      Min Order
                    </span>
                    <span className="font-bold text-foreground tabular-nums">
                      {service.min.toLocaleString("id-ID")}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                      Max Order
                    </span>
                    <span className="font-bold text-foreground tabular-nums">
                      {service.max.toLocaleString("id-ID")}
                    </span>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                      Kecepatan Proses
                    </span>
                    <span className="font-bold text-foreground truncate block" title={speedInfo?.tooltip || "Otomatis"}>
                      {speedInfo?.avgSpeed || speedInfo?.displayText || "Instan"}
                    </span>
                  </div>
                </div>

                {/* Service Note Accordion */}
                {service.note && (
                  <div className="text-xs border-t border-border/40 pt-2">
                    <button
                      type="button"
                      onClick={() => toggleNote(service.id)}
                      className="flex items-center justify-between w-full text-muted-foreground hover:text-foreground font-semibold text-[11px] py-1 transition-colors"
                    >
                      <span className="flex items-center gap-1.5">
                        <Info className="h-3.5 w-3.5 text-primary" />
                        {isNoteExpanded ? "Sembunyikan Petunjuk Layanan" : "Lihat Petunjuk & Keterangan"}
                      </span>
                      {isNoteExpanded ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                    </button>

                    {isNoteExpanded && (
                      <div className="mt-2 p-3 rounded-lg bg-muted/40 border border-border/50 text-[11px] text-muted-foreground leading-relaxed whitespace-pre-wrap font-sans">
                        {service.note}
                        {targetExample && (
                          <div className="mt-2 pt-2 border-t border-border/40 text-[11px]">
                            <span className="font-bold text-foreground">Format Target:</span>{" "}
                            <code className="px-1.5 py-0.5 rounded bg-background border border-border/50 text-primary font-mono text-[10px]">
                              {targetExample}
                            </code>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Price and Island Button Footer */}
                <div className="pt-3 border-t border-border/40 flex items-center justify-between gap-3">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                      Harga / 1.000
                    </span>
                    <span className="text-lg md:text-xl font-extrabold text-primary tabular-nums">
                      Rp {service.price.toLocaleString("id-ID")}
                    </span>
                  </div>

                  {/* Island Button with Nested Icon */}
                  <Button
                    size="sm"
                    onClick={() => onOrderSelect(service)}
                    className="h-10 px-4 rounded-xl font-bold bg-primary hover:bg-primary/90 text-white shadow-xs group/btn flex items-center transition-all"
                  >
                    <span>Order Sekarang</span>
                    <span className="w-6 h-6 rounded-lg bg-white/20 flex items-center justify-center ml-2 group-hover/btn:translate-x-0.5 transition-transform">
                      <ShoppingCart className="h-3.5 w-3.5 text-white" />
                    </span>
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ORDER MODAL DIALOG
// ─────────────────────────────────────────────────────────────────────────────

interface OrderModalProps {
  service: SMMService;
  onClose: () => void;
  targetPlaceholder?: string;
  targetHelperText?: string;
  targetExample?: string;
}

function OrderModal({
  service,
  onClose,
  targetPlaceholder,
  targetHelperText,
  targetExample,
}: OrderModalProps) {
  const _ = useT();
  const { toast } = useToast();
  const user = useAuthStore((s) => s.user);
  const placeOrder = usePlaceOrder();

  const [dataTarget, setDataTarget] = useState("");
  // Edited as a free-form string so a partially typed number is not rewritten
    // mid-keystroke. Clamping happens on blur and on submit, not on every change:
    // clamping on change meant clearing the field snapped straight back to 1, and
    // the number input then held a value below its min, discarding whatever was
    // typed next.
    const [quantityInput, setQuantityInput] = useState(String(service.min));
    const [comments, setComments] = useState("");

    const commitQuantity = (raw: string) => {
      setQuantityInput(String(clampQuantity(raw, service.min, service.max)));
    };

    // Preset and +/- buttons work on the numeric value, then mirror it back.
    const setQuantity = (next: number) => {
      setQuantityInput(String(Math.min(service.max, Math.max(service.min, next))));
    };

    const quantity = parseQuantityInput(quantityInput) ?? service.min;

  const speedInfo = parseSmmSpeed(service.speed);

  // Price calculations
  const estimatedPrice = Math.max(1, Math.round((service.price * quantity) / 1000));
  const userBalance = user?.balance || 0;
  const hasSufficientBalance = userBalance >= estimatedPrice;
  const balanceRemaining = userBalance - estimatedPrice;

  // Preset increments
    const handleQuickAdd = (amount: number) => {
      setQuantity(quantity + amount);
    };

  const handleSetMax = () => {
    setQuantity(service.max);
  };

  const handleSetMin = () => {
    setQuantity(service.min);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dataTarget.trim()) return;

    // The field stays free-form while the user types, so the value on screen is
        // not necessarily inside the service's range yet — clamp before submitting.
        const parsed = parseQuantityInput(quantityInput);
        if (parsed === null || parsed < service.min) {
          toast({
            variant: "error",
            title: _("orders.orderFailed") || "Gagal Membuat Pesanan",
            description: `Jumlah pemesanan minimal adalah ${service.min.toLocaleString("id-ID")}.`,
          });
          commitQuantity(quantityInput);
          return;
        }
        if (parsed > service.max) {
          toast({
            variant: "error",
            title: _("orders.orderFailed") || "Gagal Membuat Pesanan",
            description: `Jumlah pemesanan maksimal adalah ${service.max.toLocaleString("id-ID")}.`,
          });
          commitQuantity(quantityInput);
          return;
        }

    try {
      await placeOrder.mutateAsync({
        service_id: Number(service.id),
        data_target: dataTarget.trim(),
        quantity,
        comments: comments.trim() || undefined,
      });

      toast({
        variant: "success",
        title: _("orders.orderPlaced") || "Pesanan Berhasil Dibuat!",
        description: `Order untuk ${service.name} sebanyak ${quantity.toLocaleString("id-ID")} berhasil dikirim.`,
      });
      onClose();
    } catch (err: any) {
      toast({
        variant: "error",
        title: _("orders.orderFailed") || "Gagal Membuat Pesanan",
        description:
          err?.response?.data?.detail || "Terjadi kesalahan saat memproses pesanan.",
      });
    }
  };

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Double-Bezel Modal Container */}
      <div
        className="rounded-2xl border border-border/80 dark:border-slate-700 bg-card p-1.5 shadow-2xl w-full max-w-xl max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        style={{
          animation: "modalFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <div className="rounded-xl bg-card border border-border/40 p-5 md:p-6 overflow-y-auto space-y-5">
          {/* Header */}
          <div className="flex items-start justify-between border-b border-border/50 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-muted text-foreground border border-border/50">
                  ID: #{service.id}
                </span>
                <span className="text-xs text-muted-foreground font-semibold">
                  {service.category}
                </span>
              </div>
              <h2 className="text-base md:text-lg font-bold text-foreground mt-1 leading-snug">
                {service.name}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Service Specs Strip with Parsed Speed */}
          <div className="rounded-xl border border-border/50 bg-muted/30 p-3.5 space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div>
                <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                  Min Limit
                </span>
                <span className="font-bold text-foreground tabular-nums">
                  {service.min.toLocaleString("id-ID")}
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                  Max Limit
                </span>
                <span className="font-bold text-foreground tabular-nums">
                  {service.max.toLocaleString("id-ID")}
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                  Tarif / 1k
                </span>
                <span className="font-bold text-primary tabular-nums">
                  Rp {service.price.toLocaleString("id-ID")}
                </span>
              </div>
            </div>

            {/* Speed & Order Volume Row */}
            <div className="pt-2 border-t border-border/40 flex items-center justify-between text-xs flex-wrap gap-2">
              <div className="flex items-center gap-1.5 text-muted-foreground font-medium">
                <Zap className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                <span>Kecepatan Rata-Rata:</span>
                <span className="font-bold text-foreground">
                  {speedInfo?.avgSpeed || speedInfo?.displayText || "Instan / Otomatis"}
                </span>
              </div>
              {speedInfo?.avgOrders && (
                <div className="flex items-center gap-1.5 text-muted-foreground font-medium">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  <span>Selesai:</span>
                  <span className="font-bold text-foreground">
                    {speedInfo.avgOrders} Order
                  </span>
                </div>
              )}
            </div>

            {service.note && (
              <div className="pt-2 border-t border-border/40 text-[11px] text-muted-foreground italic leading-relaxed">
                {service.note}
              </div>
            )}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Target Input */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-foreground">
                  {_("orders.dataTarget") || "Target / Link Telegram"}
                </label>
                {targetExample && (
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {targetExample}
                  </span>
                )}
              </div>
              <input
                type="text"
                value={dataTarget}
                onChange={(e) => setDataTarget(e.target.value)}
                placeholder={
                  targetPlaceholder ||
                  _("orders.dataTargetPlaceholder") ||
                  "https://t.me/channel_name atau @channel_name"
                }
                className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-background border border-input text-foreground placeholder:text-muted-foreground outline-none focus:outline-none focus:ring-offset-0 focus:ring-offset-transparent focus:ring-2 focus:ring-primary/25 focus:border-primary transition-[border-color,box-shadow] duration-150"
                required
              />
              {targetHelperText && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  {targetHelperText}
                </p>
              )}
            </div>

            {/* Quantity Stepper & Presets */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-foreground">
                  {_("orders.quantity") || "Jumlah Pemesanan"}
                </label>
                <span className="text-[11px] text-muted-foreground">
                  Batas: {service.min.toLocaleString("id-ID")} - {service.max.toLocaleString("id-ID")}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setQuantity(Math.max(service.min, quantity - 100))}
                  className="p-2.5 rounded-xl border border-input bg-muted/40 hover:bg-muted text-foreground transition-colors shrink-0"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <input
                  type="number"
                  value={quantityInput}
                  onChange={(e) => setQuantityInput(e.target.value)}
                  onBlur={(e) => commitQuantity(e.target.value)}
                  min={service.min}
                  max={service.max}
                  className="w-full text-center py-2.5 rounded-xl text-base font-bold bg-background border border-input text-foreground outline-none focus:outline-none focus:ring-offset-0 focus:ring-offset-transparent focus:ring-2 focus:ring-primary/25 focus:border-primary tabular-nums"
                  />
                <button
                  type="button"
                  onClick={() => setQuantity(Math.min(service.max, quantity + 100))}
                  className="p-2.5 rounded-xl border border-input bg-muted/40 hover:bg-muted text-foreground transition-colors shrink-0"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              {/* Quick Preset Pills */}
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleSetMin}
                  className="px-2 py-0.5 rounded text-[11px] font-semibold bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground"
                >
                  Min ({service.min.toLocaleString("id-ID")})
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickAdd(100)}
                  className="px-2 py-0.5 rounded text-[11px] font-semibold bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground"
                >
                  +100
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickAdd(500)}
                  className="px-2 py-0.5 rounded text-[11px] font-semibold bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground"
                >
                  +500
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickAdd(1000)}
                  className="px-2 py-0.5 rounded text-[11px] font-semibold bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground"
                >
                  +1.000
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickAdd(5000)}
                  className="px-2 py-0.5 rounded text-[11px] font-semibold bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground"
                >
                  +5.000
                </button>
                <button
                  type="button"
                  onClick={handleSetMax}
                  className="px-2 py-0.5 rounded text-[11px] font-semibold bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground"
                >
                  Max ({service.max.toLocaleString("id-ID")})
                </button>
              </div>
            </div>

            {/* Optional Comments */}
            <div>
              <label className="block text-xs font-bold text-foreground mb-1.5">
                Komentar Tambahan <span className="text-muted-foreground font-normal">(Opsional)</span>
              </label>
              <textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                rows={2}
                placeholder="Khusus layanan custom comments: satu komentar per baris..."
                className="w-full px-3.5 py-2 rounded-xl text-xs bg-background border border-input text-foreground placeholder:text-muted-foreground outline-none focus:outline-none focus:ring-offset-0 focus:ring-offset-transparent focus:ring-2 focus:ring-primary/25 focus:border-primary resize-none"
              />
            </div>

            {/* Live Price & Wallet Gauge Summary */}
            <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-2.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground">Tarif Satuan:</span>
                <span className="font-semibold text-foreground tabular-nums">
                  Rp {service.price.toLocaleString("id-ID")} / 1.000
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground">Kuantitas:</span>
                <span className="font-semibold text-foreground tabular-nums">
                  {quantity.toLocaleString("id-ID")}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm font-bold border-t border-border/50 pt-2">
                <span className="text-foreground">Total Estimasi Biaya:</span>
                <span className="text-base text-primary tabular-nums">
                  Rp {estimatedPrice.toLocaleString("id-ID")}
                </span>
              </div>

              {/* Balance Verification */}
              {user && (
                <div
                  className={cn(
                    "p-3 rounded-lg border text-xs font-semibold flex items-center justify-between gap-2 mt-2",
                    hasSufficientBalance
                      ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-700 dark:text-emerald-300"
                      : "bg-destructive/10 border-destructive/25 text-destructive"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>
                      {hasSufficientBalance ? (
                        <>Saldo cukup. Sisa saldo: Rp {balanceRemaining.toLocaleString("id-ID")}</>
                      ) : (
                        <>Saldo kurang. Dibutuhkan Rp {estimatedPrice.toLocaleString("id-ID")} (Saldo Anda: Rp {userBalance.toLocaleString("id-ID")})</>
                      )}
                    </span>
                  </div>
                  {!hasSufficientBalance && (
                    <Link
                      href="/wallet"
                      className="px-2.5 py-1 rounded bg-destructive text-white hover:bg-destructive/90 text-[11px] font-bold shrink-0"
                    >
                      Top Up
                    </Link>
                  )}
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={placeOrder.isPending}
                className="flex-1 rounded-xl h-11 text-xs font-semibold"
              >
                Batal
              </Button>
              <Button
                type="submit"
                disabled={
                  placeOrder.isPending || !dataTarget.trim() || !hasSufficientBalance
                }
                className="flex-1 rounded-xl h-11 text-xs font-bold bg-primary hover:bg-primary/90 text-white shadow-xs"
              >
                {placeOrder.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Memproses...
                  </>
                ) : (
                  <>
                    <ShoppingCart className="h-4 w-4 mr-2" /> Konfirmasi Order
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>

      <style jsx global>{`
        @keyframes modalFadeIn {
          from {
            opacity: 0;
            transform: scale(0.97) translateY(8px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}</style>
    </div>,
    document.body
  );
}
