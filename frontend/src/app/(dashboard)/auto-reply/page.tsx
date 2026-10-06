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
import { TextEditorModal } from "@/components/ui/text-editor";
import {
  MessageCircleReply,
  Shield,
  Loader2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Plus,
  Search,
  Edit3,
} from "lucide-react";
import { DataPagination } from "@/components/ui/pagination";

const ITEMS_PER_PAGE = 10;

type Account = NonNullable<ReturnType<typeof useAccounts>["data"]>[number];

export default function AutoReplyPage() {
  const _ = useT();
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const {
    data: rawAccounts,
    isLoading,
    error,
    refetch,
  } = useAccounts({ is_active: true, limit: 1000 });
  const accounts = rawAccounts?.filter((acc) => acc.is_active && !acc.for_sale);

  // Role check
  if (user?.role === "basic") {
    return (
      <div className="text-center py-16">
        <Shield className="h-16 w-16 mx-auto mb-4 text-gray-300" />
        <h3 className="font-semibold text-gray-900 dark:text-slate-100 mb-1">
          Access Denied
        </h3>
        <p className="text-sm text-gray-500 dark:text-slate-400">
          Auto Reply feature is not available for your plan. Upgrade to Pro or
          Premium to access this feature.
        </p>
      </div>
    );
  }

  // ── State ──────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Global / bulk settings
  const [bulkText, setBulkText] = useState("");
  const [bulkEnabled, setBulkEnabled] = useState(true);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Per-account Modal Editor state
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [modalEnabled, setModalEnabled] = useState(false);
  const [modalSaving, setModalSaving] = useState(false);

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
  const totalActive =
    accounts?.filter((a) => a.auto_reply_enabled).length ?? 0;
  const totalAccounts = accounts?.length ?? 0;

  // ── Open Editor Modal ─────────────────────────────────────────
  function handleOpenEditor(account: Account) {
    setEditingAccount(account);
    setModalEnabled(account.auto_reply_enabled ?? false);
  }

  // ── Save from Editor Modal ────────────────────────────────────
  async function handleSaveAccountMessage(newText: string) {
    if (!editingAccount) return;
    setModalSaving(true);
    try {
      await updateMutation.mutateAsync({
        accountId: editingAccount.id,
        auto_reply_enabled: modalEnabled,
        auto_reply_text: newText.trim() || null,
      });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      setEditingAccount(null);
    } finally {
      setModalSaving(false);
    }
  }

  // ── Quick toggle switch ───────────────────────────────────────
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
        <h1 className="text-xl font-semibold text-gray-900 dark:text-slate-100 mb-2">
          {_("autoReply.noAccounts")}
        </h1>
        <p className="text-gray-500 dark:text-slate-400 mb-6">
          {_("autoReply.noAccountsDesc")}
        </p>
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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">
            {_("autoReply.title")}
          </h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5 max-w-xl">
            {_("autoReply.desc")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800">
            <CheckCircle2 className="h-3 w-3" />
            {totalActive}/{totalAccounts} active
          </span>
        </div>
      </div>

      {/* Bulk Action Panel — visible when items selected */}
      {someSelected && (
        <div className="bg-primary-50/70 dark:bg-primary-950/40 border border-primary-200 dark:border-primary-800/80 rounded-xl p-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-sm font-medium text-primary-900 dark:text-primary-200">
              {selectedIds.size} account{selectedIds.size > 1 ? "s" : ""}{" "}
              selected
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedIds(new Set())}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Bulk config row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bulkEnabled}
                    onChange={(e) => setBulkEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-200 dark:bg-slate-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-transform peer-checked:bg-primary-600" />
                </label>
                <span className="text-xs font-medium text-gray-700 dark:text-slate-300">
                  {bulkEnabled
                    ? _("autoReply.enableAll")
                    : _("autoReply.disableAll")}
                </span>
              </div>

              {/* Set / Edit Bulk Text Button */}
              <button
                type="button"
                onClick={() => setShowBulkModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-primary-700 dark:text-primary-300 bg-white dark:bg-slate-800 border border-primary-200 dark:border-primary-700 hover:bg-primary-50 dark:hover:bg-slate-700 shadow-2xs transition"
              >
                <Edit3 className="h-3.5 w-3.5" />
                {bulkText
                  ? _("autoReply.editText")
                  : _("autoReply.setText")}
              </button>

              {bulkText && (
                <span className="text-xs text-gray-600 dark:text-slate-400 italic truncate max-w-xs">
                  &ldquo;{bulkText.slice(0, 45)}
                  {bulkText.length > 45 ? "…" : ""}&rdquo;
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleBulkApply}
                disabled={bulkSaving}
                className="px-4 py-2 bg-primary-600 text-white text-xs font-semibold rounded-lg hover:bg-primary-700 disabled:bg-gray-300 dark:disabled:bg-slate-700 transition"
              >
                {bulkSaving ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin inline mr-1.5" />
                    {_("autoReply.applying")}
                  </>
                ) : (
                  _("autoReply.applyToAll")
                )}
              </button>
              {bulkMsg && (
                <span
                  className={cn(
                    "text-xs font-medium",
                    bulkMsg.type === "error"
                      ? "text-red-500"
                      : "text-green-600 dark:text-green-400"
                  )}
                >
                  {bulkMsg.text}
                </span>
              )}
            </div>
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
          className="w-full pl-9 pr-4 py-2.5 border border-gray-200 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-400 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition"
        />
      </div>

      {/* Account Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden shadow-2xs">
        {/* Table header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-slate-700 text-xs font-medium text-gray-500 dark:text-slate-300 uppercase tracking-wider">
          <label className="flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={allPageSelected}
              onChange={toggleSelectAll}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 h-4 w-4 cursor-pointer"
            />
          </label>
          <span className="flex-1 min-w-0">Account</span>
          <span className="hidden sm:block w-72 text-center">Message</span>
          <span className="w-20 text-center">Status</span>
          <span className="w-16 text-center">Toggle</span>
        </div>

        {/* Rows */}
        {filtered.length === 0 ? (
          <div className="text-center py-10 text-sm text-gray-400 dark:text-slate-400">
            {search ? "No accounts match your search." : "No active accounts."}
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-slate-700/80">
            {paginatedFiltered.map((account) => {
              const isSelected = selectedIds.has(account.id);
              const hasMessage = !!account.auto_reply_text?.trim();

              return (
                <div
                  key={account.id}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 transition-colors",
                    isSelected
                      ? "bg-blue-50/40 dark:bg-blue-950/30"
                      : "hover:bg-gray-50/70 dark:hover:bg-slate-700/40"
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
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <AccountAvatar
                      accountId={account.id}
                      telegramId={account.telegram_id}
                      firstName={account.first_name}
                      phone={account.phone}
                      colorId={account.color_id}
                      hasProfilePhoto={account.has_profile_photo}
                      photoVersion={account.photo_version}
                      isActive={account.is_active}
                      profilePhotoPath={account.profile_photo_path}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-slate-100 truncate">
                        {account.first_name || _("accountCard.unnamed")}{" "}
                        {account.last_name || ""}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-slate-400 truncate">
                        {account.username
                          ? `@${account.username}`
                          : account.phone}
                      </p>

                      {/* Mobile action button */}
                      <div className="sm:hidden mt-1.5 flex items-center gap-2">
                        {hasMessage ? (
                          <button
                            type="button"
                            onClick={() => handleOpenEditor(account)}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-primary-600 dark:text-primary-400 hover:underline"
                          >
                            <Edit3 className="h-3 w-3" />
                            {_("autoReply.editText")}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleOpenEditor(account)}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-primary-600 dark:text-primary-400 hover:underline"
                          >
                            <Plus className="h-3 w-3" />
                            {_("autoReply.setText")}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Message Column (Desktop): preview & button */}
                  <div className="hidden sm:block w-72">
                    {hasMessage ? (
                      <div className="flex items-center justify-between gap-2 bg-gray-50 dark:bg-slate-800/80 border border-gray-200/80 dark:border-slate-700/80 rounded-lg px-2.5 py-1.5">
                        <span
                          className="text-xs text-gray-700 dark:text-slate-300 truncate flex-1"
                          title={account.auto_reply_text!}
                        >
                          {account.auto_reply_text}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleOpenEditor(account)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-950/50 transition shrink-0"
                          title={_("autoReply.editText")}
                        >
                          <Edit3 className="h-3 w-3" />
                          <span>{_("autoReply.editText")}</span>
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center">
                        <button
                          type="button"
                          onClick={() => handleOpenEditor(account)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg text-primary-600 dark:text-primary-400 bg-primary-50 hover:bg-primary-100 dark:bg-primary-950/60 dark:hover:bg-primary-900 border border-primary-200/80 dark:border-primary-800/80 transition"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>{_("autoReply.setText")}</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Status badge */}
                  <div className="w-20 text-center">
                    <span
                      className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold",
                        account.auto_reply_enabled
                          ? "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300"
                          : "bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-400"
                      )}
                    >
                      {account.auto_reply_enabled
                        ? _("autoReply.on")
                        : _("autoReply.off")}
                    </span>
                  </div>

                  {/* Quick Toggle switch */}
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
                      <div className="w-9 h-5 bg-gray-200 dark:bg-slate-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-transform peer-checked:bg-primary-600" />
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination Controls */}
      {filtered.length > ITEMS_PER_PAGE && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-gray-200 dark:border-slate-800">
          <p className="text-sm text-gray-500 dark:text-slate-400">
            Showing {(page - 1) * ITEMS_PER_PAGE + 1}–
            {Math.min(page * ITEMS_PER_PAGE, filtered.length)} of{" "}
            {filtered.length} accounts
            {search ? ` matching "${search}"` : ""}
          </p>
          <DataPagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            className="w-auto mx-0"
          />
        </div>
      )}

      {/* ── Per-Account Text Editor Modal ── */}
      {editingAccount && (
        <TextEditorModal
          open={editingAccount !== null}
          onOpenChange={(open) => {
            if (!open) setEditingAccount(null);
          }}
          title={
            editingAccount.first_name
              ? `Auto Reply — ${editingAccount.first_name}`
              : _("autoReply.modalTitle")
          }
          description={
            editingAccount.username
              ? `@${editingAccount.username} (${editingAccount.phone})`
              : editingAccount.phone || _("autoReply.modalDesc")
          }
          value={editingAccount.auto_reply_text || ""}
          onSave={handleSaveAccountMessage}
          placeholder={_("autoReply.replyPlaceholder")}
          saveText={_("autoReply.save")}
          cancelText="Batal"
          isLoading={modalSaving}
          extraHeaderContent={
            <div className="flex items-center gap-2.5 pt-2 pb-1 border-t border-gray-100 dark:border-slate-800">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={modalEnabled}
                  onChange={(e) => setModalEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-8 h-4.5 bg-gray-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-transform peer-checked:bg-primary-600" />
              </label>
              <span className="text-xs font-medium text-gray-700 dark:text-slate-300">
                {_("autoReply.enableForAccount")}
              </span>
            </div>
          }
        />
      )}

      {/* ── Bulk Text Editor Modal ── */}
      <TextEditorModal
        open={showBulkModal}
        onOpenChange={setShowBulkModal}
        title="Auto Reply Template (Massal)"
        description={`Atur template pesan yang akan diterapkan ke ${selectedIds.size} akun terpilih.`}
        value={bulkText}
        onSave={(val) => {
          setBulkText(val);
          setShowBulkModal(false);
        }}
        placeholder={_("autoReply.globalMessagePlaceholder")}
        saveText="Gunakan Template"
        cancelText="Batal"
      />
    </div>
  );
}
