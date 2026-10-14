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
  /** Custom search placeholder */
  searchPlaceholder?: string;
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
  searchPlaceholder,
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
      // Search query (smart matching: first_name, last_name, phone, @username, telegram_id)
      if (searchQuery.trim()) {
        const rawQ = searchQuery.toLowerCase().trim();
        const cleanQ = rawQ.replace(/^@/, "");
        const digitQ = rawQ.replace(/\D/g, "");

        const fullName = `${acc.first_name || ""} ${acc.last_name || ""}`.toLowerCase();
        const username = (acc.username || "").toLowerCase().replace(/^@/, "");
        const rawPhone = (acc.phone || "").toLowerCase();
        const digitPhone = rawPhone.replace(/\D/g, "");
        const tgId = String(acc.telegram_id || "");

        const matchName = fullName.includes(rawQ) || (cleanQ.length > 0 && fullName.includes(cleanQ));
        const matchUsername = username.includes(cleanQ);
        const matchPhone =
          rawPhone.includes(rawQ) ||
          (digitQ.length >= 3 && digitPhone.includes(digitQ));
        const matchTgId = tgId.includes(rawQ);

        return matchName || matchUsername || matchPhone || matchTgId;
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
          "bg-card rounded-2xl border border-border p-5 shadow-xs",
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
              <h3 className="text-sm font-bold text-foreground">
                {title || _("accountSelector.defaultTitle")}
              </h3>
              <Badge variant="secondary" className="text-[11px] font-semibold py-0.5 px-2">
                {selectedSet.size} / {accounts.length} {_("accountSelector.selectedBadge")}
              </Badge>
            </div>
            {description && (
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                {description}
              </p>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={isAllFilteredSelected ? handleDeselectAll : handleSelectAll}
            disabled={disabled || accounts.length === 0}
            className="px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-card hover:bg-accent text-xs font-semibold text-primary disabled:opacity-50 transition shadow-2xs cursor-pointer"
          >
            {isAllFilteredSelected
              ? _("accountSelector.deselectAll")
              : _("accountSelector.selectAll")}
          </button>
          <button
            type="button"
            onClick={() => onChange([])}
            disabled={disabled || selectedSet.size === 0}
            className="px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-card hover:bg-accent text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50 transition shadow-2xs cursor-pointer"
          >
            {_("accountSelector.clear")}
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
      <div className="space-y-1.5">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            id="account-selector-search"
            name="searchQuery"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setSearchQuery("");
            }}
            disabled={disabled || accounts.length === 0}
            placeholder={
              searchPlaceholder ||
              _("accountSelector.searchPlaceholder")
            }
            aria-label={
              searchPlaceholder ||
              _("accountSelector.searchPlaceholder")
            }
            className="w-full pl-10 pr-9 py-2.5 text-xs sm:text-sm bg-card border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-foreground placeholder:text-muted-foreground transition shadow-2xs"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              title={_("accountSelector.clearSearchTooltip")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Info hasil filter jika pencarian atau folder aktif */}
        {(searchQuery.trim() !== "" || selectedFolderId !== null) && accounts.length > 0 && (
          <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1 pt-0.5">
            <span>
              {_("accountSelector.showingResults", {
                filtered: filteredAccounts.length,
                total: accounts.length,
              })}
            </span>
            <div className="flex items-center gap-2 font-medium">
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="text-primary hover:underline cursor-pointer"
                >
                  {_("accountSelector.resetSearch")}
                </button>
              )}
              {selectedFolderId && (
                <button
                  type="button"
                  onClick={() => setSelectedFolderId(null)}
                  className="text-muted-foreground hover:text-foreground hover:underline cursor-pointer"
                >
                  {_("accountSelector.allFolders")}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── 3. Accounts Grid ─────────────────────────────────────────────── */}
      <div
        className={cn(
          "rounded-xl border p-2 transition-colors",
          error
            ? "border-destructive/60 bg-destructive/5"
            : "border-border bg-muted/20"
        )}
      >
        {isLoading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2 text-muted-foreground text-xs">
            <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span>{_("accountSelector.loading")}</span>
          </div>
        ) : accounts.length === 0 ? (
          <div className="py-10 text-center space-y-2">
            <Users className="h-8 w-8 text-muted-foreground mx-auto opacity-40" />
            <p className="text-xs text-muted-foreground">
              {_("accountSelector.noActiveAccounts")}
            </p>
          </div>
        ) : filteredAccounts.length === 0 ? (
          <div className="py-8 text-center space-y-2 text-xs text-muted-foreground">
            <p className="font-semibold text-foreground">
              {_("accountSelector.noMatchingAccounts")}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {_("accountSelector.noMatchingDesc")}
            </p>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="mt-1 inline-flex items-center gap-1.5 px-3 py-1 bg-card border border-border text-foreground rounded-lg text-xs font-medium hover:bg-accent transition shadow-2xs cursor-pointer"
              >
                {_("accountSelector.clearSearchBtn")}
              </button>
            )}
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
                      : "border-border bg-card hover:border-slate-300 dark:hover:border-slate-700 hover:bg-muted/40",
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
                      <p className="text-xs sm:text-sm font-semibold text-foreground truncate">
                        {displayName}
                      </p>
                      {/* Premium indicator */}
                      {(acc as any).is_premium && (
                        <Star className="size-3 text-amber-500 fill-amber-500 shrink-0" />
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground font-mono truncate">
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
                            : "bg-rose-500"
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
