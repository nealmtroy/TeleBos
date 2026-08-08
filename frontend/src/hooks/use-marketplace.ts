"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { t } from "@/lib/i18n";
import { useNotificationStore } from "@/store/notification-store";
import type { Account } from "./use-accounts";

export interface StockCategory {
  country_code: string;
  country_name: string;
  ready_stock: number;
  price: number;
}

export interface MarketplaceAccountSummary {
  id: string;
  telegram_id: number | null;
  twofa_enabled: boolean;
  recovery_email_available: boolean;
  sell_price: number | null;
}

export interface MarketplaceBuyResponse {
  id: string;
  telegram_id: number | null;
  phone: string;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  created_at: string;
}

export interface MarketplacePricing {
  buy_price: number;
  sell_price: number;
}

export function useMarketplacePricing() {
  return useQuery<MarketplacePricing>({
    queryKey: ["marketplace", "pricing"],
    queryFn: async () => {
      const { data } = await api.get("/marketplace/pricing");
      return data;
    },
  });
}

export function useMarketplaceStock() {

  return useQuery<StockCategory[]>({
    queryKey: ["marketplace", "stock"],
    queryFn: async () => {
      const { data } = await api.get("/marketplace/stock");
      return data || [];
    },
  });
}

export function useMarketplaceStockAccounts(countryCode: string) {
  return useQuery<MarketplaceAccountSummary[]>({
    queryKey: ["marketplace", "stock", countryCode],
    queryFn: async () => {
      // Url encode country code prefix to handle "+" character safely
      const encodedPrefix = encodeURIComponent(countryCode);
      const { data } = await api.get(`/marketplace/stock/${encodedPrefix}/accounts`);
      return data || [];
    },
    enabled: !!countryCode,
  });
}

export function useSellEligibleAccounts() {
  return useQuery<Account[]>({
    queryKey: ["marketplace", "sell-eligible"],
    queryFn: async () => {
      const { data } = await api.get("/marketplace/sell-eligible");
      return data || [];
    },
  });
}

export const MARKETPLACE_SELL_TIMEOUT_MS = 55_000;

export function isMarketplaceSellUnknownOutcome(error: unknown): boolean {
  const status = (error as { response?: { status?: number } })?.response?.status;
  const code = (error as { code?: string })?.code;
  return status === 504 || code === "ECONNABORTED";
}

function addMarketplaceNotification(
  kind: "success" | "warning" | "error",
  title: string,
  message: string
) {
  useNotificationStore.getState().addNotification({
    kind,
    title,
    message,
    href: "/orders",
  });
}

export function useSellAccounts() {
  const queryClient = useQueryClient();
  const reconcileMarketplaceState = () => {
    queryClient.invalidateQueries({ queryKey: ["accounts"] });
    queryClient.invalidateQueries({ queryKey: ["marketplace", "sell-eligible"] });
    queryClient.invalidateQueries({ queryKey: ["marketplace", "stock"] });
    queryClient.invalidateQueries({ queryKey: ["marketplace", "history"] });
  };

  return useMutation({
    mutationFn: async (accountIds: string[]) => {
      const { data } = await api.post(
        "/marketplace/sell",
        { account_ids: accountIds },
        { timeout: MARKETPLACE_SELL_TIMEOUT_MS }
      );
      return data;
    },
    onSuccess: (_data, accountIds) => {
      reconcileMarketplaceState();
      addMarketplaceNotification(
        "success",
        t("orders.notificationSellListedTitle"),
        t("orders.notificationSellListedMessage", { count: accountIds.length })
      );
    },
    onError: (error) => {
      reconcileMarketplaceState();
      if (isMarketplaceSellUnknownOutcome(error)) {
        addMarketplaceNotification(
          "warning",
          t("orders.notificationSellPendingTitle"),
          t("orders.notificationSellPendingMessage")
        );
        return;
      }
      addMarketplaceNotification(
        "error",
        t("orders.notificationSellFailedTitle"),
        t("orders.notificationSellFailedMessage")
      );
    },
  });
}

export function useBuyAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (accountId: string) => {
      const { data } = await api.post(`/marketplace/buy/${accountId}`);
      return data as MarketplaceBuyResponse;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["marketplace", "stock"] });
      queryClient.invalidateQueries({ queryKey: ["marketplace", "history"] });
      addMarketplaceNotification(
        "success",
        t("orders.notificationBuySuccessTitle"),
        t("orders.notificationBuySuccessMessage")
      );
    },
    onError: () => {
      addMarketplaceNotification(
        "error",
        t("orders.notificationBuyFailedTitle"),
        t("orders.notificationBuyFailedMessage")
      );
    },
  });
}

export function useCancelSellAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (accountId: string) => {
      const { data } = await api.post(`/marketplace/cancel/${accountId}`);
      return data as Account;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["marketplace", "sell-eligible"] });
      queryClient.invalidateQueries({ queryKey: ["marketplace", "history"] });
      addMarketplaceNotification(
        "success",
        t("orders.notificationSellCanceledTitle"),
        t("orders.notificationSellCanceledMessage")
      );
    },
    onError: () => {
      addMarketplaceNotification(
        "error",
        t("orders.notificationSellCancelFailedTitle"),
        t("orders.notificationSellCancelFailedMessage")
      );
    },
  });
}

export interface AccountAuditLog {
  id: string;
  user_id: string;
  account_id: string | null;
  action: "buy" | "sell" | "list_for_sale" | "cancel_sale";
  price: number;
  phone: string | null;
  telegram_id: number | null;
  created_at: string;
}

export function useMarketplaceHistory() {
  return useQuery<AccountAuditLog[]>({
    queryKey: ["marketplace", "history"],
    queryFn: async () => {
      const { data } = await api.get("/marketplace/history");
      return data || [];
    },
  });
}

