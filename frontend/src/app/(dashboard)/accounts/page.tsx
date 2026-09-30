"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAccounts, useAccountsPaginated, useAccountsSummary, type Account } from "@/hooks/use-accounts";
import { useAccountFolders } from "@/hooks/use-account-folders";
import { AccountCard } from "@/components/accounts/account-card";
import { FolderFilterBar } from "@/components/accounts/folder-filter-bar";
import { FolderManagerDialog } from "@/components/accounts/folder-manager-dialog";
import { TransferAccountsDialog } from "@/components/accounts/transfer-accounts-dialog";
import { CardSkeleton } from "@/components/ui/skeleton-cards";
import { useRouter } from "next/navigation";
import { Plus, FolderOpen, Info, Search, Smartphone, ArrowRightLeft, Star } from "lucide-react";
import { DataPagination } from "@/components/ui/pagination";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import Link from "next/link";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

// Role-based account limits
const ROLE_LIMITS: Record<string, number> = {
  basic: 1,
  pro: 10,
  premium: 100,
  owner: 999999,
};

export default function AccountsListPage() {
  const PAGE_SIZE = 12;
  const _ = useT();
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [folderManagerOpen, setFolderManagerOpen] = useState(false);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [selectedTransferAccounts, setSelectedTransferAccounts] = useState<Account[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("active");

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Debounce search input to prevent excessive backend queries
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  const handleSelectFolder = (id: string | null) => {
    setSelectedFolderId(id);
    setPage(1);
  };

  const handleSelectStatus = (status: string) => {
    setStatusFilter(status);
    setPage(1);
  };

  const { data: accountsSummary } = useAccountsSummary();
  const { data: accountsData } = useAccounts(); // For limit checks and offline calculations
  const { data: paginatedData, isLoading, error } = useAccountsPaginated({
    page,
    limit: PAGE_SIZE,
    search: debouncedSearch,
    folder_id: selectedFolderId,
    status: statusFilter === "all" ? null : statusFilter,
  });
  const { data: foldersData } = useAccountFolders();

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/accounts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
  });

  const allAccounts = Array.isArray(accountsData) ? accountsData : [];
  const folders = Array.isArray(foldersData) ? foldersData : [];

  // Paginated accounts loaded from backend
  const accounts = paginatedData?.accounts || [];
  const totalItems = paginatedData?.total || 0;
  const totalPages = paginatedData?.pages || 0;

  useEffect(() => {
    if (totalPages > 0 && page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const totalUsedAccounts = accountsSummary?.total ?? allAccounts.length;
  const accountLimit = ROLE_LIMITS[user?.role || "basic"] ?? 1;
  const atLimit = totalUsedAccounts >= accountLimit;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">{_("accountsList.title")}</h1>
          <p className="text-gray-500 dark:text-slate-400 mt-1">
            {_("accountsList.subtitle")}
          </p>
          <p className="text-xs text-gray-400 dark:text-slate-400 mt-0.5">
            {totalUsedAccounts}/{accountLimit} accounts used
            {user?.role !== "owner" && ` (${user?.role || "basic"} plan)`}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto justify-start sm:justify-end">
          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => setFolderManagerOpen(true)}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-200 rounded-lg text-sm font-medium hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
            >
              <FolderOpen className="h-4 w-4" />
              {_("accountFolders.manageFolders")}
            </button>
            {atLimit ? (
              <span className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-slate-400 rounded-lg text-sm font-medium cursor-not-allowed" title={`Account limit reached for ${user?.role || "basic"} plan (max ${accountLimit})`}>
                <Info className="h-4 w-4" />
                Limit Reached
              </span>
            ) : (
              <Link
                href="/accounts/add"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
              >
                <Plus className="h-4 w-4" />
                {_("accountsList.addAccount")}
              </Link>
            )}
          </div>
          {user?.role === "owner" && (
            <button
              onClick={() => {
                setSelectedTransferAccounts([]);
                setTransferDialogOpen(true);
              }}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60 rounded-lg text-sm font-medium hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
            >
              <ArrowRightLeft className="h-4 w-4" />
              {_("accountsList.transferAccounts")}
            </button>
          )}
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col gap-4">
        {/* Status filters & Search bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-slate-800/80 p-1 rounded-xl w-full sm:w-fit overflow-x-auto whitespace-nowrap no-scrollbar border border-transparent dark:border-slate-700/60">
            <button
              onClick={() => handleSelectStatus("active")}
              className={cn(
                "px-4 py-1.5 rounded-lg text-sm font-medium transition-colors",
                statusFilter === "active"
                  ? "bg-white dark:bg-slate-700 text-gray-900 dark:text-white border border-gray-200/60 dark:border-slate-600 shadow-xs"
                  : "text-gray-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-white"
              )}
            >
              {_("accountsList.statusActive")}
            </button>
            <button
              onClick={() => handleSelectStatus("limited")}
              className={cn(
                "px-4 py-1.5 rounded-lg text-sm font-medium transition-colors",
                statusFilter === "limited"
                  ? "bg-white dark:bg-slate-700 text-gray-900 dark:text-white border border-gray-200/60 dark:border-slate-600 shadow-xs"
                  : "text-gray-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-white"
              )}
            >
              {_("accountsList.statusLimited")}
            </button>
            <button
              onClick={() => handleSelectStatus("inactive")}
              className={cn(
                "px-4 py-1.5 rounded-lg text-sm font-medium transition-colors",
                statusFilter === "inactive"
                  ? "bg-white dark:bg-slate-700 text-gray-900 dark:text-white border border-gray-200/60 dark:border-slate-600 shadow-xs"
                  : "text-gray-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-white"
              )}
            >
              {_("accountsList.statusInactive")}
            </button>
            <button
              onClick={() => handleSelectStatus("expired")}
              className={cn(
                "px-4 py-1.5 rounded-lg text-sm font-medium transition-colors",
                statusFilter === "expired"
                  ? "bg-white dark:bg-slate-700 text-gray-900 dark:text-white border border-gray-200/60 dark:border-slate-600 shadow-xs"
                  : "text-gray-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-white"
              )}
            >
              {_("accountsList.statusExpired")}
            </button>
            <button
              onClick={() => handleSelectStatus("premium")}
              className={cn(
                "px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all inline-flex items-center gap-1.5",
                statusFilter === "premium"
                  ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-xs font-semibold"
                  : "text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-200"
              )}
            >
              <Star className={cn("h-3.5 w-3.5", statusFilter === "premium" ? "fill-white text-white" : "fill-purple-600 text-purple-600 dark:fill-purple-400 dark:text-purple-400")} />
              {_("accountsList.statusPremium")}
            </button>
            <button
              onClick={() => handleSelectStatus("all")}
              className={cn(
                "px-4 py-1.5 rounded-lg text-sm font-medium transition-colors",
                statusFilter === "all"
                  ? "bg-white dark:bg-slate-700 text-gray-900 dark:text-white border border-gray-200/60 dark:border-slate-600 shadow-xs"
                  : "text-gray-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-white"
              )}
            >
              {_("accountsList.statusAll")}
            </button>
          </div>

          <div className="relative w-full md:w-72 shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-slate-400" />
            <input
              type="text"
              placeholder={_("accountsList.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 border border-gray-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-400 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors"
            />
          </div>
        </div>

        {/* Folder filter bar */}
        {folders.length > 0 && (
          <div className="border-t border-gray-100 dark:border-slate-800 pt-3">
            <FolderFilterBar
              folders={folders}
              selectedFolderId={selectedFolderId}
              onSelect={handleSelectFolder}
            />
          </div>
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
        <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700">
          <Smartphone className="h-12 w-12 text-gray-300 dark:text-slate-500 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-slate-300 mb-4">
            {selectedFolderId
              ? "No accounts in this folder."
              : debouncedSearch
              ? "No accounts match your search."
              : _("accountsList.noAccounts")}
          </p>
          {selectedFolderId ? (
            <button
              onClick={() => handleSelectFolder(null)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-200 rounded-lg text-sm font-medium hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
            >
              {_("accountFolders.allAccounts")}
            </button>
          ) : debouncedSearch ? (
            <button
              onClick={() => {
                setSearch("");
                setDebouncedSearch("");
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-200 rounded-lg text-sm font-medium hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
            >
              Clear Search
            </button>
          ) : (
            <Link
              href="/accounts/add"
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              {_("accountsList.addYourFirst")}
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              onDelete={(id) => deleteMutation.mutate(id)}
              onView={(id) => router.push(`/accounts/${id}`)}
              onTransfer={
                user?.role === "owner"
                  ? (acc) => {
                      setSelectedTransferAccounts([acc]);
                      setTransferDialogOpen(true);
                    }
                  : undefined
              }
            />
          ))}
        </div>
      )}

      {/* Pagination Controls */}
      {!isLoading && !error && totalItems > 0 && totalPages > 0 && (
        <nav
          aria-label="Account pagination"
          className="mt-6 flex flex-col gap-3 border-t border-gray-200 dark:border-slate-800 pt-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-sm text-gray-500 dark:text-slate-400">
            {_("accountsList.showingAccounts", {
              start: (page - 1) * PAGE_SIZE + 1,
              end: Math.min(page * PAGE_SIZE, totalItems),
              total: totalItems,
            })}
          </p>
          <DataPagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            labels={{ prev: _("accountsList.prev"), next: _("accountsList.next") }}
            className="w-auto mx-0"
          />
        </nav>
      )}

      {/* Folder Manager Dialog */}
      <FolderManagerDialog
        open={folderManagerOpen}
        onOpenChange={setFolderManagerOpen}
      />

      {/* Transfer Accounts Dialog (Owner Only) */}
      {user?.role === "owner" && (
        <TransferAccountsDialog
          open={transferDialogOpen}
          onOpenChange={setTransferDialogOpen}
          initialSelectedAccounts={selectedTransferAccounts}
        />
      )}
    </div>
  );
}
