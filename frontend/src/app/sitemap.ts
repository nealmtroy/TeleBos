import type { MetadataRoute } from "next";

import { helpSections } from "@/data/help-sections";

// Cache sitemap output (ISR 24 jam) agar efisien dan tidak di-render ulang setiap millidetik
export const revalidate = 86400;

const siteUrl = process.env.NEXT_PUBLIC_URL || "https://telebos.app";

// Tanggal pembaruan stabil untuk masing-masing tipe halaman.
// Jangan gunakan `new Date()` saat runtime request karena Google & Bing
// akan menganggap lastmod "spoofing/tidak valid" jika selalu berubah tiap refresh.
const LANDING_LASTMOD = new Date("2026-10-09T00:00:00.000Z");
const DOCS_LASTMOD = new Date("2026-10-08T00:00:00.000Z");
const LEGAL_LASTMOD = new Date("2026-10-01T00:00:00.000Z");

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = siteUrl.replace(/\/$/, "");

  const createLocalizedEntry = (
    path: string,
    lastModified: Date,
    changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"],
    priority: number
  ) => {
    const enUrl = path === "" ? baseUrl : `${baseUrl}${path}`;
    const idUrl = `${baseUrl}/id${path}`;

    return [
      {
        url: enUrl,
        lastModified,
        changeFrequency,
        priority,
        alternates: {
          languages: {
            en: enUrl,
            id: idUrl,
            "x-default": enUrl,
          },
        },
      },
      {
        url: idUrl,
        lastModified,
        changeFrequency,
        priority,
        alternates: {
          languages: {
            en: enUrl,
            id: idUrl,
            "x-default": enUrl,
          },
        },
      },
    ];
  };

  return [
    ...createLocalizedEntry("", LANDING_LASTMOD, "monthly", 1.0),
    ...createLocalizedEntry("/pricing", DOCS_LASTMOD, "weekly", 0.9),
    ...createLocalizedEntry("/help", DOCS_LASTMOD, "weekly", 0.8),
    ...createLocalizedEntry("/help/api", DOCS_LASTMOD, "monthly", 0.7),
    ...createLocalizedEntry("/privacy-policy", LEGAL_LASTMOD, "yearly", 0.3),
    ...createLocalizedEntry("/terms-of-service", LEGAL_LASTMOD, "yearly", 0.3),
    ...helpSections.flatMap((section) =>
      createLocalizedEntry(`/help/${section.slug}`, DOCS_LASTMOD, "monthly", 0.6)
    ),
  ];
}
