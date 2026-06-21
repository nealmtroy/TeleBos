"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAccounts, type Account as AccountType } from "@/hooks/use-accounts";
import { AccountCard } from "@/components/accounts/account-card";
import { useRouter } from "next/navigation";
import { Plus, RefreshCw, Info } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import Link from "next/link";

// Role-based account limits
const ROLE_LIMITS: Record<string, number> = {
  basic: 1,
  pro: 10,
  premium: 100,
  owner: 999999,
};

export default function AccountsListPage() {
  const _ = useT();
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const { data: accountsData, isLoading, error } = useAccounts();

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/accounts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
  });

  const accounts = Array.isArray(accountsData) ? accountsData : [];
  const accountLimit = ROLE_LIMITS[user?.role || "basic"] ?? 1;
  const atLimit = accounts.length >= accountLimit;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{_("accountsList.title")}</h1>
          <p className="text-gray-500 mt-1">
            {_("accountsList.subtitle")}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            {accounts.length}/{accountLimit} accounts used
            {user?.role !== "owner" && ` (${user?.role || "basic"} plan)`}
          </p>
        </div>
        {atLimit ? (
          <span className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-400 rounded-lg text-sm font-medium cursor-not-allowed" title={`Account limit reached for ${user?.role || "basic"} plan (max ${accountLimit})`}>
            <Info className="h-4 w-4" />
            Limit Reached
          </span>
        ) : (
          <Link
            href="/accounts/add"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition"
          >
            <Plus className="h-4 w-4" />
            {_("accountsList.addAccount")}
          </Link>
        )}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <CardSkeleton key={i} lines={2} />
          ))}
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <p className="text-red-500">{_("accountsList.failedToLoad")}</p>
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ["accounts"] })}
            className="mt-2 text-primary-600 hover:underline text-sm"
          >
            {_("accountsList.tryAgain")}
          </button>
        </div>
      ) : accounts.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <Smartphone className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 mb-4">
            {_("accountsList.noAccounts")}
          </p>
          <Link
            href="/accounts/add"
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700"
          >
            <Plus className="h-4 w-4" />
            {_("accountsList.addYourFirst")}
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              onDelete={(id) => deleteMutation.mutate(id)}
              onView={(id) => router.push(`/accounts/${id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

import { CardSkeleton } from "@/components/ui/skeleton-cards";
import { Smartphone } from "lucide-react";
