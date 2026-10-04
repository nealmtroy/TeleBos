import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { t, useI18nStore } from "./index";

beforeEach(() => {
  localStorage.clear();
  useI18nStore.setState({ locale: "en" });
});

afterEach(() => {
  delete (window as any).__TELEBOS_LOCALE__;
  vi.resetModules();
});

describe("i18n", () => {
  it("translates known keys and falls back to the key", () => {
    expect(t("nav.dashboard")).toBe("Dashboard");
    expect(t("missing.translation")).toBe("missing.translation");
  });

  it("persists locale changes and uses Indonesian translations", () => {
    useI18nStore.getState().setLocale("id");

    expect(localStorage.getItem("telebo_locale")).toBe("id");
    expect(t("nav.dashboard")).toBe("Dasbor");
  });

  it("replaces provided interpolation values", () => {
    expect(t("chats.deleteConfirm", { name: "TeleBos" })).toContain("TeleBos");
  });

  it("handles preference system, en, and id", () => {
    const store = useI18nStore.getState();
    store.setPreference("id");
    expect(localStorage.getItem("telebo_locale")).toBe("id");
    expect(useI18nStore.getState().preference).toBe("id");
    expect(useI18nStore.getState().locale).toBe("id");

    store.setPreference("en");
    expect(localStorage.getItem("telebo_locale")).toBe("en");
    expect(useI18nStore.getState().preference).toBe("en");
    expect(useI18nStore.getState().locale).toBe("en");

    store.setPreference("system");
    expect(localStorage.getItem("telebo_locale")).toBe("system");
    expect(useI18nStore.getState().preference).toBe("system");
    expect(["en", "id"]).toContain(useI18nStore.getState().locale);
  });
});

// PYTHON-FASTAPI-1K: React hydration mismatch on every Indonesian visitor.
//
// The store is created at module-evaluation time. On the server that call
// reads the x-telebos-locale header and yields "id", so the HTML is rendered
// in Indonesian. On the client the same call used to fall through to "en",
// so the first hydrated render produced different text than the server sent.
// React discards the server HTML and re-renders, which is what Sentry
// recorded as "Hydration Error" (51 events / 7 users, all locale=id).
describe("i18n hydration parity (PYTHON-FASTAPI-1K)", () => {
  it("seeds the client store from the locale the server negotiated", async () => {
    // The server serialised its negotiated locale into the document before
    // the bundle executes, exactly as layout.tsx does.
    (window as any).__TELEBOS_LOCALE__ = "id";

    vi.resetModules();
    const fresh = await import("./index");

    expect(fresh.useI18nStore.getState().locale).toBe("id");
  });

  it("ignores a missing or invalid server locale and falls back to English", async () => {
    (window as any).__TELEBOS_LOCALE__ = "not-a-locale";
    vi.resetModules();
    const fresh = await import("./index");

    expect(fresh.useI18nStore.getState().locale).toBe("en");
  });

  it("still lets a stored preference win after mount", async () => {
    (window as any).__TELEBOS_LOCALE__ = "id";
    localStorage.setItem("telebo_locale", "en");

    vi.resetModules();
    const fresh = await import("./index");

    // First render must match the server...
    expect(fresh.useI18nStore.getState().locale).toBe("id");
    // ...and LanguageSync's effect then applies the explicit choice.
    fresh.useI18nStore.getState().setPreference("en");
    expect(fresh.useI18nStore.getState().locale).toBe("en");
  });
});
