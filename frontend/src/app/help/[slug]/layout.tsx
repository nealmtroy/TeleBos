import type { Metadata } from "next";
import { getHelpSectionBySlug } from "@/data/help-sections";
import { getRequestLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const section = getHelpSectionBySlug(params.slug);
  if (!section) {
    return {
      title: "Topic Not Found",
      robots: "noindex, follow",
    };
  }

  const title = section.slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  const isId = (getRequestLocale() ?? "en") === "id";

  return {
    title,
    description: isId
      ? `Panduan dan dokumentasi resmi TeleBos untuk topik ${title}.`
      : `TeleBos help guide and documentation for ${title}.`,
    robots: "index, follow",
  };
}

export default function HelpDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

