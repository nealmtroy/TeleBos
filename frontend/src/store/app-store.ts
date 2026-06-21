import { create } from "zustand";

interface AppState {
  sidebarOpen: boolean;
  selectedAccountId: string | null;
  toggleSidebar: () => void;
  closeSidebar: () => void;
  setSelectedAccount: (id: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  sidebarOpen: false,
  selectedAccountId: null,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  closeSidebar: () => set({ sidebarOpen: false }),
  setSelectedAccount: (id) => set({ selectedAccountId: id }),
}));
