"use client";

import { useParams, useRouter } from "next/navigation";
import { useAccount, useAccountTwoFAStatus, useDeleteAccount, useCheckSpam, useProfileSync } from "@/hooks/use-accounts";
import { useTwoFAStatusSync } from "@/hooks/use-twofa-status-sync";
import { useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n";
import { Smartphone, Shield, Monitor, Settings, ArrowLeft, RefreshCw, AlertTriangle, X, Mail, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { CardSkeleton } from "@/components/ui/skeleton-cards";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SpamAppealDialog } from "@/components/accounts/spam-appeal-dialog";
import { useCancelSellAccount } from "@/hooks/use-marketplace";
import { useAuthStore } from "@/store/auth-store";
import { AccountAvatar } from "@/components/accounts/account-avatar";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

export default function AccountDetailPage() {
  const _ = useT();
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  useProfileSync(id);
  const { data: account, isLoading, error } = useAccount(id);
  const { data: securityStatus } = useAccountTwoFAStatus(id);
  useTwoFAStatusSync(id);
  const isRestricted = account ? (!account.is_active || account.for_sale) : false;
  const isExpired = account ? (!account.is_active && !account.for_sale) : false;
  const deleteMutation = useDeleteAccount();
  const checkSpamMutation = useCheckSpam();
  const [deleting, setDeleting] = useState(false);

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [appealOpen, setAppealOpen] = useState(false);

  const [cancelSellOpen, setCancelSellOpen] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const cancelSellMutation = useCancelSellAccount();
  const fetchMe = useAuthStore((s) => s.fetchMe);

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteMutation.mutateAsync(id);
      router.push("/accounts");
    } catch {
      setDeleting(false);
    }
  }

  async function handleCancelSell() {
    setCanceling(true);
    try {
      await cancelSellMutation.mutateAsync(id);
      await fetchMe();
      setCancelSellOpen(false);
    } catch {
      // Ignore
    } finally {
      setCanceling(false);
    }
  }

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Back + header skeleton */}
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        {/* Profile card skeleton */}
        <Skeleton className="h-40 w-full rounded-xl" />
        {/* Action links grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} lines={2} />
          ))}
        </div>
      </div>
    );
  }

  if (error || !account) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500">{_("accountDetail.notFound")}</p>
        <Link href="/accounts" className="text-primary-600 hover:underline mt-2 block">
          {_("accountDetail.backToAccounts")}
        </Link>
      </div>
    );
  }

  const links = [
    {
      label: _("accountDetail.profileSettings"),
      icon: Settings,
      href: `/accounts/${id}/settings`,
      desc: _("accountDetail.profileSettingsDesc"),
    },
    {
      label: `${_("accountDetail.devices")} (${account?.device_count ?? 1})`,
      icon: Monitor,
      href: `/accounts/${id}/devices`,
      desc: _("accountDetail.devicesDesc"),
    },
    {
      label: _("accountDetail.chats"),
      icon: Smartphone,
      href: `/chats?account=${id}`,
      desc: _("accountDetail.chatsDesc"),
    },
    {
      label: _("accountDetail.security"),
      icon: Shield,
      href: `/accounts/${id}/security`,
      desc: _("accountDetail.securityDesc"),
    },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Back + header */}
      <div className="flex items-center gap-3">
        <Link
          href="/accounts"
          aria-label={_("accountDetail.backToAccounts")}
          className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-slate-300 dark:border-slate-700 bg-card text-foreground hover:bg-muted shadow-2xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-foreground">
              {account.first_name || _("accountDetail.unnamed")} {account.last_name || ""}
            </h1>
            {account.is_premium && (
              <Badge variant="outline" className="gap-1 font-bold bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30 shadow-2xs">
                <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                Premium
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {account.username ? `@${account.username}` : account.phone}
          </p>
        </div>
      </div>

      {/* Profile card */}
      <div className="bg-card text-card-foreground rounded-xl border border-border p-6 shadow-xs">
        <div className="flex items-start gap-4">
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
            className="size-20 text-2xl"
          />
          <div className="flex-1 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <span className="text-xs text-muted-foreground uppercase">{_("accountDetail.phone")}</span>
                <p className="text-sm font-medium text-foreground">{account.phone}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground uppercase">{_("accountDetail.username")}</span>
                <p className="text-sm font-medium text-foreground">
                  {account.username ? `@${account.username}` : "—"}
                </p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground uppercase">{_("accountDetail.bio")}</span>
                <p className="text-sm text-foreground">
                  {account.bio || "—"}
                </p>
              </div>
              <div>
                <span className="inline-flex items-center gap-1 text-xs uppercase text-muted-foreground">
                  <Mail className="size-3" />
                  {_("accountDetail.loginEmail")}
                </span>
                <p className="truncate text-sm font-medium text-foreground">
                  {securityStatus?.login_email_pattern || "—"}
                </p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground uppercase">{_("accountDetail.status")}</span>
                <span className="ml-1 inline-block">
                  {account.for_sale ? (
                    <Badge variant="secondary">
                      {_("accountDetail.inactive")}
                    </Badge>
                  ) : account.is_active ? (
                    <Badge variant="success">
                      {_("accountDetail.active")}
                    </Badge>
                  ) : (
                    <Badge variant="destructive">
                      {_("accountDetail.expired")}
                    </Badge>
                  )}
                </span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground uppercase">Telegram Tier</span>
                <span className="ml-1 inline-block">
                  {account.is_premium ? (
                    <Badge variant="outline" className="gap-1 font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30 shadow-2xs">
                      <Star className="size-3 fill-amber-500 text-amber-500" />
                      Premium
                    </Badge>
                  ) : (
                    <Badge variant="secondary">
                      Standard
                    </Badge>
                  )}
                </span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground uppercase">{_("accountDetail.twoFa")}</span>
                <span className="ml-1 inline-block">
                  <Badge variant={account.twofa_enabled ? "warning" : "secondary"}>
                    {account.twofa_enabled ? _("accountDetail.on") : _("accountDetail.off")}
                  </Badge>
                </span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground uppercase">{_("accountDetail.added")}</span>
                <p className="text-sm text-muted-foreground">
                  {formatDate(account.created_at)}
                </p>
              </div>
              {account.est_reg_date && (
                <div>
                  <span className="text-xs text-muted-foreground uppercase" title={account.est_reg_date_status || undefined}>
                    {_("accountDetail.estRegDate")}
                  </span>
                  <p className="text-sm text-foreground font-medium">
                    {new Date(account.est_reg_date).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                      timeZone: "UTC",
                    })}
                    {account.est_reg_date_age && ` (~${account.est_reg_date_age})`}
                  </p>
                </div>
              )}
              <div>
                <span className="text-xs text-muted-foreground uppercase">{_("accountDetail.spamStatus")}</span>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge
                    variant={
                      account.spam_status === "normal"
                        ? "success"
                        : account.spam_status === "limited"
                        ? "destructive"
                        : "secondary"
                    }
                    className={account.spam_status === "limited" ? "animate-pulse" : ""}
                  >
                    {account.spam_status === "normal"
                      ? _("accountDetail.spamStatusNormal")
                      : account.spam_status === "limited"
                      ? _("accountDetail.spamStatusLimited")
                      : _("accountDetail.spamStatusUnknown")}
                  </Badge>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => checkSpamMutation.mutate(account.id)}
                        disabled={checkSpamMutation.isPending || isRestricted}
                        className="h-6 w-6 inline-flex items-center justify-center rounded border border-slate-300 dark:border-slate-700 bg-card hover:bg-muted text-muted-foreground disabled:opacity-50 transition shadow-2xs"
                      >
                        <RefreshCw className={cn("h-3 w-3", checkSpamMutation.isPending && "animate-spin")} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{_("accountDetail.checkSpamBtn")}</TooltipContent>
                  </Tooltip>
                </div>
              </div>
              <div>
                <span className="text-xs text-muted-foreground uppercase">{_("accountDetail.spamLastChecked")}</span>
                <p className="text-sm text-muted-foreground">
                  {account.spam_last_checked_at ? formatDate(account.spam_last_checked_at) : "—"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Marketplace for sale warning banner */}
      {account.for_sale && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-5 flex gap-3 text-amber-900 dark:text-amber-200">
          <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
          <div className="space-y-1 flex-1">
            <h4 className="font-semibold text-sm">{_("orders.forSaleAlertTitle")}</h4>
            <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
              {_("orders.forSaleAlertDesc")}
            </p>
            <div className="pt-2">
              <button
                onClick={() => setCancelSellOpen(true)}
                className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold transition shadow-xs active:scale-95 inline-flex items-center gap-1.5"
              >
                <X className="h-3.5 w-3.5" />
                {_("orders.cancelSell")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Spam detail alert */}
      {account.spam_status === "limited" && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-5 flex gap-3 text-rose-900 dark:text-rose-200">
          <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
          <div className="space-y-1 flex-1">
            <h4 className="font-semibold text-sm">{_("accountDetail.spamLimitActive")}</h4>
            {account.spam_detail && (
              <p className="text-xs mt-1 whitespace-pre-line text-rose-800 dark:text-rose-300 leading-relaxed font-mono bg-card/60 p-2.5 rounded-lg border border-rose-500/20">{account.spam_detail}</p>
            )}
            <div className="pt-2">
              <button
                onClick={() => setAppealOpen(true)}
                disabled={isRestricted}
                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition shadow-xs active:scale-95 inline-flex items-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none"
              >
                {_("accountDetail.appealBtn")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action links grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {links.map((link) => {
          return isRestricted ? (
            <div
              key={link.label}
              className="flex items-start gap-4 bg-card rounded-xl border border-border p-5 filter blur-[1.5px] opacity-40 cursor-not-allowed select-none text-card-foreground shadow-xs"
            >
              <div className="p-3 bg-muted rounded-lg">
                <link.icon className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <h2 className="font-semibold text-muted-foreground">{link.label}</h2>
                <p className="text-sm text-muted-foreground mt-0.5">{link.desc}</p>
              </div>
            </div>
          ) : (
            <Link
              key={link.label}
              href={link.href}
              className="flex items-start gap-4 bg-card rounded-xl border border-border p-5 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-xs transition text-card-foreground shadow-xs"
            >
              <div className="p-3 bg-primary/10 rounded-lg text-primary">
                <link.icon className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-semibold text-foreground">{link.label}</h2>
                <p className="text-sm text-muted-foreground mt-0.5">{link.desc}</p>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Delete */}
      <div className="bg-card text-card-foreground rounded-xl border border-rose-200 dark:border-rose-900/60 p-6 shadow-xs">
        <h2 className="font-semibold text-rose-600 dark:text-rose-400">{_("accountDetail.dangerZone")}</h2>
        <p className="text-sm text-muted-foreground mt-1 mb-4 max-w-xl">
          {_("accountDetail.dangerZoneDesc")}
        </p>
        <button
          onClick={() => setConfirmDeleteOpen(true)}
          disabled={deleting}
          className="px-4 py-2 bg-rose-600 text-white rounded-lg text-sm font-medium hover:bg-rose-500 disabled:opacity-50 transition shadow-xs"
        >
          {deleting ? _("accountDetail.deleting") : _("accountDetail.deleteAccount")}
        </button>
      </div>

      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        onConfirm={handleDelete}
        title={_("accountDetail.deleteAccount")}
        message={_("accountDetail.deleteConfirm")}
        confirmText={_("accountDetail.deleteAccount")}
        cancelText={_("navbar.cancel")}
        variant="danger"
        loading={deleting}
      />

      <SpamAppealDialog
        open={appealOpen}
        onOpenChange={setAppealOpen}
        accountId={id}
      />

      <ConfirmDialog
        open={cancelSellOpen}
        onOpenChange={setCancelSellOpen}
        onConfirm={handleCancelSell}
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
