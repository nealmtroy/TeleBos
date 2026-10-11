import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18nStore } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import AdminAnalyticsOverviewPage from "./page";

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock hooks
const mockRefetchOverview = vi.fn();
const mockRefetchUserTrend = vi.fn();
const mockRefetchRevenueTrend = vi.fn();
const mockRefetchTxTrend = vi.fn();
const mockRefetchAutomation = vi.fn();

let mockOverviewData: any = {
  period_start: "2026-10-01",
  period_end: "2026-10-08",
  total_registered_users: 1450,
  total_new_users: 120,
  user_growth_percentage: 25.5,
  dau: 142,
  wau: 580,
  mau: 1120,
  total_telegram_accounts: 320,
  active_telegram_accounts: 290,
  spam_limited_accounts: 12,
  active_paid_subscriptions: 85,
  total_broadcast_messages_sent: 45000,
  total_broadcast_messages_failed: 2500,
  broadcast_delivery_rate: 94.7,
  gross_revenue: 15500000,
  prev_gross_revenue: 12400000,
  revenue_growth_percentage: 25.0,
  net_platform_margin: 6200000,
  net_cashflow: 4800000,
  topup_approved_volume: 8500000,
  withdraw_approved_volume: 3700000,
  current_balance_liability: 5400000,
  total_transactions_count: 340,
  system_errors_count: 0,
  top_failure_reasons: {
    flood_wait: 1200,
    banned: 800,
    slowmode: 350,
    admin_only: 150,
  },
};

let mockOverviewLoading = false;
let mockOverviewError: any = null;

vi.mock("@/hooks/use-admin-analytics", () => ({
  useAdminAnalyticsOverview: () => ({
    data: mockOverviewData,
    isLoading: mockOverviewLoading,
    error: mockOverviewError,
    refetch: mockRefetchOverview,
    isFetching: false,
  }),
  useAdminAnalyticsTimeseries: (metric: string) => {
    if (metric === "users") {
      return {
        data: {
          metric: "users",
          interval: "day",
          points: [
            { date: "2026-10-01", value: 12 },
            { date: "2026-10-02", value: 18 },
            { date: "2026-10-03", value: 25 },
          ],
          summary_total: 55,
          summary_average: 18.3,
        },
        isLoading: false,
        refetch: mockRefetchUserTrend,
      };
    }
    if (metric === "revenue") {
      return {
        data: {
          metric: "revenue",
          interval: "day",
          points: [
            { date: "2026-10-01", value: 2000000 },
            { date: "2026-10-02", value: 3500000 },
          ],
          summary_total: 5500000,
          summary_average: 2750000,
        },
        isLoading: false,
        refetch: mockRefetchRevenueTrend,
      };
    }
    return {
      data: {
        metric: "transactions",
        interval: "day",
        points: [
          { date: "2026-10-01", value: 45 },
          { date: "2026-10-02", value: 60 },
        ],
        summary_total: 105,
        summary_average: 52.5,
      },
      isLoading: false,
      refetch: mockRefetchTxTrend,
    };
  },
  useAdminAnalyticsAutomation: () => ({
    data: {
      total_broadcast_jobs: 64,
      total_messages_sent: 45000,
      total_messages_failed: 2500,
      broadcast_success_rate: 94.7,
      top_failure_reasons: { flood_wait: 1200 },
      total_invite_jobs: 14,
      total_members_invited: 3200,
      total_auto_join_jobs: 28,
      total_auto_joins_succeeded: 480,
      total_auto_replies_sent: 9600,
    },
    isLoading: false,
    refetch: mockRefetchAutomation,
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  useI18nStore.setState({ locale: "en" });
  mockOverviewLoading = false;
  mockOverviewError = null;
  useAuthStore.setState({
    user: {
      id: "owner-1",
      email: "owner@telebos.com",
      full_name: "Platform Owner",
      role: "owner",
      is_active: true,
      balance: 9999999,
    },
    isAuthenticated: true,
    isLoading: false,
  });
});

describe("AdminAnalyticsOverviewPage", () => {
  it("denies access to non-owner users", () => {
    useAuthStore.setState({
      user: {
        id: "pro-user",
        email: "pro@telebos.com",
        full_name: "Pro Member",
        role: "pro",
        is_active: true,
        balance: 1000,
      },
    });

    render(<AdminAnalyticsOverviewPage />);
    expect(screen.getByText(/Access Denied/i)).toBeInTheDocument();
    expect(screen.queryByText(/Live Telemetry/i)).not.toBeInTheDocument();
  });

  it("renders page header and core KPI metrics for owner", () => {
    render(<AdminAnalyticsOverviewPage />);

    expect(screen.getByText("Live Telemetry")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Analytics Overview" })).toBeInTheDocument();

    // Check Total Users Card
    expect(screen.getByText("1,450")).toBeInTheDocument();
    expect(screen.getByText("DAU: 142")).toBeInTheDocument();
    expect(screen.getByText("WAU: 580")).toBeInTheDocument();
    expect(screen.getByText("MAU: 1120")).toBeInTheDocument();

    // Check Subscriptions Card
    expect(screen.getByText("85")).toBeInTheDocument();
    expect(screen.getByText("Pro & Premium Active")).toBeInTheDocument();

    // Check Connected Telegram fleet
    expect(screen.getByText("320")).toBeInTheDocument();
    expect(screen.getByText("290 Aktif")).toBeInTheDocument();

    // Check Platform Gross Revenue
    expect(screen.getByText(/Rp 15\.500\.000/i)).toBeInTheDocument();
    expect(screen.getByText(/Rp 6\.200\.000/i)).toBeInTheDocument();

    // Check Automation Delivery
    expect(screen.getByText("94.7%")).toBeInTheDocument();
    expect(screen.getByText(/45[,.]000 terkirim/i)).toBeInTheDocument();
  });

  it("renders filter buttons and toggles range selection", () => {
    render(<AdminAnalyticsOverviewPage />);

    const btn24h = screen.getByRole("button", { name: "24 Jam" });
    const btn7d = screen.getByRole("button", { name: "7 Hari" });
    const btn30d = screen.getByRole("button", { name: "30 Hari" });
    const btn90d = screen.getByRole("button", { name: "90 Hari" });
    const btnCustom = screen.getByRole("button", { name: "Kustom" });

    expect(btn24h).toBeInTheDocument();
    expect(btn7d).toBeInTheDocument();
    expect(btn30d).toBeInTheDocument();
    expect(btn90d).toBeInTheDocument();
    expect(btnCustom).toBeInTheDocument();

    // Click 30 Hari
    fireEvent.click(btn30d);
    // Click Kustom to verify date picker appears
    fireEvent.click(btnCustom);
    expect(document.getElementById("date-range-picker")).toBeInTheDocument();
  });

  it("allows switching between revenue and transactions chart tabs", () => {
    render(<AdminAnalyticsOverviewPage />);

    expect(screen.getByText("Pertumbuhan Pengguna Baru")).toBeInTheDocument();
    expect(screen.getByText("Tren Finansial & Transaksi")).toBeInTheDocument();

    const txTab = screen.getByRole("tab", { name: "Transaksi" });
    expect(txTab).toBeInTheDocument();
    fireEvent.click(txTab);
  });

  it("triggers refresh handlers on clicking Refresh button", () => {
    render(<AdminAnalyticsOverviewPage />);

    const refreshBtn = screen.getByRole("button", { name: /Refresh/i });
    fireEvent.click(refreshBtn);

    expect(mockRefetchOverview).toHaveBeenCalled();
    expect(mockRefetchUserTrend).toHaveBeenCalled();
    expect(mockRefetchRevenueTrend).toHaveBeenCalled();
  });

  it("renders error state when overview query fails", () => {
    mockOverviewError = new Error("Network timeout");
    render(<AdminAnalyticsOverviewPage />);

    expect(
      screen.getByText(/Gagal memuat metrik analytics dari server/i)
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
