import { describe, expect, it, vi } from "vitest";

import { createTestQueryClient } from "@/test/test-utils";

import {
  invalidateTwoFAAccountQueries,
  synchronizeAccountTwoFAStatus,
} from "./two-fa-settings";

describe("invalidateTwoFAAccountQueries", () => {
  it("invalidates both the live 2FA status and account-derived caches", async () => {
    const queryClient = createTestQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");

    await invalidateTwoFAAccountQueries(queryClient, "account-1");

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["2fa", "account-1"] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["accounts"] });
  });
});

describe("synchronizeAccountTwoFAStatus", () => {
  it("updates an existing account-detail cache entry", () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(["accounts", "account-1"], {
      id: "account-1",
      twofa_enabled: false,
    });

    synchronizeAccountTwoFAStatus(queryClient, "account-1", true, true);

    expect(queryClient.getQueryData(["accounts", "account-1"])).toEqual({
      id: "account-1",
      twofa_enabled: true,
    });
  });

  it("does not create an account-detail cache entry", () => {
    const queryClient = createTestQueryClient();

    synchronizeAccountTwoFAStatus(queryClient, "account-1", true, true);

    expect(queryClient.getQueryData(["accounts", "account-1"])).toBeUndefined();
  });

  it("does not overwrite a cached status with a fallback response", () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(["accounts", "account-1"], {
      id: "account-1",
      twofa_enabled: true,
    });

    synchronizeAccountTwoFAStatus(queryClient, "account-1", false, false);

    expect(queryClient.getQueryData(["accounts", "account-1"])).toEqual({
      id: "account-1",
      twofa_enabled: true,
    });
  });
});
