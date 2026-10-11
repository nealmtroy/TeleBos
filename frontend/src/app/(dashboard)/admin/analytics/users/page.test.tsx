import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18nStore } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import AdminUserAnalyticsPage from "./page";

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock hooks
const mockRefetchAnalytics = vi.fn();
const mockRefetchTrend = vi.fn();
const mockRefetchUsers = vi.fn();

let mockUserAnalyticsData: any = {
  total_users: 1450,
  new_users_in_period: 120,
  user_growth_percentage: 25.5,
  dau: 142,
  wau: 580,
  mau: 1120,
  stickiness_dau_mau_ratio: 12.7,
  product_meaningful_active_users: 480,
  product_meaningful_active_rate: 33.1,
  churned_users_count: 14,
  reactivated_users_count: 8,
  status_breakdown: {
    active_users_count: 1120,
    dormant_users_count: 310,
    suspended_users_count: 12,
    banned_users_count: 8,
  },
  role_distribution: {
    freetrial: 850,
    basic: 320,
    pro: 210,
    premium: 65,
    owner: 5,
  },
  retention: {
    cohort_total_users: 120,
    d1_eligible_users: 110,
    d1_retained_users: 55,
    d1_retention_rate: 50.0,
    d7_eligible_users: 80,
    d7_retained_users: 32,
    d7_retention_rate: 40.0,
    d30_eligible_users: 0,
    d30_retained_users: 0,
    d30_retention_rate: null, // Immature cohort
  },
  feature_adoption: {
    telegram_accounts_connected_users: 520,
    telegram_accounts_adoption_rate: 35.9,
    broadcast_users: 310,
    broadcast_adoption_rate: 21.4,
    invite_users: 180,
    invite_adoption_rate: 12.4,
    auto_reply_users: 95,
    auto_reply_adoption_rate: 6.6,
    smm_order_users: 410,
    smm_order_adoption_rate: 28.3,
    marketplace_traders: 85,
    marketplace_adoption_rate: 5.9,
  },
  onboarding_completion_rate: 74.2,
  persona_distribution: { dropshipper: 50, agency: 30 },
  referral_distribution: { google: 40, telegram: 60 },
  expiring_subscriptions_30d: 6,
  suspended_users_count: 12,
  tracking_coverage_note:
    "Aktivitas produk dihitung dari mutasi transaksi riil, log automasi Telegram, dan riwayat pesanan SMM. Kohor retensi mengevaluasi pengguna yang telah mencapai usia batas D1 (24 jam), D7 (7 hari), dan D30 (30 hari).",
};

let mockUserListData: any = {
  users: [
    {
      id: "u-1",
      email: "budi@example.com",
      full_name: "Budi Santoso",
      role: "premium",
      balance: 250000,
      is_active: true,
      order_count: 14,
      connected_accounts: 5,
      created_at: "2026-10-01T00:00:00Z",
    },
    {
      id: "u-2",
      email: "citra@example.com",
      full_name: "Citra Dewi",
      role: "pro",
      balance: 120000,
      is_active: true,
      order_count: 8,
      connected_accounts: 3,
      created_at: "2026-10-02T00:00:00Z",
    },
    {
      id: "u-3",
      email: "deni@example.com",
      full_name: "Deni Pratama",
      role: "basic",
      balance: 0,
      is_active: false, // Banned
      order_count: 1,
      connected_accounts: 0,
      created_at: "2026-10-03T00:00:00Z",
    },
  ],
  total: 3,
};

let mockAnalyticsLoading = false;

vi.mock("@/hooks/use-admin-analytics", () => ({
  useAdminUserAnalytics: () => ({
    data: mockUserAnalyticsData,
    isLoading: mockAnalyticsLoading,
    isFetching: false,
    refetch: mockRefetchAnalytics,
  }),
  useAdminAnalyticsTimeseries: () => ({
    data: {
      metric: "users",
      interval: "day",
      points: [
        { date: "2026-10-01", value: 10 },
        { date: "2026-10-02", value: 15 },
        { date: "2026-10-03", value: 20 },
      ],
      summary_total: 45,
      summary_average: 15.0,
    },
    isLoading: false,
    refetch: mockRefetchTrend,
  }),
}));

vi.mock("@/hooks/use-admin", () => ({
  useAdminUsers: () => ({
    data: mockUserListData,
    isLoading: false,
    refetch: mockRefetchUsers,
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
      email: "owner@telebos.internal",
      role: "owner",
      full_name: "Super Owner",
      is_active: true,
    } as any,
  });
});

describe("AdminUserAnalyticsPage", () => {
  it("denies access when user is not owner", () => {
    useAuthStore.setState({
      user: {
        id: "user-2",
        email: "member@telebos.internal",
        role: "basic",
        full_name: "Regular Member",
        is_active: true,
      } as any,
    });

    render(<AdminUserAnalyticsPage />);
    expect(screen.getByText("Akses Ditolak")).toBeDefined();
  });

  it("renders user analytics page for owner role", () => {
    render(<AdminUserAnalyticsPage />);

    expect(screen.getByText("User Analytics & Lifecycle")).toBeDefined();
    expect(screen.getByText("Cohort & Demographics")).toBeDefined();
    expect(screen.getByText(/Transparansi Pelacakan Historis/)).toBeDefined();
  });

  it("displays key user growth & engagement metrics", () => {
    render(<AdminUserAnalyticsPage />);

    // Total Users formatted
    expect(screen.getByText(/1[,.]?450/)).toBeDefined();
    expect(screen.getByText(/\+25\.5%/)).toBeDefined();
    expect(screen.getByText(/\+120 user/)).toBeDefined();

    // DAU, MAU, Stickiness
    expect(screen.getByText(/142/)).toBeDefined();
    expect(screen.getByText("12.7%")).toBeDefined();

    // Meaningful Product Active Users
    expect(screen.getByText("480")).toBeDefined();
    expect(screen.getByText("33.1% Dari Total")).toBeDefined();

    // Churn & Reactivation
    expect(screen.getAllByText("14").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("+8")).toBeDefined();
  });

  it("handles mature and immature retention cohorts accurately", () => {
    render(<AdminUserAnalyticsPage />);

    // D1 (50.0%) and D7 (40.0%) mature rates
    expect(screen.getByText("50%")).toBeDefined();
    expect(screen.getByText("40%")).toBeDefined();

    // D30 cohort is immature (< 30 days) -> renders N/A or Belum Matang badge, not 0%
    expect(screen.getByText(/Belum Matang \(<30 Hari\)/)).toBeDefined();
  });

  it("displays lifecycle status breakdown and expiring subscriptions", () => {
    render(<AdminUserAnalyticsPage />);

    expect(screen.getByText("Status Siklus Hidup Pengguna")).toBeDefined();
    expect(screen.getAllByText(/1[,.]?120/).length).toBeGreaterThanOrEqual(1); // Active MAU
    expect(screen.getByText("310")).toBeDefined(); // Dormant
    expect(screen.getByText("12")).toBeDefined(); // Suspended
    expect(screen.getAllByText("8").length).toBeGreaterThanOrEqual(1); // Banned

    // Expiring subscription notice
    expect(screen.getByText(/langganan berbayar akan kedaluwarsa/)).toBeDefined();
    expect(screen.getByText("Review")).toBeDefined();
  });

  it("displays feature adoption bento grid", () => {
    render(<AdminUserAnalyticsPage />);

    expect(screen.getByText("Adopsi Fitur Utama Platform TeleBos")).toBeDefined();
    expect(screen.getByText("Armada Akun Telegram")).toBeDefined();
    expect(screen.getByText("35.9%")).toBeDefined();

    expect(screen.getByText("Mesin Siaran / Broadcast")).toBeDefined();
    expect(screen.getByText("21.4%")).toBeDefined();

    expect(screen.getByText("Layanan SMM Buzzer")).toBeDefined();
    expect(screen.getByText("28.3%")).toBeDefined();
  });

  it("filters and searches users in directory table", () => {
    render(<AdminUserAnalyticsPage />);

    // Renders table rows
    expect(screen.getByText("Budi Santoso")).toBeDefined();
    expect(screen.getByText("citra@example.com")).toBeDefined();
    expect(screen.getByText("Deni Pratama")).toBeDefined();

    // Search input filtering
    const searchInput = screen.getByPlaceholderText("Cari nama atau email...");
    fireEvent.change(searchInput, { target: { value: "Budi" } });

    expect(screen.getByText("Budi Santoso")).toBeDefined();
    expect(screen.queryByText("Citra Dewi")).toBeNull();
  });

  it("switches date filter presets", () => {
    render(<AdminUserAnalyticsPage />);

    const btn7d = screen.getByRole("button", { name: "7 Hari" });
    fireEvent.click(btn7d);

    expect(btn7d.className).toContain("bg-background");
  });

  it("refreshes data when refresh button is clicked", () => {
    render(<AdminUserAnalyticsPage />);

    const refreshBtn = screen.getByRole("button", { name: /Refresh/i });
    fireEvent.click(refreshBtn);

    expect(mockRefetchAnalytics).toHaveBeenCalled();
    expect(mockRefetchTrend).toHaveBeenCalled();
    expect(mockRefetchUsers).toHaveBeenCalled();
  });
});
