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

describe("OnboardingPage Survey", () => {
  it("renders question 1 (use case / role)", () => {
    render(<OnboardingPage />);

    expect(screen.getByText("Bagaimana kamu berencana menggunakan TeleBos?")).toBeDefined();
    expect(screen.getByText("Solo Entrepreneur / Bisnis Pribadi")).toBeDefined();
    expect(screen.getByText("Agensi & Tim Marketing")).toBeDefined();
  });

  it("progresses through all 5 survey questions and saves survey responses", () => {
    render(<OnboardingPage />);

    // Q1 -> Q2: Referral
    fireEvent.click(screen.getByText("Lanjutkan"));
    expect(screen.getByText("Dari mana kamu mengetahui tentang TeleBos?")).toBeDefined();
    expect(screen.getByText("Rekomendasi Teman / Partner")).toBeDefined();
    expect(screen.getByText("Channel / Grup Telegram")).toBeDefined();

    // Q2 -> Q3: Account volume
    fireEvent.click(screen.getByText("Lanjutkan"));
    expect(screen.getByText("Berapa banyak akun Telegram yang ingin kamu kelola?")).toBeDefined();
    expect(screen.getByText("1 - 5 Akun Telegram")).toBeDefined();
    expect(screen.getByText("6 - 20 Akun Telegram")).toBeDefined();

    // Q3 -> Q4: Desired features
    fireEvent.click(screen.getByText("Lanjutkan"));
    expect(screen.getByText("Fitur apa yang paling kamu cari di TeleBos?")).toBeDefined();
    expect(screen.getByText("Broadcast Massal Terjadwal")).toBeDefined();
    expect(screen.getByText("Multi-Account Web Chat")).toBeDefined();

    // Q4 -> Q5: Completion summary
    fireEvent.click(screen.getByText("Lanjutkan"));
    expect(screen.getByText("Workspace Kamu Sudah Siap! 🎉")).toBeDefined();
    expect(screen.getByText("Hubungkan Akun Telegram Pertama")).toBeDefined();
    expect(screen.getByText("Langsung Masuk ke Dashboard")).toBeDefined();

    // Finish survey
    fireEvent.click(screen.getByText("Selesai & Masuk Dashboard"));
    expect(localStorage.getItem("telebos_onboarding_completed_usr-123")).toBe("true");

    const savedSurvey = JSON.parse(
      localStorage.getItem("telebos_onboarding_survey_usr-123") || "{}"
    );
    expect(savedSurvey.role).toBe("solo");
    expect(savedSurvey.referral).toBe("friend");
    expect(savedSurvey.volume).toBe("6-20");
    expect(savedSurvey.features).toContain("broadcast");
    expect(mockPush).toHaveBeenCalledWith("/dashboard");
  });

  it("allows skipping survey directly to dashboard and marks completed", () => {
    render(<OnboardingPage />);

    const skipBtn = screen.getByText("Lewati ke Dashboard");
    fireEvent.click(skipBtn);

    expect(localStorage.getItem("telebos_onboarding_completed_usr-123")).toBe("true");
    expect(mockPush).toHaveBeenCalledWith("/dashboard");
  });
});
