"use client";

import Link from "next/link";
import { ShoppingCart, User, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DoubleBezelShell } from "@/components/layout/trade-surface";

interface OrderEmptyStateProps {
  hasActiveFilters: boolean;
  onResetFilters: () => void;
  locale: string;
}

export function OrderEmptyState({
  hasActiveFilters,
  onResetFilters,
  locale,
}: OrderEmptyStateProps) {
  return (
    <DoubleBezelShell className="text-center py-12 sm:py-16">
      <div className="max-w-md mx-auto space-y-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-foreground/[0.04] border border-border/60 mx-auto text-muted-foreground">
          <ShoppingCart className="h-6 w-6 stroke-[1.5]" />
        </div>
        <div className="space-y-1.5">
          <h3 className="font-bold text-base text-foreground">
            {hasActiveFilters
              ? locale === "id"
                ? "Tidak ada pesanan yang cocok"
                : "No matching orders found"
              : locale === "id"
                ? "Belum ada riwayat pesanan"
                : "No order history yet"}
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {hasActiveFilters
              ? locale === "id"
                ? "Coba sesuaikan kata kunci pencarian, status, atau rentang tanggal yang dipilih."
                : "Try adjusting your search terms, status filters, or selected date range."
              : locale === "id"
                ? "Mulai eksplorasi katalog akun Telegram siap pakai atau pesan layanan optimasi SMM."
                : "Explore ready-stock Telegram accounts or place your first SMM service order."}
          </p>
        </div>
        {hasActiveFilters ? (
          <Button
            variant="outline"
            size="sm"
            onClick={onResetFilters}
            className="rounded-xl text-xs font-semibold"
          >
            {locale === "id" ? "Reset Semua Filter" : "Reset All Filters"}
          </Button>
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
            <Link href="/orders/buy-accounts">
              <Button size="sm" className="rounded-xl text-xs font-semibold gap-1.5">
                <User className="h-3.5 w-3.5" />
                {locale === "id" ? "Beli Akun" : "Buy Accounts"}
              </Button>
            </Link>
            <Link href="/orders-services">
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl text-xs font-semibold gap-1.5"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {locale === "id" ? "Layanan SMM" : "SMM Services"}
              </Button>
            </Link>
          </div>
        )}
      </div>
    </DoubleBezelShell>
  );
}
