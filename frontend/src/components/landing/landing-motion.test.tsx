import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const reducedMotion = vi.hoisted(() => ({ value: false }));

vi.mock("framer-motion", async () => {
  const React = await import("react");
  const motion = new Proxy({}, {
    get: (_target, tag: string) => React.forwardRef<HTMLElement, Record<string, unknown>>(function MockMotion(props, ref) {
      const {
        animate,
        children,
        initial,
        transition,
        variants,
        viewport,
        whileInView,
        ...rest
      } = props;
      return React.createElement(tag, {
        ...rest,
        ref,
        ...(animate === undefined ? {} : { "data-animate": JSON.stringify(animate) }),
        ...(initial === undefined ? {} : { "data-initial": JSON.stringify(initial) }),
        ...(whileInView === undefined ? {} : { "data-while-in-view": JSON.stringify(whileInView) }),
      }, children as React.ReactNode);
    }),
  });

  return {
    motion,
    useReducedMotion: () => reducedMotion.value,
  };
});

import { LandingReveal } from "./landing-motion";

describe("LandingReveal", () => {
  beforeEach(() => {
    reducedMotion.value = false;
  });

  it("wires a one-time viewport reveal", () => {
    render(<LandingReveal>Reveal content</LandingReveal>);

    const content = screen.getByText("Reveal content");
    expect(content).toHaveAttribute("data-initial", JSON.stringify({ opacity: 0, y: 16 }));
    expect(content).toHaveAttribute("data-while-in-view", JSON.stringify({ opacity: 1, y: 0 }));
  });

  it("renders immediately when reduced motion is enabled", () => {
    reducedMotion.value = true;
    render(<LandingReveal>Reduced content</LandingReveal>);

    const content = screen.getByText("Reduced content");
    expect(content).toHaveAttribute("data-initial", "false");
    expect(content).not.toHaveAttribute("data-while-in-view");
  });
});
