import { create } from "zustand";

interface DraftState {
  drafts: Record<string, string>; // Format: "accountId:chatId" -> text
  setDraft: (accountId: string, chatId: number, text: string) => void;
  getDraft: (accountId: string, chatId: number) => string;
}

export const useDraftStore = create<DraftState>((set, get) => ({
  drafts: typeof window !== "undefined" ? JSON.parse(localStorage.getItem("telebos-drafts") || "{}") : {},
  setDraft: (accountId, chatId, text) => {
    const key = `${accountId}:${chatId}`;
    const nextDrafts = { ...get().drafts };
    if (!text || text.trim() === "") {
      delete nextDrafts[key];
    } else {
      nextDrafts[key] = text;
    }
    if (typeof window !== "undefined") {
      localStorage.setItem("telebos-drafts", JSON.stringify(nextDrafts));
    }
    set({ drafts: nextDrafts });
  },
  getDraft: (accountId, chatId) => {
    return get().drafts[`${accountId}:${chatId}`] || "";
  }
}));
