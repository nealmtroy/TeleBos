import { describe, expect, it, vi } from "vitest";

import { cn, formatDate, formatRelative } from "./utils";

describe("cn", () => {
  it("merges conditional and conflicting Tailwind classes", () => {
    expect(cn("px-2", false && "hidden", "px-4", "text-sm")).toBe("px-4 text-sm");
  });
});

describe("date formatting", () => {
  it("uses a placeholder for missing dates", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatRelative(undefined)).toBe("—");
  });

  it("formats dates with an explicit locale", () => {
    expect(formatDate("2026-01-15T12:30:00Z", "en-US")).toMatch(/Jan/);
    expect(formatDate("2026-01-15T12:30:00Z", "id-ID")).toMatch(/Jan/);
  });

  it("uses locale-aware relative time boundaries", () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-01-15T12:30:00Z").getTime());

    expect(formatRelative("2026-01-15T12:29:30Z", "en-US")).toBe("just now");
    expect(formatRelative("2026-01-15T12:25:00Z", "id-ID")).toBe("5m yang lalu");
    expect(formatRelative("2026-01-15T10:30:00Z", "en-US")).toBe("2h ago");

    vi.restoreAllMocks();
  });
});
