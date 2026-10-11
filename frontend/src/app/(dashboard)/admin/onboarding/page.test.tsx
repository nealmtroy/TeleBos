import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18nStore } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import AdminOnboardingPage from "./page";

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock useAdminOnboardingAnalytics hook
const mockRefetch = vi.fn();
const mockAnalyticsData = {
  total_users: 100,
  completed_count: 80,
  skipped_count: 10,
  pending_count: 20,
  completion_rate: 80.0,
  roles_breakdown: {
    solo: 45,
    agency: 25,
    community: 10,
  },
  referrals_breakdown: {
    friend: 30,
    telegram: 40,
    social: 10,
  },
  volumes_breakdown: {
    "1-5": 30,
    "6-20": 40,
    "21-50": 10,
  },
  features_breakdown: {
    broadcast: 70,
    webchat: 50,
  },
  recent_surveys: [
    {
      id: "surv-1",
      user_id: "usr-1",
      user_email: "boss@agency.com",
      user_full_name: "Boss Agency",
      role: "agency",
      referral: "telegram",
      volume: "6-20",
      features: ["broadcast", "webchat"],
      is_skipped: false,
      created_at: "2026-10-10T00:00:00Z",
    },
    {
      id: "surv-2",
      user_id: "usr-2",
      user_email: "solo@store.com",
      user_full_name: "Solo Store",
      role: "solo",
      referral: "friend",
      volume: "1-5",
      features: ["broadcast"],
      is_skipped: true,
      created_at: "2026-10-09T12:00:00Z",
    },
  ],
};

vi.mock("@/hooks/use-admin", () => ({
  useAdminOnboardingAnalytics: () => ({
    data: mockAnalyticsData,
    isLoading: false,
    error: null,
    refetch: mockRefetch,
    isFetching: false,
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  useI18nStore.setState({ locale: "id" });
  useAuthStore.setState({
    user: {
      id: "owner-1",
      email: "owner@telebos.app",
      full_name: "Owner Boss",
      role: "owner",
      is_active: true,
      balance: 1000000,
    },
    isAuthenticated: true,
    isLoading: false,
  });
});

describe("AdminOnboardingPage", () => {
  it("denies access if user is not owner", () => {
    useAuthStore.setState({
      user: {
        id: "usr-basic",
        email: "basic@example.com",
        full_name: "Basic User",
        role: "basic",
        is_active: true,
        balance: 0,
      },
      isAuthenticated: true,
      isLoading: false,
    });

    render(<AdminOnboardingPage />);
    expect(screen.getByText("Akses Ditolak")).toBeDefined();
    expect(screen.getByText(/Hanya akun dengan peran Owner/i)).toBeDefined();
  });

  it("renders onboarding analytics and KPIs for owner", () => {
    render(<AdminOnboardingPage />);

    // Header & KPIs
    expect(screen.getByText("Onboarding & Discovery Analytics")).toBeDefined();
    expect(screen.getByText("Total Pengguna Terdaftar")).toBeDefined();
    expect(screen.getByText("100")).toBeDefined();
    expect(screen.getByText("80")).toBeDefined();
    expect(screen.getByText("80%")).toBeDefined();

    // Roles and breakdown sections
    expect(screen.getByText("Kategori & Peran Pengguna (Roles)")).toBeDefined();
    expect(screen.getByText("Saluran Akuisisi (Referral Source)")).toBeDefined();
    expect(screen.getByText("Skala Akun yang Dikelola (Volume)")).toBeDefined();
    expect(screen.getByText("Fitur yang Paling Diminati (Feature Demands)")).toBeDefined();

    // Table rows
    expect(screen.getByText("boss@agency.com")).toBeDefined();
    expect(screen.getByText("Boss Agency")).toBeDefined();
    expect(screen.getByText("solo@store.com")).toBeDefined();
    expect(screen.getByText("Dilewati")).toBeDefined();
    expect(screen.getByText("Selesai")).toBeDefined();
  });

  it("filters recent surveys table by search query", () => {
    render(<AdminOnboardingPage />);

    const searchInput = screen.getByPlaceholderText("Cari email / nama pengguna...");
    fireEvent.change(searchInput, { target: { value: "agency" } });

    expect(screen.getByText("boss@agency.com")).toBeDefined();
    expect(screen.queryByText("solo@store.com")).toBeNull();
  });

  it("opens survey detail dialog when clicking Detail button", () => {
    render(<AdminOnboardingPage />);

    const detailButtons = screen.getAllByText("Detail");
    fireEvent.click(detailButtons[0]);

    expect(screen.getByText("Detail Respon Onboarding")).toBeDefined();
    expect(screen.getAllByText("Boss Agency").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Mass Broadcast").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Multi-WebChat").length).toBeGreaterThanOrEqual(1);
  });
});
