"use client";

import { Bell, CheckCheck, CircleAlert, CircleCheck, Info, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18nStore, useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  type AppNotification,
  type NotificationKind,
  useNotificationActions,
  useNotifications,
} from "@/hooks/use-notifications";

const notificationIcons: Record<NotificationKind, typeof Info> = {
  info: Info,
  success: CircleCheck,
  warning: CircleAlert,
  error: CircleAlert,
};

const notificationStyles: Record<NotificationKind, string> = {
  info: "text-primary-600 bg-primary-50",
  success: "text-emerald-600 bg-emerald-50",
  warning: "text-amber-700 bg-amber-50",
  error: "text-rose-600 bg-rose-50",
};

type Translate = (path: string, params?: Record<string, string | number>) => string;

function notificationParam(notification: AppNotification, key: string, fallback: string | number) {
  const value = notification.data[key];
  return typeof value === "string" || typeof value === "number" ? value : fallback;
}

export function getNotificationContent(notification: AppNotification, translate: Translate) {
  switch (notification.event) {
    case "order.created":
      return {
        title: translate("orders.notificationCreatedTitle"),
        message: translate("orders.notificationCreatedMessage", {
          service: notificationParam(notification, "service", "Order"),
        }),
      };
    case "order.mass_created":
      return {
        title: translate("orders.notificationMassCreatedTitle"),
        message: translate("orders.notificationMassCreatedMessage", {
          count: notificationParam(notification, "count", 0),
        }),
      };
    case "order.status_changed":
      return {
        title: translate("orders.notificationStatusChangedTitle"),
        message: translate("orders.notificationStatusChangedMessage", {
          service: notificationParam(notification, "service", "Order"),
          status: notificationParam(notification, "status", "Updated"),
        }),
      };
    case "marketplace.listed":
      return {
        title: translate("orders.notificationSellListedTitle"),
        message: translate("orders.notificationSellListedMessage", {
          count: notificationParam(notification, "count", 0),
        }),
      };
    case "marketplace.purchase_completed":
      return {
        title: translate("orders.notificationBuySuccessTitle"),
        message: translate("orders.notificationBuySuccessMessage"),
      };
    case "marketplace.sale_completed":
      return {
        title: translate("orders.notificationSaleSuccessTitle"),
        message: translate("orders.notificationSaleSuccessMessage", {
          phone: notificationParam(notification, "phone", "Account"),
        }),
      };
    case "marketplace.listing_cancelled":
      return {
        title: translate("orders.notificationSellCanceledTitle"),
        message: translate("orders.notificationSellCanceledMessage"),
      };
    case "marketplace.listing_invalid":
      return {
        title: translate("orders.notificationListingInvalidTitle"),
        message: translate("orders.notificationListingInvalidMessage", {
          phone: notificationParam(notification, "phone", "Account"),
        }),
      };
    default:
      return {
        title: translate("notifications.unknownTitle"),
        message: translate("notifications.unknownDescription"),
      };
  }
}

function formatNotificationTime(value: string, locale: "en" | "id") {
  const timestamp = new Date(value);
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - timestamp.getTime()) / 60000));

  if (elapsedMinutes < 1) return locale === "id" ? "Baru saja" : "Just now";
  if (elapsedMinutes < 60) return locale === "id" ? `${elapsedMinutes} mnt lalu` : `${elapsedMinutes}m ago`;
  if (elapsedMinutes < 1440) return locale === "id" ? `${Math.floor(elapsedMinutes / 60)} jam lalu` : `${Math.floor(elapsedMinutes / 60)}h ago`;

  return timestamp.toLocaleDateString(locale === "id" ? "id-ID" : "en-US", {
    month: "short",
    day: "numeric",
  });
}

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const _ = useT();
  const locale = useI18nStore((state) => state.locale);
  const { data, isLoading, isError, refetch } = useNotifications();
  const { markRead, markAllRead, remove, clear } = useNotificationActions();
  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unread_count ?? 0;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const handlePointerDown = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, []);

  const handleNotificationClick = (notification: AppNotification) => {
    if (!notification.read_at) markRead.mutate(notification.id);
    if (notification.href) {
      setOpen(false);
      router.push(notification.href);
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        aria-label={_("notifications.open")}
        aria-expanded={open}
      >
        <Bell className="h-[18px] w-[18px]" aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex min-w-4 h-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <section
          aria-label={_("notifications.title")}
          className="fixed inset-x-3 top-[4.5rem] z-50 flex max-h-[calc(100dvh-5.25rem)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:max-h-[min(32rem,calc(100dvh-6rem))] sm:w-96"
        >
          <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-950">{_("notifications.title")}</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {unreadCount > 0 ? _("notifications.unreadCount", { count: unreadCount }) : _("notifications.allCaughtUp")}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => markAllRead.mutate()}
                  disabled={markAllRead.isPending}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-primary-700 transition-colors hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                >
                  <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  {_("notifications.markAllRead")}
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  type="button"
                  onClick={() => clear.mutate()}
                  disabled={clear.isPending}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-rose-600 transition-colors hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                  aria-label={_("notifications.clearAll")}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
          </header>

          {isLoading ? (
            <div className="flex min-h-44 items-center justify-center px-6 text-sm text-slate-500">
              {_("notifications.loading")}
            </div>
          ) : isError && !data ? (
            <div className="flex min-h-44 flex-col items-center justify-center px-6 text-center">
              <p className="text-sm font-medium text-slate-800">{_("notifications.loadError")}</p>
              <button
                type="button"
                onClick={() => refetch()}
                className="mt-3 rounded-lg px-3 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                {_("notifications.retry")}
              </button>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex min-h-44 flex-col items-center justify-center px-6 text-center">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-700">
                <Bell className="h-5 w-5" aria-hidden="true" />
              </div>
              <p className="text-sm font-medium text-slate-800">{_("notifications.emptyTitle")}</p>
              <p className="mt-1 max-w-56 text-xs leading-5 text-slate-500">{_("notifications.emptyDescription")}</p>
            </div>
          ) : (
            <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain" aria-live="polite">
              {notifications.map((notification) => {
                const Icon = notificationIcons[notification.kind];
                const content = getNotificationContent(notification, _);
                return (
                  <li key={notification.id} className="border-b border-slate-100 last:border-b-0">
                    <div className={cn("group flex gap-3 px-4 py-3 transition-colors hover:bg-slate-50", !notification.read_at && "bg-primary-50/50")}>
                      <button
                        type="button"
                        onClick={() => handleNotificationClick(notification)}
                        className="flex min-w-0 flex-1 items-start gap-3 text-left focus-visible:outline-none"
                      >
                        <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", notificationStyles[notification.kind])}>
                          <Icon className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start justify-between gap-3">
                            <span className="truncate text-sm font-medium text-slate-900">{content.title}</span>
                            <time className="shrink-0 pt-0.5 text-[11px] text-slate-500">{formatNotificationTime(notification.created_at, locale)}</time>
                          </span>
                          {content.message && <span className="mt-0.5 block text-xs leading-5 text-slate-600">{content.message}</span>}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => remove.mutate(notification.id)}
                        disabled={remove.isPending}
                        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 sm:h-6 sm:w-6 sm:text-slate-400 sm:opacity-0 sm:focus:opacity-100 sm:group-hover:opacity-100"
                        aria-label={_("notifications.dismiss")}
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
