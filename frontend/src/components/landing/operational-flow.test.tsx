import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useI18nStore } from "@/lib/i18n";

import { OperationalFlow } from "./operational-flow";

beforeEach(() => {
  localStorage.clear();
  useI18nStore.setState({ locale: "en" });
});

describe("OperationalFlow", () => {
  it("connects tabs to panels and supports roving keyboard navigation", () => {
    render(<OperationalFlow />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs[0]).toHaveAttribute("aria-controls", "flow-panel-overload");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "flow-tab-overload");

    fireEvent.keyDown(tabs[0], { key: "End" });
    expect(tabs[4]).toHaveFocus();
    expect(tabs[4]).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("id", "flow-panel-action");

    fireEvent.keyDown(tabs[4], { key: "ArrowRight" });
    expect(tabs[0]).toHaveFocus();
  });
});
