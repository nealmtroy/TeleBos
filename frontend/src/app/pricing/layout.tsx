import type { Metadata } from "next";
import { getRequestLocale } from "@/lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const isId = (getRequestLocale() ?? "en") === "id";
  return {
    title: isId ? "Harga & Paket Berlangganan" : "Pricing & Plans",
    description: isId
      ? "Pilihan paket harga TeleBos terbaik untuk kelola multi akun Telegram, broadcast otomatis, dan order SMM buzzer."
      : "Simple, transparent pricing for Telegram automation and multi-account management.",
  };
}

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
