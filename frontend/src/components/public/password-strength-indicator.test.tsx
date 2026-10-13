import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useI18nStore } from "@/lib/i18n";
import {
  PasswordStrengthIndicator,
  evaluatePasswordCriteria,
  calculatePasswordScore,
} from "./password-strength-indicator";

afterEach(cleanup);

beforeEach(() => {
  useI18nStore.setState({ locale: "id" });
});

describe("Password evaluation logic", () => {
  it("evaluates criteria correctly", () => {
    expect(evaluatePasswordCriteria("short")).toEqual({
      minLength: false,
      hasUpperLower: false,
      hasNumber: false,
      hasSpecial: false,
    });

    expect(evaluatePasswordCriteria("Abcdefgh")).toEqual({
      minLength: true,
      hasUpperLower: true,
      hasNumber: false,
      hasSpecial: false,
    });

    expect(evaluatePasswordCriteria("Abcdef12")).toEqual({
      minLength: true,
      hasUpperLower: true,
      hasNumber: true,
      hasSpecial: false,
    });

    expect(evaluatePasswordCriteria("Abcdef12!")).toEqual({
      minLength: true,
      hasUpperLower: true,
      hasNumber: true,
      hasSpecial: true,
    });
  });

  it("calculates score with minLength rule", () => {
    // Password shorter than 8 chars is capped at score 1 (Weak)
    expect(calculatePasswordScore("Ab1!", evaluatePasswordCriteria("Ab1!"))).toBe(1);

    // Score progression for 8+ chars
    expect(calculatePasswordScore("12345678", evaluatePasswordCriteria("12345678"))).toBe(2); // length + number
    expect(calculatePasswordScore("Abcdef12", evaluatePasswordCriteria("Abcdef12"))).toBe(3); // length + upperLower + number
    expect(calculatePasswordScore("Abcdef12!", evaluatePasswordCriteria("Abcdef12!"))).toBe(4); // all 4
  });
});

describe("PasswordStrengthIndicator component", () => {
  it("renders nothing when password is empty", () => {
    const { container } = render(<PasswordStrengthIndicator password="" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders Weak status and criteria for simple short password", () => {
    render(<PasswordStrengthIndicator password="abc" />);

    expect(screen.getByTestId("password-strength-indicator")).toBeDefined();
    expect(screen.getByTestId("password-strength-label").textContent).toBe("Lemah");

    const bar1 = screen.getByTestId("password-strength-bar-1");
    const bar2 = screen.getByTestId("password-strength-bar-2");
    expect(bar1.className).toContain("bg-rose-500");
    expect(bar2.className).toContain("bg-[var(--public-border)]");

    // Check criteria items
    const minLengthCrit = screen.getByTestId("password-criteria-min-length");
    expect(minLengthCrit.className).toContain("text-[var(--public-subtle)]");
  });

  it("renders Sangat Kuat when all 4 criteria are satisfied", () => {
    render(<PasswordStrengthIndicator password="Password123!" />);

    expect(screen.getByTestId("password-strength-label").textContent).toBe("Sangat Kuat");

    for (let step = 1; step <= 4; step++) {
      const bar = screen.getByTestId(`password-strength-bar-${step}`);
      expect(bar.className).toContain("bg-emerald-500");
    }

    const minLengthCrit = screen.getByTestId("password-criteria-min-length");
    expect(minLengthCrit.className).toContain("text-[var(--public-body)]");
  });

  it("supports English locale", () => {
    useI18nStore.setState({ locale: "en" });
    render(<PasswordStrengthIndicator password="Password123!" />);

    expect(screen.getByTestId("password-strength-label").textContent).toBe("Strong");
  });
});
