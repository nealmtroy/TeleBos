import { beforeEach, describe, expect, it } from "vitest";

import { useAppStore } from "./app-store";

const initialState = {
  sidebarOpen: false,
  selectedAccountId: null,
};

beforeEach(() => {
  useAppStore.setState(initialState);
});

describe("useAppStore", () => {
  it("toggles and closes the sidebar", () => {
    useAppStore.getState().toggleSidebar();
    expect(useAppStore.getState().sidebarOpen).toBe(true);

    useAppStore.getState().closeSidebar();
    expect(useAppStore.getState().sidebarOpen).toBe(false);
  });

  it("tracks the selected account", () => {
    useAppStore.getState().setSelectedAccount("account-1");
    expect(useAppStore.getState().selectedAccountId).toBe("account-1");

    useAppStore.getState().setSelectedAccount(null);
    expect(useAppStore.getState().selectedAccountId).toBeNull();
  });
});
