import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18nStore } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import RegisterPage from "./page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
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

describe("RegisterPage", () => {
  it("renders password and confirm password with eye toggles", () => {
    const { container } = render(<RegisterPage />);

    const passwordInput = container.querySelector("input#register-password") as HTMLInputElement;
    const confirmPasswordInput = container.querySelector("input#register-confirm-password") as HTMLInputElement;

    expect(passwordInput).toBeDefined();
    expect(confirmPasswordInput).toBeDefined();
    expect(passwordInput.type).toBe("password");
    expect(confirmPasswordInput.type).toBe("password");
    expect(passwordInput.minLength).toBe(8);
    expect(confirmPasswordInput.minLength).toBe(8);

    // Toggle password visibility (two toggle buttons exist: one for password, one for confirm)
    const toggleButtons = screen.getAllByRole("button", { name: /tampilkan kata sandi/i });
    expect(toggleButtons).toHaveLength(2);

    // Toggle password
    fireEvent.click(toggleButtons[0]);
    expect(passwordInput.type).toBe("text");
    fireEvent.click(toggleButtons[0]);
    expect(passwordInput.type).toBe("password");

    // Toggle confirm password
    fireEvent.click(toggleButtons[1]);
    expect(confirmPasswordInput.type).toBe("text");
    fireEvent.click(toggleButtons[1]);
    expect(confirmPasswordInput.type).toBe("password");
  });

  it("shows error when password is less than 8 characters", async () => {
    const { container } = render(<RegisterPage />);

    const emailInput = container.querySelector("input#register-email") as HTMLInputElement;
    const passwordInput = container.querySelector("input#register-password") as HTMLInputElement;
    const confirmPasswordInput = container.querySelector("input#register-confirm-password") as HTMLInputElement;
    const agreeCheckbox = screen.getByRole("checkbox");
    const submitBtn = screen.getByRole("button", { name: /buat akun/i });

    fireEvent.change(emailInput, { target: { value: "test@example.com" } });
    fireEvent.change(passwordInput, { target: { value: "12345" } });
    fireEvent.change(confirmPasswordInput, { target: { value: "12345" } });
    fireEvent.click(agreeCheckbox);
    fireEvent.click(submitBtn);

    expect(await screen.findByText(/kata sandi minimal 8 karakter/i)).toBeDefined();
  });

  it("shows error when password and confirm password do not match", async () => {
    const { container } = render(<RegisterPage />);

    const emailInput = container.querySelector("input#register-email") as HTMLInputElement;
    const passwordInput = container.querySelector("input#register-password") as HTMLInputElement;
    const confirmPasswordInput = container.querySelector("input#register-confirm-password") as HTMLInputElement;
    const agreeCheckbox = screen.getByRole("checkbox");
    const submitBtn = screen.getByRole("button", { name: /buat akun/i });

    fireEvent.change(emailInput, { target: { value: "test@example.com" } });
    fireEvent.change(passwordInput, { target: { value: "Secret123!" } });
    fireEvent.change(confirmPasswordInput, { target: { value: "Different123!" } });
    fireEvent.click(agreeCheckbox);
    fireEvent.click(submitBtn);

    expect(await screen.findByText(/kata sandi dan konfirmasi kata sandi tidak cocok/i)).toBeDefined();
  });

  it("uses high-contrast primary button styling", () => {
    render(<RegisterPage />);
    const submitBtn = screen.getByRole("button", { name: /buat akun/i });

    expect(submitBtn.className).toContain("bg-[var(--public-accent)]");
    expect(submitBtn.className).toContain("text-white");
    expect(submitBtn.className).not.toContain("border-white");
    expect(submitBtn.className).not.toContain("bg-transparent");
  });
});
