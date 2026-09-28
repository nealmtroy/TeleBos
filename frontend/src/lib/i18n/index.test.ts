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
});
