import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useI18nStore } from "@/lib/i18n";

import { FeatureOutcomes } from "./feature-outcomes";

beforeEach(() => {
  localStorage.clear();
  useI18nStore.setState({ locale: "en" });
});

describe("FeatureOutcomes", () => {
  it("presents the five capabilities as outcome cards", () => {
    const { container } = render(<FeatureOutcomes />);

    const cards = container.querySelectorAll("article");
    expect(cards).toHaveLength(5);

    // The old version was a disclosure list with a plus glyph and a shell
    // prompt. None of that should survive: this section is persuasion, not
    // developer documentation.
    expect(container.textContent).not.toContain("$ telebos");
    expect(container.querySelectorAll("details")).toHaveLength(0);
  });

  it("shows a real figure on every card", () => {
    const { container } = render(<FeatureOutcomes />);

    // The deployment's own numbers, not invented ones.
    expect(container.textContent).toContain("304");
    expect(container.textContent).toContain("75K+");
    expect(container.textContent).toContain("24/7");
  });

  it("keeps the section anchor so the nav link still resolves", () => {
    const { container } = render(<FeatureOutcomes />);
    expect(container.querySelector("#features")).not.toBeNull();
  });

  it("reads the goal-first headline rather than a category label", () => {
    const { container } = render(<FeatureOutcomes />);

    // Scope to the section's own h2: the cards below use h3, so the previous
    // getByRole matched more than one heading.
    const heading = container.querySelector("section h2");
    expect(heading?.textContent).toBe(
      "Every feature here recovers time and money you lose to Telegram every day.",
    );
  });

  it("switches locale", () => {
    useI18nStore.setState({ locale: "id" });
    const { container } = render(<FeatureOutcomes />);
    expect(container.textContent).toContain("Cara pakainya");
  });
});