import type { Metadata } from "next";
import { getRequestLocale } from "@/lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const isId = (getRequestLocale() ?? "en") === "id";
  return {
    title: isId ? "Syarat dan Ketentuan Layanan" : "Terms of Service",
    description: isId
      ? "Syarat dan ketentuan resmi penggunaan layanan dan platform automasi TeleBos."
      : "Official terms and conditions for using TeleBos platform and automation services.",
  };
}

export default function TosLayout({ children }: { children: React.ReactNode }) {
  return children;
}
