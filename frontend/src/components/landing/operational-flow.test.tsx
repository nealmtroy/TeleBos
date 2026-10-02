import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useI18nStore } from "@/lib/i18n";

import { OperationalFlow } from "./operational-flow";

beforeEach(() => {
  localStorage.clear();
  useI18nStore.setState({ locale: "en" });
});

// Queries are scoped to the render container: jsdom keeps prior renders in
// document.body, and a bare document.querySelectorAll would count them too.
// Panels are matched by id prefix because ProductSurface renders its own
// role="region".
function mount() {
  const view = render(<OperationalFlow />);
  const triggers = () =>
    Array.from(view.container.querySelectorAll<HTMLButtonElement>('[id^="flow-trigger-"]'));
  const panels = () =>
    Array.from(view.container.querySelectorAll<HTMLElement>('[id^="flow-panel-"]'));
  const open = () => panels().filter((p) => !p.hasAttribute("hidden"));
  return { ...view, triggers, panels, open };
}

describe("OperationalFlow", () => {
  it("renders the workflow as an ordered cascade of steps", () => {
    const { container, triggers } = mount();

    expect(container.querySelectorAll("ol > li")).toHaveLength(5);

    const buttons = triggers();
    expect(buttons).toHaveLength(5);
    expect(buttons[0]).toHaveAttribute("aria-expanded", "true");
    expect(buttons[0]).toHaveAttribute("aria-controls", "flow-panel-overload");
    expect(buttons[4]).toHaveAttribute("aria-controls", "flow-panel-action");
  });

  it("wires every trigger to its own panel and hides collapsed ones", () => {
    const { panels, open } = mount();

    expect(panels()).toHaveLength(5);

    const visible = open();
    expect(visible).toHaveLength(1);
    expect(visible[0].id).toBe("flow-panel-overload");
    expect(visible[0]).toHaveAttribute("aria-labelledby", "flow-trigger-overload");
  });

  it("opens a panel when its trigger is clicked", () => {
    const { container, triggers } = mount();

    fireEvent.click(triggers()[2]);

    expect(triggers()[2]).toHaveAttribute("aria-expanded", "true");
    expect(container.querySelector("#flow-panel-control")).not.toHaveAttribute("hidden");
    expect(container.querySelector("#flow-panel-overload")).toHaveAttribute("hidden");
  });

  it("collapses the open step when its trigger is clicked again", () => {
    const { container, triggers } = mount();

    const first = triggers()[0];
    expect(first).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(first);

    expect(first).toHaveAttribute("aria-expanded", "false");
    expect(container.querySelector("#flow-panel-overload")).toHaveAttribute("hidden");
  });

  it("moves between steps with the arrow keys", () => {
    const { triggers } = mount();

    fireEvent.keyDown(triggers()[0], { key: "End" });
    expect(triggers()[4]).toHaveAttribute("aria-expanded", "true");

    fireEvent.keyDown(triggers()[4], { key: "ArrowDown" });
    expect(triggers()[0]).toHaveAttribute("aria-expanded", "true");

    fireEvent.keyDown(triggers()[0], { key: "ArrowUp" });
    expect(triggers()[4]).toHaveAttribute("aria-expanded", "true");
  });

  it("keeps every panel addressable by id so deep links resolve", () => {
    const { panels } = mount();
    for (const id of [
      "flow-panel-overload",
      "flow-panel-fragmented",
      "flow-panel-control",
      "flow-panel-automated",
      "flow-panel-action",
    ]) {
      expect(panels().map((p) => p.id)).toContain(id);
    }
  });

  it("labels the disclosure buttons so the action is announced", () => {
      const { container } = mount();

      // The trigger must say what it does to the panel, not repeat the step name.
      // Four steps are collapsed and one is open, so both labels are present.
      const collapsed = Array.from(
        container.querySelectorAll<HTMLButtonElement>('[id^="flow-trigger-"]'),
      ).filter((b) => b.getAttribute("aria-expanded") === "false");
      expect(collapsed).toHaveLength(4);
      for (const button of collapsed) {
        expect(button.textContent).toContain("Show detail");
      }

      const expanded = Array.from(
        container.querySelectorAll<HTMLButtonElement>('[id^="flow-trigger-"]'),
      ).filter((b) => b.getAttribute("aria-expanded") === "true");
      expect(expanded).toHaveLength(1);
      expect(expanded[0].textContent).toContain("Hide detail");
    });
});