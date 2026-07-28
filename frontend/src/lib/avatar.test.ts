import { describe, expect, it } from "vitest";

import {
  getAccountPhotoUrl,
  getAvatarInitial,
  getChatPhotoUrl,
  getTelegramAvatarColor,
} from "./avatar";

describe("avatar helpers", () => {
  it("builds stable versioned account and chat photo URLs", () => {
    expect(getAccountPhotoUrl("account-1", 4)).toBe(
      "/api/v1/accounts/account-1/photo?v=4",
    );
    expect(getChatPhotoUrl("account-1", -10042, 99)).toBe(
      "/api/v1/accounts/account-1/chats/-10042/photo?v=99",
    );
  });

  it("uses explicit Telegram colors and deterministic fallback colors", () => {
    expect(getTelegramAvatarColor("peer-1", 5)).toBe("#408ACF");
    expect(getTelegramAvatarColor("peer-1")).toBe(
      getTelegramAvatarColor("peer-1"),
    );
  });

  it("derives a resilient local fallback initial", () => {
    expect(getAvatarInitial("neal", "1234")).toBe("N");
    expect(getAvatarInitial(null, "1234")).toBe("1");
    expect(getAvatarInitial(null, null)).toBe("T");
  });
});
