import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createQueryClientWrapper } from "@/test/test-utils";

import { getPhotoUrl, useAccounts, useDeleteAccount } from "./use-accounts";

const api = vi.hoisted(() => ({
  delete: vi.fn(),
  get: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ default: api }));

describe("account hooks", () => {
  it("builds stable versioned photo URLs", () => {
    expect(getPhotoUrl("account-1")).toBe("/api/v1/accounts/account-1/photo?v=0");
    expect(getPhotoUrl("account-1", 4)).toBe("/api/v1/accounts/account-1/photo?v=4");
  });

  it("maps account-list responses", async () => {
    api.get.mockResolvedValueOnce({ data: { accounts: [{ id: "account-1" }] } });
    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useAccounts(), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual([{ id: "account-1" }]));
    expect(api.get).toHaveBeenCalledWith("/accounts");
  });

  it("deletes an account and invalidates account queries", async () => {
    api.delete.mockResolvedValueOnce({});
    const { queryClient, wrapper } = createQueryClientWrapper();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useDeleteAccount(), { wrapper });

    await act(async () => result.current.mutateAsync("account-1"));

    expect(api.delete).toHaveBeenCalledWith("/accounts/account-1");
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["accounts"] });
  });
});
