import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useI18nStore } from "@/lib/i18n";

import { HeroSculpture } from "./hero-sculpture";

beforeEach(() => {
  localStorage.clear();
  useI18nStore.setState({ locale: "en" });
});

describe("HeroSculpture", () => {
  it("hides decorative geometry while keeping product proof readable", () => {
    const { container } = render(<HeroSculpture />);

    expect(container.querySelector(".public-sculpture-stage")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("Illustrative workspace")).toBeInTheDocument();
    expect(screen.getByText("Operational monitoring")).toBeInTheDocument();
  });
});
