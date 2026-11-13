import { beforeEach, describe, expect, it } from "vitest";

import { t, useI18nStore } from "./index";

beforeEach(() => {
  localStorage.clear();
  useI18nStore.setState({ locale: "en" });
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

  it("overrides store locale with request header during SSR when window is undefined", async () => {
    const { renderToString } = await import("react-dom/server");
    const React = await import("react");
    useI18nStore.setState({ locale: "en" });

    function SampleSwitcher() {
      const { locale } = useI18nStore();
      return React.createElement("span", null, locale === "id" ? "ID" : "EN");
    }

    const origWindow = globalThis.window;
    const cacheKey = require.resolve("next/headers");
    const origCached = require.cache[cacheKey];
    try {
      // Simulate SSR environment where typeof window === "undefined"
      // @ts-expect-error simulating Node SSR
      delete globalThis.window;
      require.cache[cacheKey] = {
        id: cacheKey,
        filename: cacheKey,
        loaded: true,
        exports: {
          headers: () => new Map([["x-telebos-locale", "id"]]),
        },
      } as any;
      expect(useI18nStore.getState().locale).toBe("id");
      expect(t("common.language")).toBe("Bahasa");
      expect(renderToString(React.createElement(SampleSwitcher))).toBe("<span>ID</span>");
    } finally {
      if (origCached) {
        require.cache[cacheKey] = origCached;
      } else {
        delete require.cache[cacheKey];
      }
      globalThis.window = origWindow;
    }
  });
});
