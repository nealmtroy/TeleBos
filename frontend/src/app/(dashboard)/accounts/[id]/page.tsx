"use client";

import { useParams, useRouter } from "next/navigation";
import { useAccount, getPhotoUrl, useDeleteAccount, useCheckSpam, useProfileSync } from "@/hooks/use-accounts";
import { useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n";
import { Smartphone, Shield, Monitor, Settings, Trash2, ArrowLeft, RefreshCw, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { CardSkeleton } from "@/components/ui/skeleton-cards";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SpamAppealDialog } from "@/components/accounts/spam-appeal-dialog";

function ProfilePhoto({ account }: { account: { id: string; first_name: string | null; phone: string; photo_version?: number } }) {
  const [error, setError] = useState(false);
  const initials = (account.first_name?.[0] || account.phone?.slice(-2) || "T").toUpperCase();
  const photoUrl = getPhotoUrl(account.id, account.photo_version);

  if (error) {
    return (
      <span className="text-primary-700 text-2xl font-bold">{initials}</span>
    );
  }

  return (
    <img
      src={photoUrl}
      alt=""
      className="w-full h-full object-cover"
      onError={() => setError(true)}
    />
  );
}

export default function AccountDetailPage() {
  const _ = useT();
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  useProfileSync(id);
  const { data: account, isLoading, error } = useAccount(id);
  const deleteMutation = useDeleteAccount();
  const checkSpamMutation = useCheckSpam();
  const [deleting, setDeleting] = useState(false);

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [appealOpen, setAppealOpen] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteMutation.mutateAsync(id);
      router.push("/accounts");
    } catch {
      setDeleting(false);
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
      label: _("accountDetail.devices"),
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
      href: `/accounts/${id}/settings`,
      desc: _("accountDetail.securityDesc"),
    },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Back + header */}
      <div className="flex items-center gap-3">
        <Link href="/accounts" className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="h-5 w-5 text-gray-500" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {account.first_name || _("accountDetail.unnamed")} {account.last_name || ""}
          </h1>
          <p className="text-sm text-gray-500">
            {account.username ? `@${account.username}` : account.phone}
          </p>
        </div>
      </div>

      {/* Profile card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-start gap-4">
          <div className="w-20 h-20 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
            <ProfilePhoto account={account} />
          </div>
          <div className="flex-1 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <span className="text-xs text-gray-400 uppercase">{_("accountDetail.phone")}</span>
                <p className="text-sm font-medium text-gray-900">{account.phone}</p>
              </div>
              <div>
                <span className="text-xs text-gray-400 uppercase">{_("accountDetail.username")}</span>
                <p className="text-sm font-medium text-gray-900">
                  {account.username ? `@${account.username}` : "—"}
                </p>
              </div>
              <div>
                <span className="text-xs text-gray-400 uppercase">{_("accountDetail.bio")}</span>
                <p className="text-sm text-gray-900">
                  {account.bio || "—"}
                </p>
              </div>
              <div>
                <span className="text-xs text-gray-400 uppercase">{_("accountDetail.status")}</span>
                {account.for_sale ? (
                  <span className="inline-block ml-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    {_("accountDetail.inactive")}
                  </span>
                ) : account.is_active ? (
                  <span className="inline-block ml-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    {_("accountDetail.active")}
                  </span>
                ) : (
                  <span className="inline-block ml-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                    {_("accountDetail.expired")}
                  </span>
                )}
              </div>
              <div>
                <span className="text-xs text-gray-400 uppercase">{_("accountDetail.twoFa")}</span>
                <span
                  className={cn(
                    "inline-block ml-1 px-2 py-0.5 rounded-full text-xs font-medium",
                    account.twofa_enabled
                      ? "bg-yellow-100 text-yellow-800"
                      : "bg-gray-100 text-gray-500"
                  )}
                >
                  {account.twofa_enabled ? _("accountDetail.on") : _("accountDetail.off")}
                </span>
              </div>
              <div>
                <span className="text-xs text-gray-400 uppercase">{_("accountDetail.added")}</span>
                <p className="text-sm text-gray-500">
                  {formatDate(account.created_at)}
                </p>
              </div>
              <div>
                <span className="text-xs text-gray-400 uppercase">{_("accountDetail.spamStatus")}</span>
                <div className="flex items-center gap-2 mt-0.5">
                  <span
                    className={cn(
                      "inline-block px-2 py-0.5 rounded-full text-xs font-medium",
                      account.spam_status === "normal"
                        ? "bg-green-100 text-green-800"
                        : account.spam_status === "limited"
                        ? "bg-red-100 text-red-800 animate-pulse"
                        : "bg-gray-100 text-gray-500"
                    )}
                  >
                    {account.spam_status === "normal"
                      ? _("accountDetail.spamStatusNormal")
                      : account.spam_status === "limited"
                      ? _("accountDetail.spamStatusLimited")
                      : _("accountDetail.spamStatusUnknown")}
                  </span>
                  <button
                    onClick={() => checkSpamMutation.mutate(account.id)}
                    disabled={checkSpamMutation.isPending}
                    className="p-1 hover:bg-gray-100 rounded text-gray-500 disabled:opacity-50 transition"
                    title={_("accountDetail.checkSpamBtn")}
                  >
                    <RefreshCw className={cn("h-3.5 w-3.5", checkSpamMutation.isPending && "animate-spin")} />
                  </button>
                </div>
              </div>
              <div>
                <span className="text-xs text-gray-400 uppercase">{_("accountDetail.spamLastChecked")}</span>
                <p className="text-sm text-gray-500">
                  {account.spam_last_checked_at ? formatDate(account.spam_last_checked_at) : "—"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Spam detail alert */}
      {account.spam_status === "limited" && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5 flex gap-3 text-red-800">
          <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5 text-red-600" />
          <div className="space-y-1 flex-1">
            <h4 className="font-semibold text-sm">{_("accountDetail.spamLimitActive")}</h4>
            {account.spam_detail && (
              <p className="text-xs mt-1 whitespace-pre-line text-red-700 leading-relaxed font-mono bg-white/50 p-2.5 rounded-lg border border-red-100">{account.spam_detail}</p>
            )}
            <div className="pt-2">
              <button
                onClick={() => setAppealOpen(true)}
                className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition shadow-sm active:scale-95 inline-flex items-center gap-1.5"
              >
                {_("accountDetail.appealBtn")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action links grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {links.map((link) => (
          <Link
            key={link.label}
            href={link.href}
            className="flex items-start gap-4 bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition"
          >
            <div className="p-3 bg-primary-50 rounded-lg">
              <link.icon className="h-5 w-5 text-primary-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">{link.label}</h3>
              <p className="text-sm text-gray-500 mt-0.5">{link.desc}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Delete */}
      <div className="bg-white rounded-xl border border-red-200 p-6">
        <h3 className="font-semibold text-red-600">{_("accountDetail.dangerZone")}</h3>
        <p className="text-sm text-gray-500 mt-1 mb-4">
          {_("accountDetail.dangerZoneDesc")}
        </p>
        <button
          onClick={() => setConfirmDeleteOpen(true)}
          disabled={deleting}
          className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:bg-red-300 transition"
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
    </div>
  );
}
