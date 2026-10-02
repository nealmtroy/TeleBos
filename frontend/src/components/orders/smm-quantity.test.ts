import { describe, it, expect } from "vitest";
import { clampQuantity, parseQuantityInput } from "./smm-quantity";

const MIN = 500;
const MAX = 100_000;

describe("parseQuantityInput", () => {
  it("reads a plain number", () => {
    expect(parseQuantityInput("2500")).toBe(2500);
  });

  it("tolerates surrounding whitespace", () => {
    expect(parseQuantityInput("  2500  ")).toBe(2500);
  });

  it("returns null for an empty field instead of inventing 1", () => {
    // Regression: the old handler did parseInt("") || 1, so clearing the input
    // silently produced 1 and the user could not then type anything else.
    expect(parseQuantityInput("")).toBeNull();
  });

  it("returns null for a non-numeric value", () => {
    expect(parseQuantityInput("abc")).toBeNull();
  });

  it("returns 1 when the user really does mean 1", () => {
    expect(parseQuantityInput("1")).toBe(1);
  });
});

describe("clampQuantity", () => {
  it("leaves an in-range value untouched", () => {
    expect(clampQuantity("2500", MIN, MAX)).toBe(2500);
  });

  it("raises a below-minimum value up to the minimum", () => {
    expect(clampQuantity("50", MIN, MAX)).toBe(MIN);
  });

  it("lowers an above-maximum value down to the maximum", () => {
    expect(clampQuantity("999999", MIN, MAX)).toBe(MAX);
  });

  it("falls back to the minimum for an empty field", () => {
    expect(clampQuantity("", MIN, MAX)).toBe(MIN);
  });

  it("does not trap the value at 1", () => {
    // The exact failure users hit: value 1 sits below min, so after clamping
    // on every keystroke the field could never leave 1.
    expect(clampQuantity("1500", MIN, MAX)).toBe(1500);
  });

  it("handles a minimum of 1 without collapsing everything to 1", () => {
    expect(clampQuantity("1500", 1, MAX)).toBe(1500);
    expect(clampQuantity("1", 1, MAX)).toBe(1);
  });
});