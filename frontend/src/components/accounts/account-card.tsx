import { type Account } from "@/hooks/use-accounts";
import { useAccountStats, type AccountStats } from "@/hooks/use-account-stats";
import { cn } from "@/lib/utils";
import { Eye, Trash2, Copy, Check, Users, MessageCircle, RefreshCw, Clock, DollarSign, X, ArrowRightLeft, Star } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useState, useCallback } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import api from "@/lib/api";
import { AccountAvatar } from "@/components/accounts/account-avatar";
import {
  isMarketplaceSellUnknownOutcome,
  useSellAccounts,
  useMarketplacePricing,
  useCancelSellAccount,
} from "@/hooks/use-marketplace";
import { useToast } from "@/components/ui/toast";
import { useAuthStore } from "@/store/auth-store";


interface AccountCardProps {
  account: Account;
  onDelete: (id: string) => void;
  onView: (id: string) => void;
  onTransfer?: (account: Account) => void;
}

function CopyableId({ id }: { id: number | null }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (id === null || id === undefined) return;
    try {
      await navigator.clipboard.writeText(String(id));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available
    }
  }, [id]);

  if (id === null || id === undefined) return <span className="text-sm text-muted-foreground">—</span>;

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1 text-sm font-mono text-foreground hover:text-primary transition-colors group cursor-pointer"
    >
      <span>{id}</span>
      {copied ? (
        <Check className="h-3 w-3 text-emerald-500" />
      ) : (
        <Copy className="h-3 w-3 text-muted-foreground group-hover:text-primary transition-colors" />
      )}
    </button>
  );
}

export function AccountCard({ account, onDelete, onView, onTransfer }: AccountCardProps) {
  const _ = useT();
  const { toast } = useToast();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Stats now arrive with the list response. Keep the per-account query only
  // as the refresh path, and only enable it while a manual refresh is running,
  // so the accounts list no longer fires one request per card
  // (PYTHON-FASTAPI-10).
  const { data: refreshedStats, refetch: refetchStats } = useAccountStats(account.id, {
    enabled: refreshing,
  });
  // Normalise: the list response marks stats optional, the refresh response
  // does not. Keep the render block below working on plain numbers.
  const stats = (refreshedStats ?? account) as AccountStats;

  const [sellOpen, setSellOpen] = useState(false);
  const sellAccountsMutation = useSellAccounts();
  const { data: pricing } = useMarketplacePricing();
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const [selling, setSelling] = useState(false);

  const [cancelSellOpen, setCancelSellOpen] = useState(false);
  const cancelSellMutation = useCancelSellAccount();
  const [canceling, setCanceling] = useState(false);

  const handleSellConfirm = async () => {
    setSelling(true);
    try {
      await sellAccountsMutation.mutateAsync([account.id]);
      void fetchMe();
      setSellOpen(false);
    } catch (err: any) {
      console.error(err);
      const isUnknownOutcome = isMarketplaceSellUnknownOutcome(err);
      toast({
        variant: "error",
        title: isUnknownOutcome ? "Sale status needs confirmation" : "Unable to sell account",
        description: isUnknownOutcome
          ? "Telegram may have finished updating this account. We refreshed your accounts—check its sale status before trying again."
          : err?.response?.data?.detail || "The account was not listed. Please try again.",
      });
      if (isUnknownOutcome) {
        setSellOpen(false);
      }
    } finally {
      setSelling(false);
    }
  };

  const handleCancelSellConfirm = async () => {
    setCanceling(true);
    try {
      await cancelSellMutation.mutateAsync(account.id);
      await fetchMe();
      setCancelSellOpen(false);
    } catch (err) {
      console.error(err);
    } finally {
      setCanceling(false);
    }
  };


  const formatOwned = (total: number, owned: number) => {
    if (owned > 0) {
      return `${total} (${_("accountDetail.owned", { count: String(owned) })})`;
    }
    return String(total);
  };

  const timeAgo = (dateStr: string | null): string => {
    if (!dateStr) return "—";
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diffMs = now - then;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}h ago`;
    const diffDay = Math.floor(diffHour / 24);
    return `${diffDay}d ago`;
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await api.post(`/accounts/${account.id}/stats/refresh`);
      await refetchStats();
    } catch {
      // Silently fail — stats will update on next background run
    } finally {
      setRefreshing(false);
    }
  };

  const isRestricted = !account.is_active || account.for_sale;
  const isExpired = !account.is_active && !account.for_sale;

  return (
    <div
      className={cn(
        "rounded-xl transition-all h-full flex flex-col justify-between relative overflow-hidden bg-card text-card-foreground border border-border shadow-xs hover:border-slate-300 dark:hover:border-slate-700",
        account.is_premium && "border-sky-300 dark:border-sky-700/80 shadow-xs"
      )}
    >
      {/* Telegram Premium Top-Right Badge */}
      {account.is_premium && (
        <div className="absolute top-2.5 right-2.5 z-10 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800 text-sky-700 dark:text-sky-300 shadow-2xs">
          <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
          <span>Premium</span>
        </div>
      )}

      {/* Profile section */}
      <div className="p-5 pb-3">
        <div className="flex items-start gap-3">
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
            size="xl"
            className={account.is_premium ? "ring-2 ring-sky-500 ring-offset-2 ring-offset-card" : undefined}
          />
          <div className="min-w-0 flex-1">
            <div className={cn("flex items-center gap-1.5 min-w-0", account.is_premium && "pr-20")}>
              <h2 className="font-semibold text-sm text-foreground truncate">
                {account.first_name || _("accountCard.unnamed")} {account.last_name || ""}
              </h2>
              {account.is_premium && (
                <span title="Telegram Premium" className="inline-flex items-center shrink-0 text-amber-500">
                  <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
                </span>
              )}
            </div>
            {account.username && (
              <p className="text-xs text-muted-foreground truncate">@{account.username}</p>
            )}
            <p className="text-xs text-muted-foreground truncate">{account.phone}</p>
            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-[11px] text-muted-foreground font-medium">User ID:</span>
              <CopyableId id={account.telegram_id} />
            </div>
            {account.est_reg_date_age && (
              <div className="flex items-center gap-1 mt-0.5 text-[11px] text-muted-foreground">
                <span className="text-muted-foreground font-medium">Est. Age:</span>
                <span className="font-semibold text-foreground" title={account.est_reg_date_status || undefined}>
                  {account.est_reg_date_age}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stats row - flat divider without nested card background */}
      <div className="px-5 py-2.5 border-y border-gray-100 dark:border-slate-700/80">
        {refreshing && !refreshedStats ? (
          <div className="flex gap-3">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-20" />
          </div>
        ) : stats ? (
          <>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {stats.contacts_count > 0 && (
                <div>
                  <span className="text-gray-500 dark:text-slate-300">{_("accountDetail.contacts")}: </span>
                  <span className="font-medium text-gray-800 dark:text-slate-100">{stats.contacts_count}</span>
                </div>
              )}
              <div>
                <span className="text-gray-500 dark:text-slate-300">{_("accountDetail.groups")}: </span>
                <span className="font-medium text-gray-800 dark:text-slate-100">
                  {formatOwned(stats.total_groups, stats.owned_groups)}
                </span>
              </div>
              <div>
                <span className="text-gray-500 dark:text-slate-300">{_("accountDetail.channels")}: </span>
                <span className="font-medium text-gray-800 dark:text-slate-100">
                  {formatOwned(stats.total_channels, stats.owned_channels)}
                </span>
              </div>
              <div>
                <span className="text-gray-500 dark:text-slate-300">{_("accountDetail.devices") || "Devices"}: </span>
                <Link
                  href={`/accounts/${account.id}/devices`}
                  className="font-medium text-gray-800 dark:text-slate-100 hover:text-primary hover:underline transition-colors cursor-pointer"
                  title={_("accountDetail.devicesDesc") || "Lihat perangkat terhubung"}
                >
                  {stats.device_count ?? account.device_count ?? 1}
                </Link>
              </div>
            </div>
            <div className="flex items-center gap-1 mt-1.5 text-[11px] text-gray-500 dark:text-slate-300">
              <Clock className="h-3 w-3" />
              <span>Updated {timeAgo(stats.stats_updated_at)}</span>
              <button
                onClick={handleRefresh}
                disabled={refreshing || isRestricted}
                className="ml-auto inline-flex h-6 w-6 items-center justify-center rounded-md border border-slate-300 dark:border-slate-700 bg-card text-foreground shadow-2xs hover:bg-muted transition-colors disabled:opacity-50 cursor-pointer"
                title="Refresh stats now"
              >
                <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
              </button>
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">—</p>
        )}
      </div>

      {/* Badges */}
      <div className="px-5 py-2.5 flex items-center gap-1.5 flex-wrap">
        {account.for_sale ? (
          <Badge variant="info">
            {_("accountCard.inactive")}
          </Badge>
        ) : account.is_active ? (
          <Badge variant="success">
            {_("accountCard.active")}
          </Badge>
        ) : (
          <Badge variant="destructive">
            {_("accountCard.expired")}
          </Badge>
        )}
        {account.spam_status === "limited" && (
          <Badge variant="warning" className="animate-pulse">
            Limited
          </Badge>
        )}
        {account.is_premium && (
          <Badge variant="outline" className="gap-1 bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border-sky-300/80 dark:border-sky-700/80 font-semibold">
            <Star className="h-2.5 w-2.5 fill-amber-500 text-amber-500" />
            TG Premium
          </Badge>
        )}
        {account.is_resale && (
          <Badge variant="secondary" className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700 font-semibold">
            Resale
          </Badge>
        )}
      </div>

      {/* Action buttons */}
      <div className="px-5 pb-3 space-y-1.5">
        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={() => onView(account.id)}
            className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-800 dark:text-slate-100 bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 rounded-lg shadow-2xs transition-colors cursor-pointer"
          >
            <Eye className="h-3.5 w-3.5" />
            {_("accountCard.viewDetails")}
          </button>
          <Link
            href={`/chats?account=${account.id}`}
            className={cn(
              "flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-800 dark:text-slate-100 bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 rounded-lg shadow-2xs transition-colors",
              isRestricted && "filter blur-[1.5px] opacity-40 pointer-events-none"
            )}
            tabIndex={isRestricted ? -1 : undefined}
          >
            <MessageCircle className="h-3.5 w-3.5" />
            Chat
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <Link
            href={`/contacts?account=${account.id}`}
            className={cn(
              "flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-800 dark:text-slate-100 bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 rounded-lg shadow-2xs transition-colors",
              isRestricted && "filter blur-[1.5px] opacity-40 pointer-events-none"
            )}
            tabIndex={isRestricted ? -1 : undefined}
          >
            <Users className="h-3.5 w-3.5" />
            {_("accountDetail.contactsLink")}
          </Link>
          <Link
            href={`/accounts/${account.id}/groups-channels`}
            className={cn(
              "flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-800 dark:text-slate-100 bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 rounded-lg shadow-2xs transition-colors",
              isRestricted && "filter blur-[1.5px] opacity-40 pointer-events-none"
            )}
            tabIndex={isRestricted ? -1 : undefined}
          >
            <MessageCircle className="h-3.5 w-3.5" />
            {_("accountDetail.groupsChannels")}
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={() => {
              setPendingDelete(account.id);
              setDeleteOpen(true);
            }}
            className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-900/60 rounded-lg shadow-2xs transition-colors cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {_("accountCard.delete")}
          </button>
          {account.for_sale ? (
            <button
              onClick={() => setCancelSellOpen(true)}
              className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-900/60 rounded-lg shadow-2xs transition-colors cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
              {_("orders.cancelSell")}
            </button>
          ) : (
            <button
              onClick={() => setSellOpen(true)}
              disabled={isRestricted}
              className={cn(
                "flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/60 border border-amber-200 dark:border-amber-800/60 rounded-lg shadow-2xs transition-colors cursor-pointer",
                isRestricted && "filter blur-[1.5px] opacity-40 pointer-events-none"
              )}
            >
              <DollarSign className="h-3.5 w-3.5" />
              {_("orders.sellAccount")}
            </button>
          )}
          {onTransfer && (
            <button
              onClick={() => onTransfer(account)}
              disabled={account.for_sale}
              className={cn(
                "flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/40 hover:bg-sky-100 dark:hover:bg-sky-900/60 border border-sky-200 dark:border-sky-800/60 rounded-lg shadow-2xs transition-colors cursor-pointer",
                account.for_sale && "opacity-50 cursor-not-allowed hover:bg-sky-50 dark:hover:bg-sky-950/40"
              )}
              title={account.for_sale ? "Akun sedang dijual di marketplace" : "Transfer akun ke pengguna lain"}
            >
              <ArrowRightLeft className="h-3.5 w-3.5" />
              {_("accountCard.transfer")}
            </button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={() => {
          if (pendingDelete) onDelete(pendingDelete);
          setDeleteOpen(false);
          setPendingDelete(null);
        }}
        title={_("accountCard.delete")}
        message={_("accountCard.deleteConfirm")}
        confirmText={_("accountCard.delete")}
        cancelText={_("navbar.cancel")}
        variant="danger"
      />

      <ConfirmDialog
        open={sellOpen}
        onOpenChange={setSellOpen}
        onConfirm={handleSellConfirm}
        title={_("orders.confirmSellTitle")}
        message={
          <div className="space-y-3 text-left">
            <p className="text-sm text-gray-500">
              List this account for sale at Rp {(account.sell_price ?? pricing?.sell_price ?? 5500).toLocaleString()}.
              Your balance will <strong>not</strong> be credited immediately — you&apos;ll be paid when a buyer purchases it.
            </p>
            <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-100 space-y-2.5 text-xs text-gray-600">
              <div className="flex justify-between">
                <span>User ID:</span>
                <span className="font-semibold text-gray-900">{account.telegram_id || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span>{_("orders.pricePerAccount")}:</span>
                <span className="font-semibold text-foreground">
                  Rp {(account.sell_price ?? pricing?.sell_price ?? 5500).toLocaleString()}
                </span>
              </div>
              {account.is_resale && (
                <div className="flex justify-between items-center text-amber-700 dark:text-amber-300 font-medium">
                  <span>Status Akun:</span>
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                    Resale (Akun dari Marketplace)
                  </span>
                </div>
              )}
            </div>
          </div>
        }
        confirmText={_("orders.sellAccount")}
        cancelText={_("navbar.cancel")}
        variant="warning"
        loading={selling}
      />

      <ConfirmDialog
        open={cancelSellOpen}
        onOpenChange={setCancelSellOpen}
        onConfirm={handleCancelSellConfirm}
        title={_("orders.confirmCancelSellTitle")}
        message={_("orders.confirmCancelSellMsg")}
        confirmText={_("orders.cancelSell")}
        cancelText={_("navbar.cancel")}
        variant="danger"
        loading={canceling}
      />
    </div>
  );
}
