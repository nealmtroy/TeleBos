import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18nStore } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import AdminTelegramAccountAnalyticsPage from "./page";

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
const mockRefetchDirectory = vi.fn();

let mockTelegramAnalyticsData: any = {
  period_start: "2026-09-12T00:00:00Z",
  period_end: "2026-10-12T00:00:00Z",
  total_registered_accounts: 420,
  new_accounts_in_period: 45,
  deleted_accounts_in_period: 8,
  net_account_growth: 37,
  status_counts: {
    total_accounts: 420,
    active_connected: 310,
    disconnected_idle: 85,
    expired_needs_reauth: 12,
    selling_marketplace: 13,
    spam_limited: 7,
    spam_normal: 290,
    spam_unknown: 123,
  },
  connection_metrics: {
    total_connection_attempts: 1250,
    successful_connections: 1215,
    failed_connections: 35,
    connection_success_rate: 97.2,
    total_reconnect_attempts: 180,
    successful_reconnects: 172,
    reconnect_success_rate: 95.6,
    top_failure_reasons: {
      TimeoutError: 20,
      RpcCallFailError: 10,
      DeadSessionError: 5,
    },
  },
  plan_distribution: {
    plan_distribution: {
      basic: 120,
      pro: 190,
      premium: 95,
      owner: 15,
    },
    average_accounts_per_user: 3.45,
    users_with_accounts_count: 122,
    depth_distribution: {
      "1": 45,
      "2_to_5": 58,
      "6_to_10": 14,
      more_than_10: 5,
    },
  },
  recent_status_events: [
    {
      id: "evt-1",
      event_name: "account_disconnected",
      timestamp: "2026-10-11T12:00:00Z",
      user_id: "u-1",
      user_email: "test@telebos.id",
      account_id: "acc-1",
      phone_masked: "+6281****7890",
      status_change: "active -> idle",
      error_reason: null,
    },
    {
      id: "evt-2",
      event_name: "account_session_expired",
      timestamp: "2026-10-10T08:30:00Z",
      user_id: "u-2",
      user_email: "revoked@telebos.id",
      account_id: "acc-2",
      phone_masked: "+6282****1234",
      status_change: "active -> expired",
      error_reason: "DeadSessionError",
    },
  ],
  tracking_coverage_note:
    "Metrik status dihitung langsung dari basis data dan socket aktif Telethon in-memory. Sesi autentikasi, OTP, dan token tidak pernah diekspos maupun disimpan dalam log analytics.",
};

let mockDirectoryData: any = {
  accounts: [
    {
      id: "acc-1",
      user_id: "u-1",
      user_email: "test@telebos.id",
      user_role: "premium",
      phone_masked: "+6281****7890",
      username: "telebos_bot_1",
      first_name: "Account One",
      is_active: true,
      is_premium: true,
      for_sale: false,
      spam_status: "normal",
      spam_detail: null,
      in_memory_connected: true,
      auto_reply_enabled: true,
      last_sync_at: "2026-10-12T01:00:00Z",
      spam_last_checked_at: "2026-10-11T10:00:00Z",
      updated_at: "2026-10-12T01:00:00Z",
      created_at: "2026-10-01T00:00:00Z",
    },
    {
      id: "acc-2",
      user_id: "u-2",
      user_email: "expired@telebos.id",
      user_role: "pro",
      phone_masked: "+6285****4321",
      username: "telebos_exp",
      first_name: "Expired Acc",
      is_active: false,
      is_premium: false,
      for_sale: false,
      spam_status: "limited",
      spam_detail: "Spambot marked limited until 2026-10-20",
      in_memory_connected: false,
      auto_reply_enabled: false,
      last_sync_at: null,
      spam_last_checked_at: "2026-10-09T00:00:00Z",
      updated_at: "2026-10-10T00:00:00Z",
      created_at: "2026-10-02T00:00:00Z",
    },
  ],
  total: 2,
  page: 1,
  page_size: 15,
  total_pages: 1,
};

let mockAnalyticsLoading = false;
let mockDirectoryLoading = false;

vi.mock("@/hooks/use-admin-analytics", () => ({
  useAdminTelegramAccountsAnalytics: () => ({
    data: mockTelegramAnalyticsData,
    isLoading: mockAnalyticsLoading,
    isFetching: false,
    refetch: mockRefetchAnalytics,
  }),
  useAdminAnalyticsTimeseries: () => ({
    data: {
      metric: "accounts_added",
      interval: "day",
      points: [
        { date: "2026-10-01", value: 3 },
        { date: "2026-10-02", value: 5 },
        { date: "2026-10-03", value: 4 },
      ],
      summary_total: 12,
      summary_average: 4.0,
    },
    isLoading: false,
    refetch: mockRefetchTrend,
  }),
  useAdminTelegramAccountsDirectory: () => ({
    data: mockDirectoryData,
    isLoading: mockDirectoryLoading,
    isFetching: false,
    refetch: mockRefetchDirectory,
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  useI18nStore.setState({ locale: "id" });
  mockAnalyticsLoading = false;
  mockDirectoryLoading = false;
});

describe("AdminTelegramAccountAnalyticsPage", () => {
  it("blocks non-owner users with access denied", () => {
    useAuthStore.setState({
      user: {
        id: "u-99",
        email: "regular@example.com",
        role: "user",
        full_name: "Regular User",
      } as any,
    });

    render(<AdminTelegramAccountAnalyticsPage />);

    expect(screen.getByText("Akses Ditolak")).toBeDefined();
    expect(screen.getByText(/Hanya.*Owner.*akses/i)).toBeDefined();
    expect(screen.queryByText("Telegram Account Analytics")).toBeNull();
  });

  it("renders telegram account analytics KPIs and fleet health for owner", () => {
    useAuthStore.setState({
      user: {
        id: "owner-1",
        email: "owner@telebos.id",
        role: "owner",
        full_name: "Owner",
      } as any,
    });

    render(<AdminTelegramAccountAnalyticsPage />);

    // Header & Badge
    expect(screen.getAllByText("Telegram Account Analytics").length).toBeGreaterThan(0);
    expect(screen.getByText("Live Fleet Intelligence")).toBeDefined();

    // Top deck KPI cards
    expect(screen.getByText("420")).toBeDefined(); // Total registered
    expect(screen.getByText("+45 baru")).toBeDefined();
    expect(screen.getByText("-8 dihapus")).toBeDefined();
    expect(screen.getByText("310")).toBeDefined(); // Active connected
    expect(screen.getByText("97.2%")).toBeDefined(); // Connection success rate
    expect(screen.getByText("95.6%")).toBeDefined(); // Reconnect success rate
    expect(screen.getByText("12")).toBeDefined(); // Expired / needs reauth
    expect(screen.getByText("7")).toBeDefined(); // Spam limited
  });

  it("renders connection failure diagnostics and top reasons", () => {
    useAuthStore.setState({
      user: {
        id: "owner-1",
        email: "owner@telebos.id",
        role: "owner",
        full_name: "Owner",
      } as any,
    });

    render(<AdminTelegramAccountAnalyticsPage />);

    expect(screen.getByText("Diagnostik Koneksi & Error")).toBeDefined();
    expect(screen.getByText("TimeoutError")).toBeDefined();
    expect(screen.getByText("20 kali")).toBeDefined();
    expect(screen.getByText("RpcCallFailError")).toBeDefined();
    expect(screen.getByText("DeadSessionError")).toBeDefined();
  });

  it("renders account plan distribution and average accounts per user", () => {
    useAuthStore.setState({
      user: {
        id: "owner-1",
        email: "owner@telebos.id",
        role: "owner",
        full_name: "Owner",
      } as any,
    });

    render(<AdminTelegramAccountAnalyticsPage />);

    expect(screen.getByText("3.45 akun")).toBeDefined();
    expect(screen.getByText("122 User")).toBeDefined();
    expect(screen.getAllByText("basic").length).toBeGreaterThan(0);
    expect(screen.getAllByText("pro").length).toBeGreaterThan(0);
  });

  it("renders audit stream events and masked phone numbers without credential exposure", () => {
    useAuthStore.setState({
      user: {
        id: "owner-1",
        email: "owner@telebos.id",
        role: "owner",
        full_name: "Owner",
      } as any,
    });

    render(<AdminTelegramAccountAnalyticsPage />);

    expect(screen.getByText("Riwayat Perubahan Status & Log Koneksi")).toBeDefined();
    expect(screen.getByText("account_disconnected")).toBeDefined();
    expect(screen.getByText("account_session_expired")).toBeDefined();
    expect(screen.getAllByText("+6281****7890").length).toBeGreaterThan(0);
    expect(screen.getByText("+6282****1234")).toBeDefined();

    // Verify session string / tokens are never rendered in document
    expect(screen.queryByText(/session_string/i)).toBeNull();
    expect(screen.queryByText(/auth_key/i)).toBeNull();
  });

  it("renders telegram account directory table with search and filters", () => {
    useAuthStore.setState({
      user: {
        id: "owner-1",
        email: "owner@telebos.id",
        role: "owner",
        full_name: "Owner",
      } as any,
    });

    render(<AdminTelegramAccountAnalyticsPage />);

    expect(screen.getByText("Direktori Akun Telegram")).toBeDefined();
    expect(screen.getByText("Account One")).toBeDefined();
    expect(screen.getByText("@telebos_bot_1")).toBeDefined();
    expect(screen.getByText("test@telebos.id")).toBeDefined();
    expect(screen.getByText("Socket Live")).toBeDefined();

    // Second account
    expect(screen.getByText("Expired Acc")).toBeDefined();
    expect(screen.getByText("Butuh Reauth")).toBeDefined();
    expect(screen.getAllByText("Spam Limited").length).toBeGreaterThan(0);

    // Search and filter triggers
    const searchInput = screen.getByPlaceholderText(
      "Cari nomor HP, username, nama, atau email pemilik..."
    );
    fireEvent.change(searchInput, { target: { value: "test@telebos.id" } });
    fireEvent.submit(searchInput);

    expect(mockRefetchDirectory).toHaveBeenCalled();
  });

  it("triggers refresh button for all queries", () => {
    useAuthStore.setState({
      user: {
        id: "owner-1",
        email: "owner@telebos.id",
        role: "owner",
        full_name: "Owner",
      } as any,
    });

    render(<AdminTelegramAccountAnalyticsPage />);

    const refreshBtn = screen.getByRole("button", { name: /Refresh/i });
    fireEvent.click(refreshBtn);

    expect(mockRefetchAnalytics).toHaveBeenCalled();
    expect(mockRefetchTrend).toHaveBeenCalled();
    expect(mockRefetchDirectory).toHaveBeenCalled();
  });
});
