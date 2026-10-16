import { describe, expect, it } from "vitest";
import { isValidTelegramTarget } from "./telegram-target";

describe("isValidTelegramTarget", () => {
  it("accepts Telegram links, usernames, and numeric ids", () => {
    for (const value of [
      "https://t.me/AndiniCollectionn",
      "t.me/colectionpap/9?single",
      "https://t.me/+wFbMGIf3CSBhN2Jl",
      "https://t.me/c/3997908946/16",
      "@username",
      "AndiniCollectionn",
      "385",
    ]) {
      expect(isValidTelegramTarget(value)).toBe(true);
    }
  });

  it("rejects HTML/JS payloads and junk", () => {
    for (const value of [
      "<script>alert(1)</script>",
      '"><img src=x onerror=eval(atob(this.id))>',
      "javascript:eval('x')",
      "https://evil.example.com/x",
      "user name",
      "",
    ]) {
      expect(isValidTelegramTarget(value)).toBe(false);
    }
  });

  it("trims surrounding whitespace before validating", () => {
    expect(isValidTelegramTarget("  @username  ")).toBe(true);
  });
});
