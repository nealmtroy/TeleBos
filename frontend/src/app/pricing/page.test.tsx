import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PLANS } from "@/data/plans";
import { useI18nStore } from "@/lib/i18n";

import PricingPage from "./page";

// This suite renders a full page per test and the project runs vitest without
// globals, so RTL's automatic cleanup between tests is not registered.
afterEach(cleanup);

beforeEach(() => {
  localStorage.clear();
  useI18nStore.setState({ locale: "en" });
});

describe("PricingPage", () => {
  it("shows the three real plans at the prices customers are charged", () => {
    render(<PricingPage />);

    // These come from src/data/plans.ts, which mirrors the subscription screen.
    expect(PLANS.map((p) => p.price)).toEqual(["Rp 0", "Rp 99.000", "Rp 249.000"]);

    for (const plan of PLANS) {
      expect(screen.getAllByText(plan.price).length).toBeGreaterThan(0);
    }
  });

  it("marks exactly one plan as popular", () => {
    render(<PricingPage />);
    // A second "most chosen" badge would make the recommendation meaningless.
    expect(screen.getAllByText("Most chosen")).toHaveLength(1);
    expect(PLANS.filter((p) => p.isPopular)).toHaveLength(1);
  });

  it("renders a comparison table with a row per limit", () => {
    render(<PricingPage />);

    const table = screen.getByRole("table");
    // 3 plan columns + the label column.
    expect(within(table).getAllByRole("columnheader")).toHaveLength(4);
    expect(within(table).getAllByRole("row")).toHaveLength(11); // header + 10 limits
  });

  it("lists the questions people ask before paying", () => {
    render(<PricingPage />);
    expect(screen.getByText("How do I pay?")).toBeTruthy();
    expect(screen.getByText("Why does proxy rotation matter?")).toBeTruthy();
  });

  it("routes the free plan to signup and paid plans to login", () => {
    render(<PricingPage />);

    const ctas = screen.getAllByRole("link", { name: /start free|get pro|get premium/i });
    const hrefs = ctas.map((el) => el.getAttribute("href"));

    expect(hrefs).toContain("/register");
    expect(hrefs).toContain("/login");
  });

  it("switches locale", () => {
    useI18nStore.setState({ locale: "id" });
    render(<PricingPage />);

    expect(screen.getByText("Paling banyak dipilih")).toBeTruthy();
    // Prices are currency, not copy, so they must not be translated.
    expect(screen.getAllByText("Rp 249.000").length).toBeGreaterThan(0);
  });
});