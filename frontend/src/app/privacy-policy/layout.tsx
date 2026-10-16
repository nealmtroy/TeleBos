import type { Metadata } from "next";
import { getRequestLocale } from "@/lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const isId = (getRequestLocale() ?? "en") === "id";
  return {
    title: isId ? "Kebijakan Privasi" : "Privacy Policy",
    description: isId
      ? "Kebijakan privasi resmi TeleBos mengenai perlindungan data, keamanan sesi, dan privasi pengguna."
      : "TeleBos official privacy policy regarding data protection, session security, and user privacy.",
  };
}

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
