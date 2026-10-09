import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18nStore } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import LoginPage from "./page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  useSearchParams: () => ({
    get: vi.fn().mockReturnValue(null),
  }),
}));

afterEach(cleanup);

beforeEach(() => {
  localStorage.clear();
  useI18nStore.setState({ locale: "id" });
  useAuthStore.setState({
    user: null,
    isAuthenticated: false,
    isLoading: false,
  });
});

describe("LoginPage", () => {
  it("renders password input with eye toggle", () => {
    const { container } = render(<LoginPage />);

    const passwordInput = container.querySelector("input#password") as HTMLInputElement;
    expect(passwordInput).toBeDefined();
    expect(passwordInput.type).toBe("password");

    const showPasswordBtn = screen.getByRole("button", { name: /tampilkan kata sandi/i });
    fireEvent.click(showPasswordBtn);
    expect(passwordInput.type).toBe("text");

    fireEvent.click(showPasswordBtn);
    expect(passwordInput.type).toBe("password");
  });

  it("uses high-contrast primary button styling for submit", () => {
    render(<LoginPage />);
    const submitBtn = screen.getByRole("button", { name: /masuk/i });

    expect(submitBtn.className).toContain("bg-[var(--public-accent)]");
    expect(submitBtn.className).toContain("text-white");
    expect(submitBtn.className).not.toContain("border-white");
    expect(submitBtn.className).not.toContain("bg-transparent");
  });
});
