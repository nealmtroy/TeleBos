import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18nStore } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import AdminDashboardPage from "./page";

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock admin hooks
const mockRefetchStats = vi.fn();
const mockRefetchSmmStats = vi.fn();
const mockRefetchSmmProfile = vi.fn();

vi.mock("@/hooks/use-admin", () => ({
  useAdminStats: () => ({
    data: {
      total_users: 1250,
      total_basic_users: 1000,
      total_pro_users: 180,
      total_premium_users: 65,
      total_owner_users: 5,
      total_accounts_connected: 450,
      accounts_active: 380,
      accounts_selling: 40,
      accounts_expired: 20,
      accounts_limited: 10,
      total_broadcast_jobs: 85,
      broadcast_running: 12,
      broadcast_stopped: 73,
      total_auto_reply_jobs: 34,
      auto_reply_running: 28,
      auto_reply_stopped: 6,
      total_auto_reply_sent: 5400,
      total_invite_jobs: 19,
      invite_running: 4,
      invite_stopped: 15,
    },
    isLoading: false,
    error: null,
    refetch: mockRefetchStats,
    isFetching: false,
  }),
}));

vi.mock("@/hooks/use-admin-smm", () => ({
  useAdminSmmStats: () => ({
    data: {
      total_services: 142,
      active_services: 98,
      total_orders: 875,
      pending_orders: 14,
      total_revenue: 12500000,
      total_users_with_orders: 210,
      panel_balance: "500000",
    },
    isLoading: false,
    refetch: mockRefetchSmmStats,
    isFetching: false,
  }),
  useAdminSmmProfile: () => ({
    data: {
      balance: "500000",
      name: "TeleBos Admin",
      sid: "BuzzerPanel-01",
      currency: "IDR",
    },
    isLoading: false,
    refetch: mockRefetchSmmProfile,
    isFetching: false,
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  useI18nStore.setState({ locale: "en" });
  useAuthStore.setState({
    user: {
      id: "owner-1",
      email: "owner@telebos.com",
      full_name: "Master Owner",
      role: "owner",
      is_active: true,
      balance: 9999999,
    },
    isAuthenticated: true,
    isLoading: false,
  });
});

describe("AdminDashboardPage", () => {
  it("shows Access Denied when user is not an owner", () => {
    useAuthStore.setState({
      user: {
        id: "user-1",
        email: "user@telebos.com",
        full_name: "Regular User",
        role: "basic",
        is_active: true,
        balance: 0,
      },
      isAuthenticated: true,
      isLoading: false,
    });

    render(<AdminDashboardPage />);

    expect(screen.getByText("Access Denied")).toBeDefined();
    expect(
      screen.getByText(
        "Only users with the Owner role are authorized to access the Admin Panel."
      )
    ).toBeDefined();
    expect(screen.getByText("Return to Dashboard")).toBeDefined();
  });

  it("renders the dashboard for owner user", () => {
    render(<AdminDashboardPage />);

    expect(screen.getByText("Admin Dashboard")).toBeDefined();
    expect(screen.getByText("System Operational")).toBeDefined();
    expect(screen.getByText("Platform Overview")).toBeDefined();
    expect(screen.getByText("SMM Provider Status")).toBeDefined();
    expect(screen.getByText("Owner Action Control Deck")).toBeDefined();

    // Verify stats rendering
    expect(screen.getByText("1,250")).toBeDefined(); // Total users
    expect(screen.getByText("450")).toBeDefined(); // Connected accounts
    expect(screen.getByText(`Rp ${(12500000).toLocaleString("id-ID")}`)).toBeDefined(); // SMM Revenue
  });

  it("triggers refetch on all queries when refresh button is clicked", () => {
    render(<AdminDashboardPage />);

    const refreshButton = screen.getByText("Refresh Data");
    fireEvent.click(refreshButton);

    expect(mockRefetchStats).toHaveBeenCalledTimes(1);
    expect(mockRefetchSmmStats).toHaveBeenCalledTimes(1);
    expect(mockRefetchSmmProfile).toHaveBeenCalledTimes(1);
  });

  it("navigates when clicking quick link card", () => {
    render(<AdminDashboardPage />);

    const userManagementCard = screen.getByText("User Management");
    fireEvent.click(userManagementCard);

    expect(mockPush).toHaveBeenCalledWith("/admin/users");
  });
});
