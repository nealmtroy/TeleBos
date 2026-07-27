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
});
