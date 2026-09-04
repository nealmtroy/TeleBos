import { create } from "zustand";

const MAX_DRAFTS = 50;
const DRAFT_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

interface DraftMetadata {
  text: string;
  updatedAt: number;
}

interface StoredDrafts {
  version: 2;
  items: Record<string, DraftMetadata>;
}

function loadInitialDrafts(): { draftsMap: Record<string, string>; metaMap: Record<string, DraftMetadata> } {
  if (typeof window === "undefined") {
    return { draftsMap: {}, metaMap: {} };
  }

  try {
    const raw = localStorage.getItem("telebos-drafts");
    if (!raw) return { draftsMap: {}, metaMap: {} };

    const parsed = JSON.parse(raw);
    const now = Date.now();
    const draftsMap: Record<string, string> = {};
    const metaMap: Record<string, DraftMetadata> = {};

    if (parsed && parsed.version === 2 && parsed.items) {
      for (const [key, item] of Object.entries(parsed.items as Record<string, DraftMetadata>)) {
        if (item && item.text && now - item.updatedAt < DRAFT_TTL_MS) {
          draftsMap[key] = item.text;
          metaMap[key] = item;
        }
      }
    } else if (parsed && typeof parsed === "object") {
      // Migrate legacy format (Record<string, string>)
      for (const [key, text] of Object.entries(parsed)) {
        if (typeof text === "string" && text.trim() !== "") {
          draftsMap[key] = text;
          metaMap[key] = { text, updatedAt: now };
        }
      }
    }

    return { draftsMap, metaMap };
  } catch {
    return { draftsMap: {}, metaMap: {} };
  }
}

function persistDrafts(metaMap: Record<string, DraftMetadata>) {
  if (typeof window === "undefined") return;
  try {
    const payload: StoredDrafts = {
      version: 2,
      items: metaMap,
    };
    localStorage.setItem("telebos-drafts", JSON.stringify(payload));
  } catch (err) {
    console.warn("Failed to persist drafts to localStorage:", err);
  }
}

interface DraftState {
  drafts: Record<string, string>; // Format: "accountId:chatId" -> text
  setDraft: (accountId: string, chatId: number, text: string) => void;
  getDraft: (accountId: string, chatId: number) => string;
}

const initial = loadInitialDrafts();
let activeMeta: Record<string, DraftMetadata> = initial.metaMap;

export const useDraftStore = create<DraftState>((set, get) => ({
  drafts: initial.draftsMap,
  setDraft: (accountId, chatId, text) => {
    const key = `${accountId}:${chatId}`;
    const nextDrafts = { ...get().drafts };
    const nextMeta = { ...activeMeta };

    if (!text || text.trim() === "") {
      delete nextDrafts[key];
      delete nextMeta[key];
    } else {
      nextDrafts[key] = text;
      nextMeta[key] = { text, updatedAt: Date.now() };

      // UBC-03: Enforce max 50 drafts LRU eviction
      const keys = Object.keys(nextMeta);
      if (keys.length > MAX_DRAFTS) {
        keys.sort((a, b) => nextMeta[a].updatedAt - nextMeta[b].updatedAt);
        const toRemove = keys.slice(0, keys.length - MAX_DRAFTS);
        for (const rem of toRemove) {
          delete nextDrafts[rem];
          delete nextMeta[rem];
        }
      }
    }

    activeMeta = nextMeta;
    persistDrafts(nextMeta);
    set({ drafts: nextDrafts });
  },
  getDraft: (accountId, chatId) => {
    return get().drafts[`${accountId}:${chatId}`] || "";
  },
}));
