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

  return [
    {
      url: baseUrl,
      lastModified: LANDING_LASTMOD,
      changeFrequency: "monthly",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/help`,
      lastModified: DOCS_LASTMOD,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      // Pricing is a primary commercial page and outranks help in priority.
      url: `${baseUrl}/pricing`,
      lastModified: DOCS_LASTMOD,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/help/api`,
      lastModified: DOCS_LASTMOD,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/privacy-policy`,
      lastModified: LEGAL_LASTMOD,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${baseUrl}/terms-of-service`,
      lastModified: LEGAL_LASTMOD,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    ...helpSections.map((section) => ({
      url: `${baseUrl}/help/${section.slug}`,
      lastModified: DOCS_LASTMOD,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];
}
