import type { Metadata } from "next";
import { getRequestLocale } from "@/lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const isId = (getRequestLocale() ?? "en") === "id";
  return {
    title: isId ? "Pusat Bantuan & Panduan" : "Help Center & Documentation",
    description: isId
      ? "Panduan lengkap, tutorial, dan dokumentasi resmi penggunaan platform TeleBos."
      : "Official guides, tutorials, and documentation for TeleBos multi-account Telegram management.",
  };
}

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return children;
}
