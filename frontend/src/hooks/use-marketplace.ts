"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
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

export function useSellAccounts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (accountIds: string[]) => {
      const { data } = await api.post("/marketplace/sell", {
        account_ids: accountIds,
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["marketplace", "sell-eligible"] });
      queryClient.invalidateQueries({ queryKey: ["marketplace", "stock"] });
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
    },
  });
}

