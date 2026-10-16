import type { Metadata } from "next";
import { getRequestLocale } from "@/lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const isId = (getRequestLocale() ?? "en") === "id";
  return {
    title: isId ? "Dokumentasi API" : "API Documentation",
    description: isId
      ? "Dokumentasi API resmi TeleBos — integrasi terproteksi, endpoints, dan referensi skema OpenAPI."
      : "TeleBos official API documentation — scoped integration guide, endpoints, and OpenAPI schema reference.",
    robots: "index, follow",
  };
}

export default function ApiLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
