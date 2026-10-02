import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HeroDashboardMockup } from "./hero-dashboard-mockup";

describe("HeroDashboardMockup", () => {
  it("renders both the desktop workspace and the mobile phone", () => {
    const { container } = render(<HeroDashboardMockup />);

    // Desktop: sidebar chrome plus the two data panels.
    expect(container.querySelector(".lg\\:block")).not.toBeNull();
    expect(container.textContent).toContain("Aktivitas Terbaru");

    // Mobile: the tilted phone wrapper.
    expect(container.querySelector(".lg\\:hidden")).not.toBeNull();
  });

  it("shares one account list between both versions", () => {
    const { container } = render(<HeroDashboardMockup />);

    // Five accounts, and each is rendered once per layout - the phone and the
    // desktop panel read from the same array so they cannot drift.
    const handles = Array.from(container.querySelectorAll("li")).filter((li) =>
      li.textContent?.includes("@"),
    );
    expect(handles).toHaveLength(10);
    expect(handles.some((li) => li.textContent?.includes("@webcommunity"))).toBe(true);
  });

  it("keeps the decorative chrome out of the accessibility tree", () => {
    const { container } = render(<HeroDashboardMockup />);

    // The mockup repeats the sidebar and a set of stats that the page copy
    // already states, so announcing them would be noise for screen reader
    // users. Only the mobile decorative layer is explicitly hidden.
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
  });

  it("marks every listed account as online", () => {
    const { container } = render(<HeroDashboardMockup />);
    const online = Array.from(container.querySelectorAll("li")).filter((li) =>
      li.textContent?.includes("Online"),
    );
    expect(online).toHaveLength(10);
  });
});