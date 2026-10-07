"use client";

import { useState, useMemo } from "react";
import { Search, Users, X, Star, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { AccountAvatar } from "@/components/accounts/account-avatar";
import { FolderFilterBar } from "@/components/accounts/folder-filter-bar";
import { useAccountFolders, type AccountFolder } from "@/hooks/use-account-folders";
import type { Account } from "@/hooks/use-accounts";

export interface AccountSelectorProps {
  /** The list of accounts to display */
  accounts?: Account[];
  /** Whether accounts are currently loading */
  isLoading?: boolean;
  /** Selected account IDs. Supports string[] or Set<string> */
  selectedAccountIds: string[] | Set<string>;
  /** Selection change callback returning string[] of selected IDs */
  onChange: (selectedIds: string[]) => void;
  /** Custom header title (default: "Pilih Akun Telegram") */
  title?: string;
  /** Custom subtitle/description */
  description?: string;
  /** Optional step number badge (e.g., 1, 2) */
  stepNumber?: number | string;
  /** Optional folders override */
  folders?: AccountFolder[];
  /** Whether interaction is disabled */
  disabled?: boolean;
  /** Error state flag for validation highlight */
  error?: boolean;
  /** Optional error message below the selector */
  errorMessage?: string;
  /** Max height class for the scrollable area (default: "max-h-60 sm:max-h-64") */
  maxHeight?: string;
  /** Number of desktop columns: 2 or 3 (default: 2) */
  columns?: 2 | 3;
  /** Show spam / limited status badge (default: true) */
  showSpamStatus?: boolean;
  /** Additional container styling */
  className?: string;
  /** Visual variant: 'card' (with background & border) or 'plain' (transparent wrapper) */
  variant?: "card" | "plain";
}

export function AccountSelector({
  accounts = [],
  isLoading = false,
  selectedAccountIds,
  onChange,
  title,
  description,
  stepNumber,
  folders: propFolders,
  disabled = false,
  error = false,
  errorMessage,
  maxHeight = "max-h-60 sm:max-h-64",
  columns = 2,
  showSpamStatus = true,
  className,
  variant = "card",
}: AccountSelectorProps) {
  const _ = useT();

  // Internal state for folder filter and search
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch folders if not provided by parent
  const { data: fetchedFolders } = useAccountFolders();
  const activeFolders = propFolders ?? fetchedFolders ?? [];

  // Normalize selected IDs to a Set for fast lookup
  const selectedSet = useMemo(() => {
    if (selectedAccountIds instanceof Set) {
      return selectedAccountIds;
    }
    return new Set(selectedAccountIds);
  }, [selectedAccountIds]);

  // Filter accounts based on active status, folder, and search query
  const filteredAccounts = useMemo(() => {
    return accounts.filter((acc) => {
      // Folder filter
      if (selectedFolderId && !acc.folder_ids?.includes(selectedFolderId)) {
        return false;
      }
      // Search query (matches first_name, last_name, phone, username)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const fullName = `${acc.first_name || ""} ${acc.last_name || ""}`.toLowerCase();
        const phone = (acc.phone || "").toLowerCase();
        const username = (acc.username || "").toLowerCase();
        return fullName.includes(q) || phone.includes(q) || username.includes(q);
      }
      return true;
    });
  }, [accounts, selectedFolderId, searchQuery]);

  // Selection handlers
  const handleToggle = (id: string) => {
    if (disabled) return;
    const nextSet = new Set(selectedSet);
    if (nextSet.has(id)) {
      nextSet.delete(id);
    } else {
      nextSet.add(id);
    }
    onChange(Array.from(nextSet));
  };

  const handleSelectAll = () => {
    if (disabled || filteredAccounts.length === 0) return;
    const nextSet = new Set(selectedSet);
    filteredAccounts.forEach((acc) => nextSet.add(acc.id));
    onChange(Array.from(nextSet));
  };

  const handleDeselectAll = () => {
    if (disabled) return;
    // Deselect only filtered accounts or all selected
    const nextSet = new Set(selectedSet);
    filteredAccounts.forEach((acc) => nextSet.delete(acc.id));
    onChange(Array.from(nextSet));
  };

  const isAllFilteredSelected =
    filteredAccounts.length > 0 &&
    filteredAccounts.every((acc) => selectedSet.has(acc.id));

  return (
    <div
      className={cn(
        "space-y-4",
        variant === "card" &&
          "bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 p-5 shadow-xs",
        className
      )}
    >
      {/* ── 1. Header Toolbar ────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {stepNumber !== undefined && (
            <div className="w-8 h-8 rounded-xl bg-primary-50 dark:bg-primary-950/60 text-primary-600 dark:text-primary-400 font-bold text-xs flex items-center justify-center shrink-0 border border-primary-100 dark:border-primary-900/50">
              {stepNumber}
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-gray-900 dark:text-slate-100">
                {title || _("invite.selectAccounts") || "Pilih Akun Telegram"}
              </h3>
              <Badge variant="secondary" className="text-[11px] font-semibold py-0.5 px-2">
                {selectedSet.size} / {accounts.length} {_("invite.selected") || "dipilih"}
              </Badge>
            </div>
            {description && (
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                {description}
              </p>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 text-xs font-semibold shrink-0">
          <button
            type="button"
            onClick={isAllFilteredSelected ? handleDeselectAll : handleSelectAll}
            disabled={disabled || accounts.length === 0}
            className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 disabled:opacity-50 transition"
          >
            {isAllFilteredSelected
              ? _("invite.deselectAll") || "Batal Pilih"
              : _("invite.selectAll") || "Pilih Semua"}
          </button>
          <span className="text-gray-300 dark:text-slate-700">|</span>
          <button
            type="button"
            onClick={() => onChange([])}
            disabled={disabled || selectedSet.size === 0}
            className="text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 disabled:opacity-50 transition"
          >
            {_("orders.clear") || "Bersihkan"}
          </button>
        </div>
      </div>

      {/* ── 2. Folder Tabs & Search Bar ──────────────────────────────────── */}
      {activeFolders.length > 0 && (
        <div className="pt-1">
          <FolderFilterBar
            folders={activeFolders}
            selectedFolderId={selectedFolderId}
            onSelect={setSelectedFolderId}
          />
        </div>
      )}

      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-slate-500" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          disabled={disabled || accounts.length === 0}
          placeholder={
            _("invite.searchAccountsPlaceholder") || "Cari akun berdasarkan nama, nomor telepon, atau username..."
          }
          className="w-full pl-9.5 pr-8 py-2 text-xs sm:text-sm bg-gray-50 dark:bg-slate-800/80 border border-gray-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-gray-900 dark:text-slate-100 placeholder:text-gray-400 transition"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-slate-200"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* ── 3. Accounts Grid ─────────────────────────────────────────────── */}
      <div
        className={cn(
          "rounded-xl border p-2 transition-colors",
          error
            ? "border-destructive/60 bg-destructive/5"
            : "border-gray-200 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-950/30"
        )}
      >
        {isLoading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2 text-gray-400 dark:text-slate-500 text-xs">
            <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span>Memuat daftar akun...</span>
          </div>
        ) : accounts.length === 0 ? (
          <div className="py-10 text-center space-y-2">
            <Users className="h-8 w-8 text-gray-400 mx-auto opacity-40" />
            <p className="text-xs text-gray-500 dark:text-slate-400">
              {_("invite.noActiveAccounts") || "Tidak ada akun aktif yang tersedia."}
            </p>
          </div>
        ) : filteredAccounts.length === 0 ? (
          <div className="py-8 text-center space-y-1 text-xs text-gray-500 dark:text-slate-400">
            <p className="font-semibold text-gray-700 dark:text-slate-300">Tidak ada akun yang sesuai filter</p>
            <p className="text-[11px] text-gray-400">Coba ubah kata kunci pencarian atau pilih folder lain.</p>
          </div>
        ) : (
          <div
            className={cn(
              "grid gap-2 overflow-y-auto pr-1 scrollbar-thin",
              maxHeight,
              columns === 3
                ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
                : "grid-cols-1 sm:grid-cols-2"
            )}
          >
            {filteredAccounts.map((acc) => {
              const isSelected = selectedSet.has(acc.id);
              const displayName = acc.first_name
                ? `${acc.first_name} ${acc.last_name || ""}`.trim()
                : acc.phone;

              return (
                <div
                  key={acc.id}
                  onClick={() => handleToggle(acc.id)}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-xl border cursor-pointer select-none transition-all duration-200 relative group",
                    isSelected
                      ? "border-primary bg-primary/10 dark:bg-primary-950/60 ring-2 ring-primary/20 shadow-xs"
                      : "border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-gray-300 dark:hover:border-slate-700 hover:bg-gray-50/50 dark:hover:bg-slate-800/40",
                    disabled && "pointer-events-none opacity-60"
                  )}
                >
                  {/* Selection Checkbox */}
                  <Checkbox
                    checked={isSelected}
                    className="pointer-events-none shrink-0"
                  />

                  {/* Account Avatar with Telegram color/initials fallback */}
                  <AccountAvatar
                    accountId={acc.id}
                    telegramId={acc.telegram_id}
                    firstName={acc.first_name}
                    phone={acc.phone}
                    photoVersion={acc.photo_version}
                    colorId={acc.color_id}
                    hasProfilePhoto={acc.has_profile_photo}
                    isActive={acc.is_active}
                    profilePhotoPath={acc.profile_photo_path}
                    size="md"
                    className="shrink-0"
                  />

                  {/* Account Name & Handle */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-slate-100 truncate">
                        {displayName}
                      </p>
                      {/* Premium indicator */}
                      {(acc as any).is_premium && (
                        <Star className="size-3 text-amber-500 fill-amber-500 shrink-0" />
                      )}
                    </div>
                    <p className="text-[11px] text-gray-500 dark:text-slate-400 font-mono truncate">
                      {acc.username ? `@${acc.username}` : acc.phone}
                    </p>
                  </div>

                  {/* Status Badges / Dot */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {showSpamStatus && acc.spam_status === "limited" ? (
                      <Badge
                        variant="destructive"
                        className="text-[10px] py-0 px-1.5 h-4 font-semibold gap-1"
                      >
                        <ShieldAlert className="size-2.5" />
                        Limited
                      </Badge>
                    ) : (
                      <span
                        className={cn(
                          "w-2 h-2 rounded-full",
                          acc.is_active
                            ? "bg-emerald-500 shadow-xs shadow-emerald-500/50"
                            : "bg-red-400"
                        )}
                        title={acc.is_active ? "Aktif" : "Tidak Aktif"}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Error message */}
      {error && errorMessage && (
        <p className="text-xs font-semibold text-destructive animate-fadeIn">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
