import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/i18n", async () => {
  const actual = await vi.importActual<typeof import("@/lib/i18n")>("@/lib/i18n");
  return { ...actual, useT: () => (key: string) => key };
});

vi.mock("@/components/landing/hero-dashboard-mockup", () => ({
  HeroDashboardMockup: () => <div data-testid="hero-dashboard-mockup" />,
}));

import { LandingHero } from "./landing-hero";

describe("LandingHero", () => {
  it("renders the headline as a single h1", () => {
    render(<LandingHero />);
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
  });

  it("shows the proof rail with one entry per stat", () => {
    const { container } = render(<LandingHero />);
    // Three stats, each contributing a value and a label.
    expect(container.textContent).toContain("304");
    expect(container.textContent).toContain("75K+");
    expect(container.textContent).toContain("7");
  });

  it("keeps both calls to action reachable", () => {
    render(<LandingHero />);
    const ctas = Array.from(document.querySelectorAll("a")).map((a) =>
      a.getAttribute("href"),
    );
    expect(ctas).toContain("#workflow");
    expect(ctas).toContain("/register");
  });

  it("marks decorative layers aria-hidden so screen readers skip them", () => {
    const { container } = render(<LandingHero />);
    const decorative = container.querySelectorAll('[aria-hidden="true"]');
    // Status dot + arrow insets are decorative; the labels beside them carry
    // the meaning.
    expect(decorative.length).toBeGreaterThanOrEqual(2);
  });

  it("exposes stat labels to assistive tech via sr-only terms", () => {
    const { container } = render(<LandingHero />);
    expect(container.querySelectorAll(".sr-only").length).toBe(3);
  });
});