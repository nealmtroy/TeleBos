"use client";

import { useState, useEffect, useMemo } from "react";
import {
  useAccounts,
  useUpdateAutoReply,
  useBulkUpdateAutoReply,
} from "@/hooks/use-accounts";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import { AccountAvatar } from "@/components/accounts/account-avatar";
import {
  MessageCircleReply,
  Shield,
  Loader2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Plus,
  Search,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
} from "lucide-react";

const ITEMS_PER_PAGE = 10;

type Account = NonNullable<ReturnType<typeof useAccounts>["data"]>[number];

export default function AutoReplyPage() {
  const _ = useT();
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const { data: rawAccounts, isLoading, error, refetch } = useAccounts();
  const accounts = rawAccounts?.filter((acc) => acc.is_active && !acc.for_sale);

  // Role check
  if (user?.role === "basic") {
    return (
      <div className="text-center py-16">
        <Shield className="h-16 w-16 mx-auto mb-4 text-gray-300" />
        <h3 className="font-semibold text-gray-900 mb-1">Access Denied</h3>
        <p className="text-sm text-gray-500">
          Auto Reply feature is not available for your plan. Upgrade to Pro or
          Premium to access this feature.
        </p>
      </div>
    );
  }

  // ── State ──────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Global / bulk settings
  const [bulkText, setBulkText] = useState("");
  const [bulkEnabled, setBulkEnabled] = useState(true);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Per-account draft edits (only for the expanded row)
  const [draftText, setDraftText] = useState("");
  const [draftEnabled, setDraftEnabled] = useState(false);
  const [draftDirty, setDraftDirty] = useState(false);

  const updateMutation = useUpdateAutoReply();
  const bulkMutation = useBulkUpdateAutoReply();

  // Filtered accounts
  const filtered = useMemo(() => {
    if (!accounts) return [];
    if (!search.trim()) return accounts;
    const q = search.toLowerCase();
    return accounts.filter(
      (a) =>
        (a.first_name || "").toLowerCase().includes(q) ||
        (a.last_name || "").toLowerCase().includes(q) ||
        (a.username || "").toLowerCase().includes(q) ||
        (a.phone || "").includes(q)
    );
  }, [accounts, search]);

  // Reset page when search changes
  useEffect(() => {
    setPage(1);
  }, [search]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginatedFiltered = useMemo(() => {
    const start = (page - 1) * ITEMS_PER_PAGE;
    return filtered.slice(start, start + ITEMS_PER_PAGE);
  }, [filtered, page]);

  // Stats
  const totalActive = accounts?.filter((a) => a.auto_reply_enabled).length ?? 0;
  const totalAccounts = accounts?.length ?? 0;

  // ── Expand / collapse row ─────────────────────────────────────
  function handleExpand(account: Account) {
    if (expandedId === account.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(account.id);
    setDraftText(account.auto_reply_text ?? "");
    setDraftEnabled(account.auto_reply_enabled ?? false);
    setDraftDirty(false);
  }

  // ── Per-account save ──────────────────────────────────────────
  const [perSaving, setPerSaving] = useState(false);
  const [perMsg, setPerMsg] = useState<string | null>(null);

  async function handleSaveExpanded() {
    if (!expandedId) return;
    setPerSaving(true);
    setPerMsg(null);
    try {
      await updateMutation.mutateAsync({
        accountId: expandedId,
        auto_reply_enabled: draftEnabled,
        auto_reply_text: draftText.trim() || null,
      });
      setDraftDirty(false);
      setPerMsg("saved");
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    } catch (err: any) {
      setPerMsg(err?.response?.data?.detail || "Failed");
    } finally {
      setPerSaving(false);
    }
    setTimeout(() => setPerMsg(null), 3000);
  }

  // ── Quick toggle (no text change) ─────────────────────────────
  async function handleQuickToggle(account: Account) {
    try {
      await updateMutation.mutateAsync({
        accountId: account.id,
        auto_reply_enabled: !account.auto_reply_enabled,
        auto_reply_text: account.auto_reply_text || null,
      });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    } catch {
      // silent
    }
  }

  // ── Selection ─────────────────────────────────────────────────
  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    const pageIds = paginatedFiltered.map((a) => a.id);
    const allPageSelected = pageIds.every((id) => selectedIds.has(id));
    if (allPageSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        pageIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        pageIds.forEach((id) => next.add(id));
        return next;
      });
    }
  }

  // ── Bulk apply ────────────────────────────────────────────────
  async function handleBulkApply() {
    if (selectedIds.size === 0) return;
    setBulkSaving(true);
    setBulkMsg(null);
    try {
      const result = await bulkMutation.mutateAsync({
        accountIds: Array.from(selectedIds),
        auto_reply_enabled: bulkEnabled,
        auto_reply_text: bulkText.trim() || null,
      });
      setBulkMsg({
        type: "success",
        text: `Updated ${result.updated} of ${result.total} accounts`,
      });
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    } catch {
      setBulkMsg({ type: "error", text: "Bulk update failed" });
    } finally {
      setBulkSaving(false);
    }
    setTimeout(() => setBulkMsg(null), 4000);
  }

  // Clear bulk message on unmount
  useEffect(() => {
    return () => setBulkMsg(null);
  }, []);

  // ── Loading state ─────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-32 w-full rounded-xl" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────
  if (error) {
    return (
      <div className="max-w-5xl mx-auto text-center py-12">
        <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
        <p className="text-red-500 mb-4">{_("autoReply.failedToLoad")}</p>
        <button
          onClick={() => refetch()}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700"
        >
          <RefreshCw className="h-4 w-4" />
          {_("autoReply.retry")}
        </button>
      </div>
    );
  }

  // ── Empty state ───────────────────────────────────────────────
  if (!accounts || accounts.length === 0) {
    return (
      <div className="max-w-5xl mx-auto text-center py-12">
        <MessageCircleReply className="h-12 w-12 text-gray-300 mx-auto mb-4" />
        <h1 className="text-xl font-semibold text-gray-900 mb-2">
          {_("autoReply.noAccounts")}
        </h1>
        <p className="text-gray-500 mb-6">{_("autoReply.noAccountsDesc")}</p>
        <Link
          href="/accounts/add"
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700"
        >
          <Plus className="h-4 w-4" />
          {_("autoReply.addAccount")}
        </Link>
      </div>
    );
  }

  const pageIds = paginatedFiltered.map((a) => a.id);
  const allPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const someSelected = selectedIds.size > 0;

  // ── Main UI ───────────────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {_("autoReply.title")}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {_("autoReply.desc")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
            <CheckCircle2 className="h-3 w-3" />
            {totalActive}/{totalAccounts} active
          </span>
        </div>
      </div>

      {/* Bulk Action Panel — visible when items selected */}
      {someSelected && (
        <div className="bg-primary-50 border border-primary-200 rounded-xl p-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-sm font-medium text-primary-800">
              {selectedIds.size} account{selectedIds.size > 1 ? "s" : ""}{" "}
              selected
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedIds(new Set())}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Bulk config */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex items-center gap-2">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={bulkEnabled}
                  onChange={(e) => setBulkEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary-600" />
              </label>
              <span className="text-sm text-gray-700">
                {bulkEnabled ? _("autoReply.enableAll") : _("autoReply.disableAll")}
              </span>
            </div>
            <div className="flex-1">
              <textarea
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder={_("autoReply.globalMessagePlaceholder")}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none resize-none bg-white"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleBulkApply}
              disabled={bulkSaving}
              className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:bg-gray-300 transition"
            >
              {bulkSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin inline mr-1.5" />
                  {_("autoReply.applying")}
                </>
              ) : (
                _("autoReply.applyToAll")
              )}
            </button>
            {bulkMsg && (
              <span
                className={cn(
                  "text-sm",
                  bulkMsg.type === "error" ? "text-red-500" : "text-green-600"
                )}
              >
                {bulkMsg.text}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder={_("accountsList.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition"
        />
      </div>

      {/* Account Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Table header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50/80 text-xs font-medium text-gray-500 uppercase tracking-wider">
          <label className="flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={allPageSelected}
              onChange={toggleSelectAll}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 h-4 w-4 cursor-pointer"
            />
          </label>
          <span className="flex-1 min-w-0">Account</span>
          <span className="hidden sm:block w-48 text-center">Message</span>
          <span className="w-20 text-center">Status</span>
          <span className="w-16 text-center">Toggle</span>
        </div>

        {/* Rows */}
        {filtered.length === 0 ? (
          <div className="text-center py-10 text-sm text-gray-400">
            {search ? "No accounts match your search." : "No active accounts."}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {paginatedFiltered.map((account) => {
              const isExpanded = expandedId === account.id;
              const isSelected = selectedIds.has(account.id);
              const hasMessage = !!account.auto_reply_text?.trim();

              return (
                <div key={account.id}>
                  {/* Compact row */}
                  <div
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 transition-colors cursor-pointer select-none",
                      isExpanded && "bg-primary-50/50",
                      isSelected && !isExpanded && "bg-blue-50/40",
                      !isExpanded && !isSelected && "hover:bg-gray-50"
                    )}
                  >
                    {/* Checkbox */}
                    <label
                      className="flex items-center shrink-0 cursor-pointer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(account.id)}
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 h-4 w-4 cursor-pointer"
                      />
                    </label>

                    {/* Account info */}
                    <div
                      className="flex items-center gap-3 flex-1 min-w-0"
                      onClick={() => handleExpand(account)}
                    >
                      <AccountAvatar
                        accountId={account.id}
                        firstName={account.first_name}
                        phone={account.phone}
                        photoVersion={account.photo_version}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {account.first_name || _("accountCard.unnamed")}{" "}
                          {account.last_name || ""}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {account.username
                            ? `@${account.username}`
                            : account.phone}
                        </p>
                      </div>
                    </div>

                    {/* Message preview */}
                    <div
                      className="hidden sm:block w-48 text-center"
                      onClick={() => handleExpand(account)}
                    >
                      {hasMessage ? (
                        <span className="text-xs text-gray-500 truncate block max-w-full">
                          {account.auto_reply_text!.slice(0, 40)}
                          {account.auto_reply_text!.length > 40 ? "…" : ""}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300 italic">
                          No message set
                        </span>
                      )}
                    </div>

                    {/* Status badge */}
                    <div className="w-20 text-center" onClick={() => handleExpand(account)}>
                      <span
                        className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium",
                          account.auto_reply_enabled
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-500"
                        )}
                      >
                        {account.auto_reply_enabled
                          ? _("autoReply.on")
                          : _("autoReply.off")}
                      </span>
                    </div>

                    {/* Toggle */}
                    <div
                      className="w-16 flex justify-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={account.auto_reply_enabled ?? false}
                          onChange={() => handleQuickToggle(account)}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary-600" />
                      </label>
                    </div>

                    {/* Expand indicator */}
                    <div
                      className="shrink-0 text-gray-400"
                      onClick={() => handleExpand(account)}
                    >
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </div>
                  </div>

                  {/* Expanded editor */}
                  {isExpanded && (
                    <div className="px-4 py-4 bg-gray-50/80 border-t border-gray-100 animate-in fade-in slide-in-from-top-1 duration-150">
                      <div className="max-w-2xl ml-8 sm:ml-12 space-y-3">
                        <div className="flex items-center gap-3 mb-2">
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={draftEnabled}
                              onChange={(e) => {
                                setDraftEnabled(e.target.checked);
                                setDraftDirty(true);
                              }}
                              className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary-600" />
                          </label>
                          <span className="text-sm text-gray-700">
                            {draftEnabled
                              ? _("autoReply.on")
                              : _("autoReply.off")}
                          </span>
                        </div>

                        <textarea
                          value={draftText}
                          onChange={(e) => {
                            setDraftText(e.target.value);
                            setDraftDirty(true);
                          }}
                          placeholder={_("autoReply.replyPlaceholder")}
                          rows={3}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none resize-none bg-white"
                        />

                        <div className="flex items-center gap-3">
                          <button
                            onClick={handleSaveExpanded}
                            disabled={perSaving || !draftDirty}
                            className={cn(
                              "px-4 py-2 text-sm font-medium rounded-lg transition",
                              draftDirty
                                ? "bg-primary-600 text-white hover:bg-primary-700"
                                : "bg-gray-100 text-gray-400 cursor-not-allowed"
                            )}
                          >
                            {perSaving ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              _("autoReply.save")
                            )}
                          </button>
                          <button
                            onClick={() => setExpandedId(null)}
                            className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition"
                          >
                            Cancel
                          </button>
                          {perMsg && (
                            <span
                              className={cn(
                                "text-xs",
                                perMsg === "saved"
                                  ? "text-green-600"
                                  : "text-red-500"
                              )}
                            >
                              {perMsg === "saved"
                                ? _("autoReply.saved")
                                : perMsg}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination Controls */}
      {filtered.length > ITEMS_PER_PAGE && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
          <p className="text-sm text-gray-500">
            Showing {(page - 1) * ITEMS_PER_PAGE + 1}–
            {Math.min(page * ITEMS_PER_PAGE, filtered.length)} of{" "}
            {filtered.length} accounts
            {search ? ` matching "${search}"` : ""}
          </p>
          <div className="flex items-center gap-1.5 self-center sm:self-auto">
            <button
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
              disabled={page === 1}
              className="inline-flex items-center justify-center p-2 rounded-lg border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {Array.from({ length: totalPages }).map((_, idx) => {
              const pageNum = idx + 1;
              // Show max 5 page buttons around current page
              if (
                totalPages > 7 &&
                pageNum !== 1 &&
                pageNum !== totalPages &&
                Math.abs(pageNum - page) > 2
              ) {
                // Show ellipsis marker
                if (pageNum === page - 3 || pageNum === page + 3) {
                  return (
                    <span key={pageNum} className="px-1 text-gray-400 text-sm">
                      …
                    </span>
                  );
                }
                return null;
              }
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
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
