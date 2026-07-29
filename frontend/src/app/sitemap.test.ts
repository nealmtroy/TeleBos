import { describe, expect, it } from "vitest";

import { helpSections } from "@/data/help-sections";
import sitemap from "./sitemap";

describe("public sitemap", () => {
  it("includes every public help topic and excludes auth routes", () => {
    const urls = sitemap().map((entry) => entry.url);

    for (const section of helpSections) {
      expect(urls.some((url) => url.endsWith(`/help/${section.slug}`))).toBe(true);
    }

    expect(urls.some((url) => url.endsWith("/login"))).toBe(false);
    expect(urls.some((url) => url.endsWith("/register"))).toBe(false);
  });
});
