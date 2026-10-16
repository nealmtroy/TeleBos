import { describe, expect, it } from "vitest";

import { helpSections } from "@/data/help-sections";
import sitemap from "./sitemap";

describe("public sitemap", () => {
  it("includes both default and /id multilingual variants for every public page", () => {
    const entries = sitemap();
    const urls = entries.map((entry) => entry.url);

    // Root URLs
    expect(urls.some((url) => url.endsWith("telebos.app"))).toBe(true);
    expect(urls.some((url) => url.endsWith("telebos.app/id"))).toBe(true);

    // Pricing
    expect(urls.some((url) => url.endsWith("/pricing"))).toBe(true);
    expect(urls.some((url) => url.endsWith("/id/pricing"))).toBe(true);

    // Help topics in both languages
    for (const section of helpSections) {
      expect(urls.some((url) => url.endsWith(`/help/${section.slug}`))).toBe(true);
      expect(urls.some((url) => url.endsWith(`/id/help/${section.slug}`))).toBe(true);
    }

    // Alternates verification
    const rootEntry = entries.find((e) => e.url.endsWith("telebos.app"));
    expect(rootEntry?.alternates?.languages?.en).toBeDefined();
    expect(rootEntry?.alternates?.languages?.id).toBeDefined();

    // Excluded auth routes
    expect(urls.some((url) => url.endsWith("/login"))).toBe(false);
    expect(urls.some((url) => url.endsWith("/register"))).toBe(false);
  });
});
