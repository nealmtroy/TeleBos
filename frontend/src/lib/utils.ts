import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

function getLocale(): string {
  if (typeof window === "undefined") return "en-US";

  try {
    const { useI18nStore } = require("@/lib/i18n");
    const locale = useI18nStore.getState().locale;
    return locale === "id" ? "id-ID" : "en-US";
  } catch {
    return "en-US";
  }
}

export function formatDate(date: string | Date | null | undefined, locale?: string): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat(locale || getLocale(), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}

export function formatRelative(date: string | Date | null | undefined, locale?: string): string {
  if (!date) return "—";
  const now = Date.now();
  const target = new Date(date).getTime();
  const diff = now - target;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  const l = locale || getLocale();
  const isID = l.startsWith("id");

  if (mins < 1) return isID ? "baru saja" : "just now";
  if (mins < 60) return isID ? `${mins}m yang lalu` : `${mins}m ago`;
  if (hours < 24) return isID ? `${hours}j yang lalu` : `${hours}h ago`;
  if (days < 7) return isID ? `${days}h yang lalu` : `${days}d ago`;
  return formatDate(date, l);
}

export function formatTransactionNote(note: string | null | undefined, locale?: string): string {
  if (!note) return "—";
  const trimmed = note.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed);
      const isId = (locale || getLocale()).startsWith("id");
      if (parsed.phone) {
        return isId ? `Beli Akun Telegram (${parsed.phone})` : `Buy Telegram Account (${parsed.phone})`;
      }
      if (parsed.account_id) {
        const shortId = String(parsed.account_id).slice(0, 8);
        return isId ? `Beli Akun Telegram (#${shortId})` : `Buy Telegram Account (#${shortId})`;
      }
      if (parsed.order_id) {
        const shortId = String(parsed.order_id).slice(0, 8);
        return isId ? `Pesanan SMM (#${shortId})` : `SMM Order (#${shortId})`;
      }
    } catch {
      // not JSON
    }
  }
  return note;
}
