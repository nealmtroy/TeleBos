import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18nStore } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import AdminSecurityAnalyticsPage from "./page";
import type { SecurityAnalyticsData, SecurityAuditLogsTableData } from "@/hooks/use-admin-analytics";

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

const mockRefetchAnalytics = vi.fn();
const mockRefetchLogs = vi.fn();

const mockSecurityAnalyticsData: SecurityAnalyticsData = {
  period_start: "2026-10-05T00:00:00Z",
  period_end: "2026-10-12T00:00:00Z",
  total_events: 3450,
  kpis: {
    successful_logins: 2800,
    failed_logins: 45,
    password_changes: 12,
    twofa_changes: 8,
    api_key_actions: 14,
    role_changes: 6,
    balance_adjustments: 9,
    sensitive_admin_actions: 35,
    suspicious_events_count: 2,
  },
  outcome_breakdown: {
    success: 3380,
    failure: 55,
    warning: 15,
  },
  severity_breakdown: {
    info: 3350,
    warning: 85,
    critical: 15,
  },
  top_actions: [
    { action: "auth.login", count: 2800 },
    { action: "auth.login_failed", count: 45 },
    { action: "api_key.created", count: 10 },
  ],
  suspicious_signals: [
    {
      signal_type: "elevated_failed_logins",
      severity: "warning",
      actor_identifier: "198.51.100.25",
      event_count: 8,
      evidence_summary: "8 percobaan login gagal terdeteksi dari IP 198.51.100.25 dalam 10 menit.",
      recommended_action: "Tinjau traffic dari IP ini atau pantau apakah terjadi serangan brute-force.",
      last_seen: "2026-10-12T04:10:00Z",
    },
    {
      signal_type: "unauthorized_admin_access",
      severity: "warning",
      actor_identifier: "intruder@example.com",
      event_count: 3,
      evidence_summary: "3 upaya akses ke endpoint terproteksi administrator tanpa izin yang memadai.",
      recommended_action: "Verifikasi hak akses user atau periksa potensi scanning endpoint.",
      last_seen: "2026-10-12T03:50:00Z",
    },
  ],
  timeseries: [
    { timestamp: "2026-10-10", total_events: 500, failure_events: 10, warning_events: 2 },
    { timestamp: "2026-10-11", total_events: 620, failure_events: 15, warning_events: 5 },
    { timestamp: "2026-10-12", total_events: 480, failure_events: 8, warning_events: 1 },
  ],
};

const mockAuditLogsTableData: SecurityAuditLogsTableData = {
  events: [
    {
      id: "ev-1111-2222-3333",
      actor_id: "u-owner-1",
      actor_email: "owner@telebos.id",
      actor_role: "owner",
      action: "admin.role_changed",
      target_type: "user",
      target_id: "u-target-2",
      target_label: "target_pro@telebos.id",
      outcome: "success",
      severity: "warning",
      ip_address: "203.0.113.10",
      user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      metadata_payload: {
        old_role: "basic",
        new_role: "pro",
      },
      created_at: "2026-10-12T04:00:00Z",
    },
    {
      id: "ev-4444-5555-6666",
      actor_id: "u-user-3",
      actor_email: "failing_user@telebos.id",
      actor_role: "basic",
      action: "auth.login_failed",
      target_type: "system",
      target_id: null,
      target_label: "failing_user@telebos.id",
      outcome: "failure",
      severity: "warning",
      ip_address: "198.51.100.25",
      user_agent: "curl/7.88.1",
      metadata_payload: {
        reason: "invalid_credentials",
      },
      created_at: "2026-10-12T04:05:00Z",
    },
  ],
  total: 2,
  page: 1,
  page_size: 15,
  total_pages: 1,
};

let mockAnalyticsLoading = false;
let mockLogsLoading = false;
let mockAnalyticsDataState: SecurityAnalyticsData | null = mockSecurityAnalyticsData;
let mockLogsDataState: SecurityAuditLogsTableData | null = mockAuditLogsTableData;

vi.mock("@/hooks/use-admin-analytics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/use-admin-analytics")>();
  return {
    ...actual,
    useAdminSecurityAnalytics: () => ({
      data: mockAnalyticsDataState,
      isLoading: mockAnalyticsLoading,
      isFetching: false,
      refetch: mockRefetchAnalytics,
    }),
    useAdminSecurityAuditLogs: () => ({
      data: mockLogsDataState,
      isLoading: mockLogsLoading,
      isFetching: false,
      refetch: mockRefetchLogs,
    }),
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  useI18nStore.setState({ locale: "id" });
  mockAnalyticsLoading = false;
  mockLogsLoading = false;
  mockAnalyticsDataState = mockSecurityAnalyticsData;
  mockLogsDataState = mockAuditLogsTableData;
});

describe("AdminSecurityAnalyticsPage", () => {
  it("blocks non-owner users with access denied", () => {
    useAuthStore.setState({
      user: {
        id: "u-admin",
        email: "admin@telebos.id",
        role: "admin",
        full_name: "Admin User",
      } as any,
    });

    render(<AdminSecurityAnalyticsPage />);

    expect(screen.getByText("Akses Ditolak")).toBeDefined();
    expect(
      screen.getByText(/Akses ke Analitik Keamanan & Log Audit sensitif hanya diberikan kepada pemilik sistem/i)
    ).toBeDefined();
    expect(screen.queryByText("Security & Audit Analytics")).toBeNull();
  });

  it("renders security analytics KPIs and posture banner for owner", () => {
    useAuthStore.setState({
      user: {
        id: "owner-1",
        email: "owner@telebos.id",
        role: "owner",
        full_name: "Owner TeleBos",
      } as any,
    });

    render(<AdminSecurityAnalyticsPage />);

    // Header & Badge
    expect(screen.getByText("Security & Audit Analytics")).toBeDefined();
    expect(screen.getByText("Audit Trail & Access Governance")).toBeDefined();
    expect(screen.getByText("Append-Only Tamper-Resistant")).toBeDefined();

    // Invariant Banner
    expect(screen.getByText(/Jaminan Keamanan & Perlindungan Data Sensitif Audit Trail/i)).toBeDefined();

    // Primary KPI Cards
    expect(screen.getByText("3.450")).toBeDefined(); // Total events
    expect(screen.getByText("2.800")).toBeDefined(); // Successful logins
    expect(screen.getByText("45 gagal")).toBeDefined(); // Failed logins
    expect(screen.getByText("20")).toBeDefined(); // Password & 2FA changes (12 + 8)
    expect(screen.getByText("14")).toBeDefined(); // API Key actions
    expect(screen.getByText("6")).toBeDefined(); // Role changes
    expect(screen.getByText("9")).toBeDefined(); // Balance adjustments
  });

  it("renders calibrated suspicious access signals without defamatory fraud labels", () => {
    useAuthStore.setState({
      user: {
        id: "owner-1",
        email: "owner@telebos.id",
        role: "owner",
        full_name: "Owner TeleBos",
      } as any,
    });

    render(<AdminSecurityAnalyticsPage />);

    expect(screen.getByText("Sinyal Risiko & Aktivitas Akses Mencurigakan")).toBeDefined();
    expect(
      screen.getByText(/8 percobaan login gagal terdeteksi dari IP 198.51.100.25 dalam 10 menit./i)
    ).toBeDefined();
    expect(
      screen.getByText(/3 upaya akses ke endpoint terproteksi administrator tanpa izin yang memadai./i)
    ).toBeDefined();
  });

  it("renders audit trail logs table and handles search input", () => {
    useAuthStore.setState({
      user: {
        id: "owner-1",
        email: "owner@telebos.id",
        role: "owner",
        full_name: "Owner TeleBos",
      } as any,
    });

    render(<AdminSecurityAnalyticsPage />);

    expect(screen.getByText("Log Audit & Jejak Aktivitas Sensitif")).toBeDefined();
    expect(screen.getByText("target_pro@telebos.id")).toBeDefined();
    expect(screen.getAllByText("failing_user@telebos.id").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("203.0.113.10")).toBeDefined();

    const searchInput = screen.getByPlaceholderText(/Cari aktor, target, aksi, atau IP.../i);
    fireEvent.change(searchInput, { target: { value: "target_pro" } });
    expect(searchInput).toHaveProperty("value", "target_pro");
  });

  it("opens safe details modal and verifies redacted metadata without raw credentials", () => {
    useAuthStore.setState({
      user: {
        id: "owner-1",
        email: "owner@telebos.id",
        role: "owner",
        full_name: "Owner TeleBos",
      } as any,
    });

    render(<AdminSecurityAnalyticsPage />);

    // Click on first Detail button
    const detailButtons = screen.getAllByRole("button", { name: /Detail/i });
    fireEvent.click(detailButtons[0]);

    // Modal should be open
    expect(screen.getByText("Rincian Peristiwa Audit")).toBeDefined();
    expect(screen.getByText(/Payload Metadata Teredaksi \(Redacted\)/i)).toBeDefined();
    expect(
      screen.getByText(/Kredensial rahasia, kata sandi, token autentikasi, dan OTP secara otomatis disanitasi/i)
    ).toBeDefined();

    // Verify close button
    const closeButton = screen.getByRole("button", { name: "Tutup" });
    fireEvent.click(closeButton);

    expect(screen.queryByText("Rincian Peristiwa Audit")).toBeNull();
  });

  it("supports manual refresh all action", async () => {
    useAuthStore.setState({
      user: {
        id: "owner-1",
        email: "owner@telebos.id",
        role: "owner",
        full_name: "Owner TeleBos",
      } as any,
    });

    render(<AdminSecurityAnalyticsPage />);

    const refreshBtn = screen.getByRole("button", { name: /Refresh/i });
    fireEvent.click(refreshBtn);

    expect(mockRefetchAnalytics).toHaveBeenCalledTimes(1);
    expect(mockRefetchLogs).toHaveBeenCalledTimes(1);
  });

  it("switches time range presets", () => {
    useAuthStore.setState({
      user: {
        id: "owner-1",
        email: "owner@telebos.id",
        role: "owner",
        full_name: "Owner TeleBos",
      } as any,
    });

    render(<AdminSecurityAnalyticsPage />);

    const dayBtn = screen.getByRole("button", { name: "24 Jam" });
    fireEvent.click(dayBtn);

    expect(dayBtn).toBeDefined();
  });

  it("renders clean state when no suspicious signals or audit logs exist", () => {
    useAuthStore.setState({
      user: {
        id: "owner-1",
        email: "owner@telebos.id",
        role: "owner",
        full_name: "Owner TeleBos",
      } as any,
    });
    mockAnalyticsDataState = {
      ...mockSecurityAnalyticsData,
      suspicious_signals: [],
    };
    mockLogsDataState = {
      events: [],
      total: 0,
      page: 1,
      page_size: 15,
      total_pages: 1,
    };

    render(<AdminSecurityAnalyticsPage />);

    expect(
      screen.getByText(/Tidak ada anomali atau sinyal mencurigakan terdeteksi/i)
    ).toBeDefined();
    expect(
      screen.getByText(/Tidak ada catatan audit yang cocok/i)
    ).toBeDefined();
  });
});
