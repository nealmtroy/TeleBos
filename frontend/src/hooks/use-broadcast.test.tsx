import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createQueryClientWrapper } from "@/test/test-utils";

import { useBroadcastAction } from "./use-broadcast";

const api = vi.hoisted(() => ({ post: vi.fn() }));

vi.mock("@/lib/api", () => ({ default: api }));

describe("broadcast hooks", () => {
  it("posts job actions and refreshes broadcast history", async () => {
    api.post.mockResolvedValueOnce({ data: { status: "paused" } });
    const { queryClient, wrapper } = createQueryClientWrapper();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useBroadcastAction(), { wrapper });

    await act(async () => result.current.mutateAsync({ jobId: "job-1", action: "pause" }));

    expect(api.post).toHaveBeenCalledWith("/broadcast/job-1/pause");
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["broadcast-jobs"] });
  });
});
