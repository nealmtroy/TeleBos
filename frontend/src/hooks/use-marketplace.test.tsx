import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createQueryClientWrapper } from "@/test/test-utils";

import {
  isMarketplaceSellUnknownOutcome,
  MARKETPLACE_SELL_TIMEOUT_MS,
  useSellAccounts,
} from "./use-marketplace";

const api = vi.hoisted(() => ({
  post: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ default: api }));

describe("marketplace sell hook", () => {
  it("uses a bounded request timeout and reconciles marketplace queries", async () => {
    api.post.mockResolvedValueOnce({ data: { total_listed: 1 } });
    const { queryClient, wrapper } = createQueryClientWrapper();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useSellAccounts(), { wrapper });

    await act(async () => result.current.mutateAsync(["account-1"]));

    expect(api.post).toHaveBeenCalledWith(
      "/marketplace/sell",
      { account_ids: ["account-1"] },
      { timeout: MARKETPLACE_SELL_TIMEOUT_MS }
    );
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["accounts"] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["marketplace", "history"] });
  });

  it("recognizes gateway timeouts and client request timeouts as unknown outcomes", () => {
    expect(isMarketplaceSellUnknownOutcome({ response: { status: 504 } })).toBe(true);
    expect(isMarketplaceSellUnknownOutcome({ code: "ECONNABORTED" })).toBe(true);
    expect(isMarketplaceSellUnknownOutcome({ response: { status: 400 } })).toBe(false);
  });
});
