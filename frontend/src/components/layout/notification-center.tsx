"use client";

import { Bell, CheckCheck, CircleAlert, CircleCheck, Info, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18nStore, useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { type AppNotification, type NotificationKind, useNotificationStore } from "@/store/notification-store";

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
  const notifications = useNotificationStore((state) => state.notifications);
  const markAsRead = useNotificationStore((state) => state.markAsRead);
  const markAllAsRead = useNotificationStore((state) => state.markAllAsRead);
  const removeNotification = useNotificationStore((state) => state.removeNotification);
  const clearNotifications = useNotificationStore((state) => state.clearNotifications);
  const unreadCount = notifications.filter((notification) => !notification.read).length;

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
    markAsRead(notification.id);
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
                  onClick={markAllAsRead}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-primary-700 transition-colors hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                >
                  <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  {_("notifications.markAllRead")}
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  type="button"
                  onClick={clearNotifications}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-rose-600 transition-colors hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                  aria-label={_("notifications.clearAll")}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
          </header>

          {notifications.length === 0 ? (
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
                return (
                  <li key={notification.id} className="border-b border-slate-100 last:border-b-0">
                    <div className={cn("group flex gap-3 px-4 py-3 transition-colors hover:bg-slate-50", !notification.read && "bg-primary-50/50")}> 
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
                            <span className="truncate text-sm font-medium text-slate-900">{notification.title}</span>
                            <time className="shrink-0 pt-0.5 text-[11px] text-slate-500">{formatNotificationTime(notification.createdAt, locale)}</time>
                          </span>
                          {notification.message && <span className="mt-0.5 block text-xs leading-5 text-slate-600">{notification.message}</span>}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => removeNotification(notification.id)}
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
