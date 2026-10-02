import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useI18nStore } from "@/lib/i18n";

import { InfrastructureSection } from "./infrastructure-section";

beforeEach(() => {
  localStorage.clear();
  useI18nStore.setState({ locale: "en" });
});

describe("InfrastructureSection", () => {
  it("names the deployed hosts and services", () => {
    const { container } = render(<InfrastructureSection />);
    const text = container.textContent ?? "";

    // These are the real values from the deployment, not placeholders.
    expect(text).toContain("tele.t-me.site");
    expect(text).toContain("Docker (TeleBos)");
    expect(text).toContain("gateway 18789");
  });

  it("marks each panel with a status indicator", () => {
    const { container } = render(<InfrastructureSection />);
    const dots = container.querySelectorAll('[aria-hidden="true"].bg-\\[var\\(--public-success\\)\\]');
    // domains, services and runtime each carry one.
    expect(dots.length).toBe(3);
  });

  it("uses the translation function rather than hardcoded prose", () => {
    useI18nStore.setState({ locale: "id" });
    const { container } = render(<InfrastructureSection />);
    expect(container.textContent).toContain("Infrastruktur");
    expect(container.textContent).toContain("Domain & server");
  });
});