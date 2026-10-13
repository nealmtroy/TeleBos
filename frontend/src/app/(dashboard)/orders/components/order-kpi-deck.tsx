"use client";

import { ClipboardList, Wallet, Clock, CheckCircle2 } from "lucide-react";
import { MetricReadout, PriceTag, Chip } from "@/components/layout/trade-surface";
import { OrderMetrics } from "./types";

interface OrderKpiDeckProps {
  metrics: OrderMetrics;
  locale: string;
}

export function OrderKpiDeck({ metrics, locale }: OrderKpiDeckProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <MetricReadout
        label={locale === "id" ? "Total Pesanan" : "Total Orders"}
        value={metrics.totalOrders.toLocaleString()}
        subtext={`${metrics.totalSmm} SMM • ${metrics.totalAccounts} ${locale === "id" ? "Akun" : "Accounts"}`}
        icon={<ClipboardList className="h-4 w-4 text-primary" />}
      />
      <MetricReadout
        label={locale === "id" ? "Total Transaksi" : "Total Spend"}
        value={<PriceTag value={metrics.totalSpend} size="lg" />}
        subtext={locale === "id" ? "Volume transaksi tercatat" : "Cumulative order volume"}
        icon={<Wallet className="h-4 w-4 text-muted-foreground" />}
      />
      <MetricReadout
        label={locale === "id" ? "Sedang Diproses" : "In Progress"}
        value={
          <span className="inline-flex items-baseline gap-1">
            <span>{metrics.inProgressCount}</span>
            <span className="text-xs font-normal text-muted-foreground hidden sm:inline">
              {locale === "id" ? "Pesanan" : "Orders"}
            </span>
          </span>
        }
        subtext={
          metrics.inProgressCount > 0
            ? locale === "id"
              ? "Pengerjaan aktif & antrean"
              : "Active execution queue"
            : locale === "id"
              ? "Semua antrean rampung"
              : "Queue is all clear"
        }
        icon={<Clock className="h-4 w-4 text-muted-foreground" />}
        badge={
          metrics.inProgressCount > 0 ? (
            <Chip tone="accent" dot>
              {metrics.inProgressCount} Aktif
            </Chip>
          ) : (
            <Chip tone="positive">{locale === "id" ? "Lancar" : "Clear"}</Chip>
          )
        }
      />
      <MetricReadout
        label={locale === "id" ? "Tingkat Selesai" : "Success Rate"}
        value={`${metrics.successRate}%`}
        subtext={`${metrics.completedCount} ${locale === "id" ? "dari" : "of"} ${metrics.totalOrders} ${locale === "id" ? "selesai" : "delivered"}`}
        icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
        badge={
          <Chip tone="positive" dot>
            {locale === "id" ? "Optimal" : "Healthy"}
          </Chip>
        }
      />
    </div>
  );
}
