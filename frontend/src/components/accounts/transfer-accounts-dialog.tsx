"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  ArrowRightLeft,
  X,
  Search,
  Check,
  AlertTriangle,
  Loader2,
  Mail,
  User as UserIcon,
  ShieldAlert,
  Info,
  Smartphone,
} from "lucide-react";
import { useAuthStore } from "@/store/auth-store";
import { useAccounts, useTransferAccounts, type Account } from "@/hooks/use-accounts";
import { Badge } from "@/components/ui/badge";
import { AccountAvatar } from "@/components/accounts/account-avatar";
import { useToast } from "@/components/ui/toast";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { useT } from "@/lib/i18n";

const ROLE_LIMITS: Record<string, number> = {
  basic: 1,
  pro: 10,
  premium: 100,
  owner: 999999,
};

interface AdminUserItem {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  is_active: boolean;
  connected_accounts?: number;
  active_accounts?: number;
}

interface TransferAccountsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSelectedAccounts?: Account[];
}

export function TransferAccountsDialog({
  open,
  onOpenChange,
  initialSelectedAccounts = [],
}: TransferAccountsDialogProps) {
  const _ = useT();
  const currentUser = useAuthStore((s) => s.user);
  const isOwner = currentUser?.role === "owner";
  const { toast } = useToast();

  const { data: accountsData, isLoading: accountsLoading } = useAccounts();
  const allAccounts = useMemo(
    () => (Array.isArray(accountsData) ? accountsData : []),
    [accountsData]
  );

  const transferMutation = useTransferAccounts();

  // Selection states
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [accountSearch, setAccountSearch] = useState("");

  // Target user states
  const [targetEmail, setTargetEmail] = useState("");
  const [debouncedEmail, setDebouncedEmail] = useState("");
  const [overrideLimit, setOverrideLimit] = useState(false);
  const [userSuggestions, setUserSuggestions] = useState<AdminUserItem[]>([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);
  const [selectedTargetUser, setSelectedTargetUser] = useState<AdminUserItem | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync initial accounts when opened
  useEffect(() => {
    if (open) {
      if (initialSelectedAccounts.length > 0) {
        setSelectedIds(new Set(initialSelectedAccounts.map((a) => a.id)));
      } else {
        setSelectedIds(new Set());
      }
      setTargetEmail("");
      setDebouncedEmail("");
      setSelectedTargetUser(null);
      setOverrideLimit(false);
      setAccountSearch("");
    }
  }, [open, initialSelectedAccounts]);

  // Debounce email search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedEmail(targetEmail.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [targetEmail]);

  // Fetch user suggestions when typing
  useEffect(() => {
    if (!open || !isOwner || debouncedEmail.length < 2) {
      setUserSuggestions([]);
      return;
    }

    let active = true;
    setIsSearchingUsers(true);

    api
      .get(`/admin/users?search=${encodeURIComponent(debouncedEmail)}&limit=5`)
      .then((res) => {
        if (active) {
          const list: AdminUserItem[] = res.data?.users || [];
          // Filter out current user from suggestions
          const filtered = list.filter((u) => u.email.toLowerCase() !== currentUser?.email.toLowerCase());
          setUserSuggestions(filtered);

          // If exact match found
          const exact = filtered.find(
            (u) => u.email.toLowerCase() === debouncedEmail.toLowerCase()
          );
          if (exact) {
            setSelectedTargetUser(exact);
          }
        }
      })
      .catch(() => {
        if (active) setUserSuggestions([]);
      })
      .finally(() => {
        if (active) setIsSearchingUsers(false);
      });

    return () => {
      active = false;
    };
  }, [debouncedEmail, open, isOwner, currentUser?.email]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filtered accounts list
  const filteredAccounts = useMemo(() => {
    const term = accountSearch.toLowerCase().trim();
    if (!term) return allAccounts;
    return allAccounts.filter((a) => {
      const phone = a.phone?.toLowerCase() || "";
      const first = a.first_name?.toLowerCase() || "";
      const last = a.last_name?.toLowerCase() || "";
      const uname = a.username?.toLowerCase() || "";
      return phone.includes(term) || first.includes(term) || last.includes(term) || uname.includes(term);
    });
  }, [allAccounts, accountSearch]);

  const transferableAccounts = useMemo(
    () => allAccounts.filter((a) => !a.for_sale),
    [allAccounts]
  );

  const toggleSelectAccount = (id: string, disabled: boolean) => {
    if (disabled) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    const next = new Set<string>();
    filteredAccounts.forEach((a) => {
      if (!a.for_sale) next.add(a.id);
    });
    setSelectedIds(next);
  };

  const handleDeselectAll = () => {
    setSelectedIds(new Set());
  };

  // Quota calculation
  const targetRoleLimit = selectedTargetUser ? ROLE_LIMITS[selectedTargetUser.role] ?? 1 : null;
  const targetCurrentAccounts = selectedTargetUser?.connected_accounts ?? 0;
  const isExceedingQuota =
    targetRoleLimit !== null &&
    selectedTargetUser?.role !== "owner" &&
    targetCurrentAccounts + selectedIds.size > targetRoleLimit;

  // Auto-enable override when exceeding quota
  useEffect(() => {
    if (isExceedingQuota) {
      setOverrideLimit(true);
    }
  }, [isExceedingQuota]);

  // Submit handler
  const handleTransfer = async () => {
    if (selectedIds.size === 0) {
      toast({
        variant: "warning",
        title: _("transferAccounts.toastSelectWarningTitle"),
        description: _("transferAccounts.toastSelectWarningDesc"),
      });
      return;
    }

    const email = targetEmail.trim();
    if (!email) {
      toast({
        variant: "warning",
        title: _("transferAccounts.toastEmailWarningTitle"),
        description: _("transferAccounts.toastEmailWarningDesc"),
      });
      return;
    }

    try {
      const res = await transferMutation.mutateAsync({
        account_ids: Array.from(selectedIds),
        target_email: email,
        override_limit: overrideLimit,
      });

      toast({
        variant: "success",
        title: _("transferAccounts.toastSuccessTitle"),
        description: _("transferAccounts.toastSuccessDesc", {
          count: res.transferred_count,
          email: res.target_email,
          name: res.target_name,
        }),
      });

      onOpenChange(false);
    } catch (err: any) {
      const detail =
        err?.response?.data?.detail ||
        err?.message ||
        _("transferAccounts.toastFailedDesc");
      toast({
        variant: "error",
        title: _("transferAccounts.toastFailedTitle"),
        description: detail,
      });
    }
  };

  if (!isOwner) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        if (!transferMutation.isPending) onOpenChange(val);
      }}
    >
      <DialogContent className="max-w-2xl p-0 max-h-[90vh] flex flex-col overflow-hidden bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800">
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-800/40 text-left pr-12">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
              <ArrowRightLeft className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <DialogTitle className="text-lg font-semibold text-gray-900 dark:text-slate-100">
                  {_("transferAccounts.dialogTitle")}
                </DialogTitle>
                <Badge variant="secondary" className="text-[11px] font-semibold bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800">
                  {_("transferAccounts.ownerOnly")}
                </Badge>
              </div>
              <DialogDescription className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                {_("transferAccounts.dialogDesc")}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* 1. Recipient Email Search */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-900 dark:text-slate-200 flex items-center gap-1.5">
              <Mail className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              {_("transferAccounts.recipientEmailLabel")}
              <span className="text-red-500">*</span>
            </label>
            <div className="relative" ref={dropdownRef}>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-slate-400" />
                <input
                  type="email"
                  value={targetEmail}
                  onChange={(e) => {
                    setTargetEmail(e.target.value);
                    setShowDropdown(true);
                    setSelectedTargetUser(null);
                  }}
                  onFocus={() => setShowDropdown(true)}
                  placeholder={_("transferAccounts.searchEmailPlaceholder")}
                  disabled={transferMutation.isPending}
                  className="w-full pl-9 pr-10 py-2.5 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-xl text-sm text-gray-900 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                />
                {isSearchingUsers && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-500 animate-spin" />
                )}
              </div>

              {/* Suggestions Dropdown */}
              {showDropdown && userSuggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-lg z-20 overflow-hidden divide-y divide-gray-100 dark:divide-slate-700/60 max-h-56 overflow-y-auto">
                  {userSuggestions.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => {
                        setTargetEmail(u.email);
                        setSelectedTargetUser(u);
                        setShowDropdown(false);
                      }}
                      className="w-full px-4 py-2.5 text-left flex items-center justify-between hover:bg-blue-50/70 dark:hover:bg-slate-700/60 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center font-medium text-xs shrink-0">
                          {u.full_name ? u.full_name.charAt(0).toUpperCase() : u.email.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-slate-100 truncate">
                            {u.full_name || "Tanpa Nama"}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-slate-400 truncate">
                            {u.email}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge
                          variant={
                            u.role === "owner" ? "secondary" :
                            u.role === "premium" ? "warning" :
                            u.role === "pro" ? "info" : "outline"
                          }
                          className="capitalize text-[11px]"
                        >
                          {u.role}
                        </Badge>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Selected Target User Preview Card */}
            {selectedTargetUser && (
              <div className="mt-2 p-3 bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200/80 dark:border-blue-900/60 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                    {selectedTargetUser.full_name
                      ? selectedTargetUser.full_name.charAt(0).toUpperCase()
                      : selectedTargetUser.email.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <span className="font-semibold text-gray-900 dark:text-slate-100">
                      {selectedTargetUser.full_name || "Tanpa Nama"}
                    </span>
                    <span className="text-gray-500 dark:text-slate-400 ml-1.5">
                      ({selectedTargetUser.email})
                    </span>
                    <div className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">
                      Role: <strong className="capitalize">{selectedTargetUser.role}</strong> • Akun saat ini:{" "}
                      <strong>{targetCurrentAccounts}</strong> /{" "}
                      {targetRoleLimit === 999999 ? "Unlimited" : targetRoleLimit}
                    </div>
                  </div>
                </div>

                {isExceedingQuota && (
                  <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-300 font-medium">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>Melebihi kuota role</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 2. Account Selector */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="text-sm font-semibold text-gray-900 dark:text-slate-200 flex items-center gap-1.5">
                <Smartphone className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                {_("transferAccounts.selectAccountsLabel")}
                <Badge variant="info" className="text-xs font-semibold">
                  {selectedIds.size} {_("accountSelector.selectedBadge")}
                </Badge>
              </label>

              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                >
                  {_("transferAccounts.selectAll")} ({transferableAccounts.length})
                </button>
                <span className="text-gray-300 dark:text-slate-700">•</span>
                <button
                  type="button"
                  onClick={handleDeselectAll}
                  className="text-gray-500 dark:text-slate-400 hover:underline"
                >
                  {_("transferAccounts.deselectAll")}
                </button>
              </div>
            </div>

            {/* Search within accounts if more than 5 */}
            {allAccounts.length > 5 && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input
                  type="text"
                  value={accountSearch}
                  onChange={(e) => setAccountSearch(e.target.value)}
                  placeholder="Cari nomor telepon atau nama akun..."
                  className="w-full pl-8 pr-3 py-1.5 bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 rounded-lg text-xs text-gray-900 dark:text-slate-100 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            )}

            {/* Accounts List Container */}
            <div className="border border-gray-200 dark:border-slate-800 rounded-xl overflow-hidden divide-y divide-gray-100 dark:divide-slate-800/80 max-h-60 overflow-y-auto bg-gray-50/30 dark:bg-slate-900/30">
              {accountsLoading ? (
                <div className="py-8 flex flex-col items-center justify-center text-gray-400">
                  <Loader2 className="h-6 w-6 animate-spin mb-2" />
                  <span className="text-xs">Memuat akun...</span>
                </div>
              ) : filteredAccounts.length === 0 ? (
                <div className="py-8 text-center text-xs text-gray-400">
                  Tidak ada akun yang sesuai dengan pencarian.
                </div>
              ) : (
                filteredAccounts.map((account) => {
                  const isSelected = selectedIds.has(account.id);
                  const isForSale = account.for_sale;

                  return (
                    <div
                      key={account.id}
                      onClick={() => toggleSelectAccount(account.id, isForSale)}
                      className={cn(
                        "flex items-center justify-between p-3 transition-colors select-none",
                        isForSale
                          ? "opacity-50 bg-gray-50 dark:bg-slate-800/40 cursor-not-allowed"
                          : isSelected
                          ? "bg-blue-50/70 dark:bg-blue-950/30 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950/40"
                          : "hover:bg-gray-50 dark:hover:bg-slate-800/50 cursor-pointer"
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Checkbox */}
                        <div
                          className={cn(
                            "w-4 h-4 rounded flex items-center justify-center border transition-colors shrink-0",
                            isForSale
                              ? "border-gray-300 dark:border-slate-700 bg-gray-100 dark:bg-slate-800"
                              : isSelected
                              ? "bg-blue-600 border-blue-600 text-white"
                              : "border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800"
                          )}
                        >
                          {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                        </div>

                        {/* Avatar */}
                        <AccountAvatar
                          accountId={account.id}
                          firstName={account.first_name}
                          phone={account.phone}
                          telegramId={account.telegram_id}
                          colorId={account.color_id}
                          photoVersion={account.photo_version}
                          hasProfilePhoto={account.has_profile_photo}
                          isActive={account.is_active}
                          profilePhotoPath={account.profile_photo_path}
                          size="sm"
                        />

                        {/* Info */}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-semibold text-gray-900 dark:text-slate-100 font-mono truncate">
                              {account.phone}
                            </span>
                            {account.username && (
                              <span className="text-xs text-gray-400 truncate">
                                @{account.username}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 dark:text-slate-400 truncate">
                            {[account.first_name, account.last_name].filter(Boolean).join(" ") || "Tanpa Nama"}
                            {account.telegram_id && ` • ID: ${account.telegram_id}`}
                          </p>
                        </div>
                      </div>

                      {/* Right status */}
                      <div className="shrink-0 flex items-center gap-2">
                        {isForSale ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                            Dijual di Marketplace
                          </span>
                        ) : (
                          <span
                            className={cn(
                              "px-2 py-0.5 rounded text-[10px] font-semibold capitalize",
                              account.is_active
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                                : "bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-400"
                            )}
                          >
                            {account.is_active ? "Aktif" : "Nonaktif"}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* 3. Override Limit Option & Notices */}
          <div className="space-y-3 pt-2">
            <div className="p-3.5 bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700/80 rounded-xl space-y-2">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <Checkbox
                  id="override-limit"
                  checked={overrideLimit}
                  onCheckedChange={(checked) => setOverrideLimit(!!checked)}
                  disabled={transferMutation.isPending}
                  className="mt-0.5"
                />
                <div className="text-xs">
                  <span className="font-semibold text-gray-900 dark:text-slate-100">
                    Abaikan batasan kuota akun user tujuan (Override Limit)
                  </span>
                  <p className="text-gray-500 dark:text-slate-400 mt-0.5">
                    Sebagai owner, Anda berhak mentransfer akun melebihi kuota role standar pengguna penerima (Basic: 1, Pro: 10, Premium: 100).
                  </p>
                </div>
              </label>

              {isExceedingQuota && !overrideLimit && (
                <div className="flex items-center gap-2 p-2 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg text-amber-800 dark:text-amber-300 text-xs">
                  <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <span>
                    Jumlah transfer melebihi sisa kuota penerima. Aktifkan opsi ini untuk melanjutkan.
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-start gap-2 text-xs text-gray-500 dark:text-slate-400 px-1">
              <Info className="h-4 w-4 shrink-0 text-blue-500 mt-0.5" />
              <span>
                Akun yang dipindahkan akan dicopot dari folder Anda dan sepenuhnya menjadi milik akun penerima. Sesi Telegram aktif akan dialihkan secara otomatis.
              </span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-800/40">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={transferMutation.isPending}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
          >
            {_("transferAccounts.cancel")}
          </button>

          <button
            type="button"
            onClick={handleTransfer}
            disabled={
              transferMutation.isPending ||
              selectedIds.size === 0 ||
              !targetEmail.trim() ||
              (isExceedingQuota && !overrideLimit)
            }
            className={cn(
              "inline-flex items-center justify-center gap-2 px-5 py-2 text-sm font-semibold rounded-xl text-white transition-all shadow-sm",
              transferMutation.isPending ||
                selectedIds.size === 0 ||
                !targetEmail.trim() ||
                (isExceedingQuota && !overrideLimit)
                ? "bg-blue-400 dark:bg-blue-600/50 cursor-not-allowed opacity-60"
                : "bg-blue-600 hover:bg-blue-700 active:scale-[0.98] shadow-blue-500/20"
            )}
          >
            {transferMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{_("transferAccounts.transferring")}</span>
              </>
            ) : (
              <>
                <ArrowRightLeft className="h-4 w-4" />
                <span>
                  {selectedIds.size > 0
                    ? _("transferAccounts.transferBtnCount", { count: selectedIds.size })
                    : _("transferAccounts.transferBtn")}
                </span>
              </>
            )}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
