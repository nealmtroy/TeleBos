import { useProfileSync, type Account } from "@/hooks/use-accounts";
import { useAccountStats } from "@/hooks/use-account-stats";
import { cn } from "@/lib/utils";
import { Eye, Trash2, Copy, Check, Users, MessageCircle, RefreshCw, Clock, DollarSign } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useState, useCallback } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import api from "@/lib/api";
import { AccountAvatar } from "@/components/accounts/account-avatar";
import { useSellAccounts, useMarketplacePricing } from "@/hooks/use-marketplace";
import { useAuthStore } from "@/store/auth-store";


interface AccountCardProps {
  account: Account;
  onDelete: (id: string) => void;
  onView: (id: string) => void;
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

  if (id === null || id === undefined) return <span className="text-sm text-gray-400">—</span>;

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1 text-sm font-mono text-gray-900 hover:text-primary-600 transition-colors group cursor-pointer"
    >
      <span>{id}</span>
      {copied ? (
        <Check className="h-3 w-3 text-green-500" />
      ) : (
        <Copy className="h-3 w-3 text-gray-400 group-hover:text-primary-500 transition-colors" />
      )}
    </button>
  );
}

export function AccountCard({ account, onDelete, onView }: AccountCardProps) {
  const _ = useT();
  useProfileSync(account.id);
  const { data: stats, isLoading: statsLoading, refetch } = useAccountStats(account.id);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [sellOpen, setSellOpen] = useState(false);
  const sellAccountsMutation = useSellAccounts();
  const { data: pricing } = useMarketplacePricing();
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const [selling, setSelling] = useState(false);

  const handleSellConfirm = async () => {
    setSelling(true);
    try {
      await sellAccountsMutation.mutateAsync([account.id]);
      await fetchMe();
      setSellOpen(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSelling(false);
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
      await refetch();
    } catch {
      // Silently fail — stats will update on next background run
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 hover:shadow-md transition h-full flex flex-col justify-between">
      {/* Profile section */}
      <div className="p-5 pb-3">
        <div className="flex items-start gap-3">
          <AccountAvatar
            accountId={account.id}
            firstName={account.first_name}
            phone={account.phone}
            photoVersion={account.photo_version}
            size="xl"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900 truncate">
              {account.first_name || _("accountCard.unnamed")} {account.last_name || ""}
            </p>
            {account.username && (
              <p className="text-xs text-gray-500 truncate">@{account.username}</p>
            )}
            <p className="text-xs text-gray-500 truncate">{account.phone}</p>
            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-[10px] text-gray-400">User ID:</span>
              <CopyableId id={account.telegram_id} />
            </div>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="px-5 py-2.5 border-y border-gray-100 bg-gray-50/50">
        {statsLoading ? (
          <div className="flex gap-3">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-20" />
          </div>
        ) : stats ? (
          <>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {stats.contacts_count > 0 && (
                <div>
                  <span className="text-gray-400">{_("accountDetail.contacts")}: </span>
                  <span className="font-medium text-gray-800">{stats.contacts_count}</span>
                </div>
              )}
              <div>
                <span className="text-gray-400">{_("accountDetail.groups")}: </span>
                <span className="font-medium text-gray-800">
                  {formatOwned(stats.total_groups, stats.owned_groups)}
                </span>
              </div>
              <div>
                <span className="text-gray-400">{_("accountDetail.channels")}: </span>
                <span className="font-medium text-gray-800">
                  {formatOwned(stats.total_channels, stats.owned_channels)}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1 mt-1.5 text-[10px] text-gray-400">
              <Clock className="h-3 w-3" />
              <span>Updated {timeAgo(stats.stats_updated_at)}</span>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="ml-auto hover:text-primary-600 transition disabled:opacity-50"
                title="Refresh stats now"
              >
                <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
              </button>
            </div>
          </>
        ) : (
          <p className="text-xs text-gray-400">—</p>
        )}
      </div>

      {/* Badges */}
      <div className="px-5 py-2.5 flex items-center gap-1.5">
        <span
          className={cn(
            "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium",
            account.is_active
              ? "bg-green-100 text-green-800"
              : "bg-gray-100 text-gray-500"
          )}
        >
          {account.is_active ? _("accountCard.active") : _("accountCard.inactive")}
        </span>
        {account.spam_status === "limited" && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-800 animate-pulse">
            Limited
          </span>
        )}
      </div>

      {/* Action buttons */}
      <div className="px-5 pb-3 space-y-1.5">
        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={() => onView(account.id)}
            className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-lg transition"
          >
            <Eye className="h-3.5 w-3.5" />
            {_("accountCard.viewDetails")}
          </button>
          <Link
            href={`/chats?account=${account.id}`}
            className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-lg transition"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            Chat
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <Link
            href={`/contacts?account=${account.id}`}
            className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-lg transition"
          >
            <Users className="h-3.5 w-3.5" />
            {_("accountDetail.contactsLink")}
          </Link>
          <Link
            href={`/accounts/${account.id}/groups-channels`}
            className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-lg transition"
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
            className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {_("accountCard.delete")}
          </button>
          <button
            onClick={() => setSellOpen(true)}
            className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg transition"
          >
            <DollarSign className="h-3.5 w-3.5" />
            {_("orders.sellAccount")}
          </button>
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
              Your balance will <strong>not</strong> be credited immediately — you'll be paid when a buyer purchases it.
            </p>
            <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-100 space-y-2.5 text-xs text-gray-600">
              <div className="flex justify-between">
                <span>User ID:</span>
                <span className="font-semibold text-gray-900">{account.telegram_id || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span>{_("orders.pricePerAccount")}:</span>
                <span className="font-semibold text-gray-900">
                  Rp {(account.sell_price ?? pricing?.sell_price ?? 5500).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        }
        confirmText={_("orders.sellAccount")}
        cancelText={_("navbar.cancel")}
        variant="warning"
        loading={selling}
      />
    </div>
  );
}

