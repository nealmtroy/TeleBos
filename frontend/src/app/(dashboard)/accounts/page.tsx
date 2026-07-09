"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAccounts, useAccountsPaginated, type Account as AccountType } from "@/hooks/use-accounts";
import { useAccountFolders } from "@/hooks/use-account-folders";
import { AccountCard } from "@/components/accounts/account-card";
import { FolderFilterBar } from "@/components/accounts/folder-filter-bar";
import { FolderManagerDialog } from "@/components/accounts/folder-manager-dialog";
import { useRouter } from "next/navigation";
import { Plus, FolderOpen, Info, Search, ChevronLeft, ChevronRight } from "lucide-react";
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
  const _ = useT();
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [folderManagerOpen, setFolderManagerOpen] = useState(false);
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

  const { data: accountsData } = useAccounts(); // For limit checks and offline calculations
  const { data: paginatedData, isLoading, error } = useAccountsPaginated({
    page,
    limit: 10,
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

  const accountLimit = ROLE_LIMITS[user?.role || "basic"] ?? 1;
  const atLimit = allAccounts.length >= accountLimit;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{_("accountsList.title")}</h1>
          <p className="text-gray-500 mt-1">
            {_("accountsList.subtitle")}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            {allAccounts.length}/{accountLimit} accounts used
            {user?.role !== "owner" && ` (${user?.role || "basic"} plan)`}
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto justify-start sm:justify-end">
          <button
            onClick={() => setFolderManagerOpen(true)}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition"
          >
            <FolderOpen className="h-4 w-4" />
            {_("accountFolders.manageFolders")}
          </button>
          {atLimit ? (
            <span className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-400 rounded-lg text-sm font-medium cursor-not-allowed" title={`Account limit reached for ${user?.role || "basic"} plan (max ${accountLimit})`}>
              <Info className="h-4 w-4" />
              Limit Reached
            </span>
          ) : (
            <Link
              href="/accounts/add"
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition"
            >
              <Plus className="h-4 w-4" />
              {_("accountsList.addAccount")}
            </Link>
          )}
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col gap-4">
        {/* Status filters & Search bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl w-full sm:w-fit overflow-x-auto whitespace-nowrap no-scrollbar">
            <button
              onClick={() => handleSelectStatus("active")}
              className={cn(
                "px-4 py-1.5 rounded-lg text-sm font-medium transition",
                statusFilter === "active"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              )}
            >
              {_("accountsList.statusActive")}
            </button>
            <button
              onClick={() => handleSelectStatus("limited")}
              className={cn(
                "px-4 py-1.5 rounded-lg text-sm font-medium transition",
                statusFilter === "limited"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              )}
            >
              {_("accountsList.statusLimited")}
            </button>
            <button
              onClick={() => handleSelectStatus("inactive")}
              className={cn(
                "px-4 py-1.5 rounded-lg text-sm font-medium transition",
                statusFilter === "inactive"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              )}
            >
              {_("accountsList.statusInactive")}
            </button>
            <button
              onClick={() => handleSelectStatus("expired")}
              className={cn(
                "px-4 py-1.5 rounded-lg text-sm font-medium transition",
                statusFilter === "expired"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              )}
            >
              {_("accountsList.statusExpired")}
            </button>
            <button
              onClick={() => handleSelectStatus("all")}
              className={cn(
                "px-4 py-1.5 rounded-lg text-sm font-medium transition",
                statusFilter === "all"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              )}
            >
              {_("accountsList.statusAll")}
            </button>
          </div>

          <div className="relative w-full md:w-72 shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder={_("accountsList.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition"
            />
          </div>
        </div>

        {/* Folder filter bar */}
        {folders.length > 0 && (
          <div className="border-t border-gray-100 pt-3">
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
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <Smartphone className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 mb-4">
            {selectedFolderId
              ? "No accounts in this folder."
              : debouncedSearch
              ? "No accounts match your search."
              : _("accountsList.noAccounts")}
          </p>
          {selectedFolderId ? (
            <button
              onClick={() => handleSelectFolder(null)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200"
            >
              {_("accountFolders.allAccounts")}
            </button>
          ) : debouncedSearch ? (
            <button
              onClick={() => {
                setSearch("");
                setDebouncedSearch("");
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200"
            >
              Clear Search
            </button>
          ) : (
            <Link
              href="/accounts/add"
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700"
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
            />
          ))}
        </div>
      )}

      {/* Pagination Controls */}
      {!isLoading && !error && totalItems > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-gray-200 mt-6">
          <p className="text-sm text-gray-500">
            {_("accountsList.showingAccounts", {
              start: (page - 1) * 10 + 1,
              end: Math.min(page * 10, totalItems),
              total: totalItems,
            })}
          </p>
          <div className="flex items-center gap-1.5 self-center sm:self-auto">
            <button
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
              disabled={page === 1}
              className="inline-flex items-center justify-center p-2 rounded-lg border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
              title={_("accountsList.prev")}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {Array.from({ length: totalPages }).map((_, idx) => {
              const pageNum = idx + 1;
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={cn(
                    "inline-flex items-center justify-center w-9 h-9 rounded-lg border text-sm font-medium transition",
                    page === pageNum
                      ? "bg-primary-600 border-primary-600 text-white shadow-sm"
                      : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
                  )}
                >
                  {pageNum}
                </button>
              );
            })}
            <button
              onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
              disabled={page === totalPages}
              className="inline-flex items-center justify-center p-2 rounded-lg border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
              title={_("accountsList.next")}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Folder Manager Dialog */}
      <FolderManagerDialog
        open={folderManagerOpen}
        onOpenChange={setFolderManagerOpen}
      />
    </div>
  );
}

import { CardSkeleton } from "@/components/ui/skeleton-cards";
import { Smartphone } from "lucide-react";
