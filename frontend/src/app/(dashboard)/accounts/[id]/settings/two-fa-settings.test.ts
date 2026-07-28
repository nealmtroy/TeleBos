import { describe, expect, it, vi } from "vitest";

import { createTestQueryClient } from "@/test/test-utils";

import { invalidateTwoFAAccountQueries } from "./two-fa-settings";

describe("invalidateTwoFAAccountQueries", () => {
  it("invalidates both the live 2FA status and account-derived caches", async () => {
    const queryClient = createTestQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");

    await invalidateTwoFAAccountQueries(queryClient, "account-1");

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["2fa", "account-1"] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["accounts"] });
  });
});
