import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18nStore } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import OnboardingPage from "./page";

// Mock next/navigation
const mockPush = vi.fn();
const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
}));

// Mock framer-motion to avoid animation delays in tests
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, className, style, ...props }: any) => (
      <div className={className} style={style} {...props}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  localStorage.clear();
  useI18nStore.setState({ locale: "id" });
  useAuthStore.setState({
    user: {
      id: "usr-123",
      email: "test@example.com",
      full_name: "Yudha Pratama",
      role: "basic",
      is_active: true,
      balance: 100000,
    },
    isAuthenticated: true,
    isLoading: false,
  });
});

describe("OnboardingPage", () => {
  it("renders step 1 with personalized workspace name and goal choices", () => {
    render(<OnboardingPage />);

    expect(screen.getByText("Selamat Datang di TeleBos!")).toBeDefined();
    expect(screen.getByDisplayValue("Yudha Pratama's Workspace")).toBeDefined();
    expect(screen.getByText("Broadcast Massal & Promosi")).toBeDefined();
    expect(screen.getByText("Scraping & Group Growth")).toBeDefined();
  });

  it("navigates forward through steps and updates progress", () => {
    render(<OnboardingPage />);

    // Step 1 -> Step 2
    const nextBtn = screen.getByText("Lanjutkan");
    fireEvent.click(nextBtn);

    expect(screen.getByText("Cara Kerja & Setup Akun")).toBeDefined();
    expect(screen.getByText("1. Hubungkan Akun Telegram")).toBeDefined();

    // Step 2 -> Step 3
    fireEvent.click(screen.getByText("Lanjutkan"));
    expect(screen.getByText("Alat Tempur Lengkap")).toBeDefined();
    expect(screen.getByText("Live Chat Web Client")).toBeDefined();

    // Step 3 -> Step 4
    fireEvent.click(screen.getByText("Lanjutkan"));
    expect(screen.getByText("Kamu Siap Memulai!")).toBeDefined();
    expect(screen.getByText("Hubungkan Akun Telegram Pertama")).toBeDefined();
  });

  it("marks onboarding as complete and redirects to dashboard when finished", () => {
    render(<OnboardingPage />);

    // Step 1 -> 2 -> 3 -> 4
    fireEvent.click(screen.getByText("Lanjutkan"));
    fireEvent.click(screen.getByText("Lanjutkan"));
    fireEvent.click(screen.getByText("Lanjutkan"));

    const finishBtn = screen.getByText("Selesai & Mulai");
    fireEvent.click(finishBtn);

    expect(localStorage.getItem("telebos_onboarding_completed_usr-123")).toBe("true");
    expect(mockPush).toHaveBeenCalledWith("/dashboard");
  });

  it("allows skipping onboarding directly to dashboard", () => {
    render(<OnboardingPage />);

    const skipBtn = screen.getByText("Lewati ke Dashboard");
    fireEvent.click(skipBtn);

    expect(localStorage.getItem("telebos_onboarding_completed_usr-123")).toBe("true");
    expect(mockPush).toHaveBeenCalledWith("/dashboard");
  });
});
