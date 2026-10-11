import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18nStore } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import AdminAutomationAnalyticsPage from "./page";

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock hooks
const mockRefetchAnalytics = vi.fn();
const mockRefetchTimeseries = vi.fn();
const mockRefetchDirectory = vi.fn();

let mockAutomationAnalyticsData: any = {
  period_start: "2026-10-05T00:00:00Z",
  period_end: "2026-10-12T00:00:00Z",
  performance: {
    total_logical_jobs: 1200,
    total_execution_attempts: 1500,
    successful_executions: 1388,
    failed_executions: 112,
    cancelled_executions: 15,
    pending_executions: 25,
    success_rate: 92.5,
    failure_rate: 7.5,
    retry_rate: 8.2,
    timeout_rate: 1.4,
    retried_executions_count: 98,
    timeout_executions_count: 21,
    average_duration_seconds: 14.2,
    p95_duration_seconds: 48.5,
  },
  status_breakdown: {
    total_jobs: 1200,
    successful_completed: 1050,
    running: 30,
    pending: 25,
    paused: 10,
    cancelled: 15,
    failed: 70,
  },
  queue_worker: {
    queue_backlog_count: 45,
    average_queue_wait_seconds: 3.8,
    p95_queue_wait_seconds: 12.0,
    is_queue_connected: true,
    active_worker_consumers: 1,
    worker_health_status: "healthy",
    worker_failures_count: 2,
    active_running_tasks_count: 7,
  },
  usage_by_type: {
    broadcast_jobs_count: 800,
    broadcast_executions_count: 900,
    invite_jobs_count: 300,
    invite_executions_count: 350,
    autojoin_jobs_count: 150,
    autojoin_executions_count: 200,
    autoreply_executions_count: 50,
  },
  error_breakdown: {
    by_task_type: { broadcast: 45, invite: 35, autojoin: 22, autoreply: 10 },
    by_error_category: {
      "FloodWait / Rate Limit": 35,
      "Privacy Restriction": 18,
      "Admin Permissions Required": 12,
      "Dead / Expired Session": 8,
      Timeout: 21,
      "Other / System Error": 18,
    },
    top_error_messages: [
      { message: "A wait of 42 seconds is required (FloodWaitError)", count: 28 },
      { message: "The user privacy settings prevent this action (UserPrivacyRestrictedError)", count: 15 },
      { message: "Chat admin privilege required (ChatAdminRequiredError)", count: 10 },
    ],
  },
};

let mockDirectoryData: any = {
  tasks: [
    {
      task_id: "job-bc-12345678",
      automation_type: "broadcast",
      user_id: "u-1",
      user_email: "broadcast_admin@telebos.id",
      status: "completed",
      progress_percentage: 100,
      total_items: 100,
      successful_items: 98,
      failed_items: 2,
      started_at: "2026-10-12T01:00:05Z",
      completed_at: "2026-10-12T01:02:15Z",
      queue_wait_seconds: 5.0,
      duration_seconds: 130.0,
      retry_count: 0,
      error_summary: null,
    },
    {
      task_id: "job-inv-87654321",
      automation_type: "invite",
      user_id: "u-2",
      user_email: "inviter@telebos.id",
      status: "failed",
      progress_percentage: 24,
      total_items: 50,
      successful_items: 12,
      failed_items: 38,
      started_at: "2026-10-12T02:00:08Z",
      completed_at: "2026-10-12T02:01:20Z",
      queue_wait_seconds: 8.0,
      duration_seconds: 72.0,
      retry_count: 2,
      error_summary: "A wait of 300 seconds is required (FloodWaitError)",
    },
  ],
  total: 2,
  page: 1,
  page_size: 10,
  total_pages: 1,
};

let mockAnalyticsLoading = false;
let mockDirectoryLoading = false;

vi.mock("@/hooks/use-admin-analytics", () => ({
  useAdminAnalyticsAutomation: () => ({
    data: mockAutomationAnalyticsData,
    isLoading: mockAnalyticsLoading,
    isFetching: false,
    error: null,
    refetch: mockRefetchAnalytics,
  }),
  useAdminAnalyticsTimeseries: () => ({
    data: [
      { date: "2026-10-06", value: 120 },
      { date: "2026-10-07", value: 240 },
      { date: "2026-10-08", value: 180 },
    ],
    isLoading: false,
    refetch: mockRefetchTimeseries,
  }),
  useAdminAutomationTasksDirectory: () => ({
    data: mockDirectoryData,
    isLoading: mockDirectoryLoading,
    isFetching: false,
    error: null,
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

describe("AdminAutomationAnalyticsPage", () => {
  it("blocks non-owner users with access denied", () => {
    useAuthStore.setState({
      user: {
        id: "u-regular",
        email: "regular@example.com",
        role: "user",
        full_name: "Regular User",
      } as any,
    });

    render(<AdminAutomationAnalyticsPage />);

    expect(screen.getByText("Akses Ditolak")).toBeDefined();
    expect(screen.getByText(/Akses ke Telemetri & Analitik Automasi hanya diberikan kepada pemilik sistem/i)).toBeDefined();
    expect(screen.queryByText("Automation & Worker Analytics")).toBeNull();
  });

  it("renders automation analytics KPIs and worker health for owner", () => {
    useAuthStore.setState({
      user: {
        id: "owner-1",
        email: "owner@telebos.id",
        role: "owner",
        full_name: "Owner",
      } as any,
    });

    render(<AdminAutomationAnalyticsPage />);

    // Header & Badge
    expect(screen.getAllByText("Automation & Worker Analytics").length).toBeGreaterThan(0);
    expect(screen.getByText("Live Task Telemetry")).toBeDefined();

    // Invariant banner
    expect(screen.getByText(/Pemisahan Logical Jobs vs Execution Attempts/i)).toBeDefined();

    // Top deck KPIs
    expect(screen.getByText("1,500")).toBeDefined(); // executions
    expect(screen.getByText("1,200 jobs")).toBeDefined(); // logical jobs
    expect(screen.getByText("92.5%")).toBeDefined(); // success rate
    expect(screen.getByText("7.5%")).toBeDefined(); // failure rate
    expect(screen.getByText("8.2%")).toBeDefined(); // retry rate
    expect(screen.getByText("1.4%")).toBeDefined(); // timeout rate
    expect(screen.getByText("14.2 dtk")).toBeDefined(); // avg duration
    expect(screen.getByText("48.5 dtk")).toBeDefined(); // p95 duration
    expect(screen.getAllByText("45").length).toBeGreaterThan(0); // queue backlog / failed executions
    expect(screen.getByText("pending queue")).toBeDefined();
    expect(screen.getByText("Terkoneksi")).toBeDefined(); // Redis status
    expect(screen.getAllByText(/healthy/i).length).toBeGreaterThan(0); // worker status
    expect(screen.getByText("7 tasks berjalan")).toBeDefined(); // active memory tasks (4+2+1)
  });

  it("renders status breakdown, telemetry, and automation types", () => {
    useAuthStore.setState({
      user: {
        id: "owner-1",
        email: "owner@telebos.id",
        role: "owner",
      } as any,
    });

    render(<AdminAutomationAnalyticsPage />);

    // Status breakdown
    expect(screen.getByText(/Selesai \(Completed\)/i)).toBeDefined();
    expect(screen.getByText(/Sedang Berjalan \(Running\)/i)).toBeDefined();
    expect(screen.getByText(/Tertunda \/ Antre \(Pending\)/i)).toBeDefined();

    // Modules
    expect(screen.getByText("Broadcast Pesan")).toBeDefined();
    expect(screen.getByText("Invite Member Grup")).toBeDefined();
    expect(screen.getByText("Auto Join Kanal/Grup")).toBeDefined();
    expect(screen.getByText("Auto Reply AI / Bot")).toBeDefined();

    // Error breakdown
    expect(screen.getByText(/FloodWait \/ Rate Limit/i)).toBeDefined();
    expect(screen.getByText(/Privasi Telegram/i)).toBeDefined();
    expect(screen.getByText(/A wait of 42 seconds is required/i)).toBeDefined();
  });

  it("renders execution history table and opens task details modal with safe error summary", () => {
    useAuthStore.setState({
      user: {
        id: "owner-1",
        email: "owner@telebos.id",
        role: "owner",
      } as any,
    });

    render(<AdminAutomationAnalyticsPage />);

    // Check directory items
    expect(screen.getByText("broadcast_admin@telebos.id")).toBeDefined();
    expect(screen.getByText("inviter@telebos.id")).toBeDefined();

    // Click on detail button for the failed task
    const detailButtons = screen.getAllByRole("button", { name: /detail/i });
    expect(detailButtons.length).toBe(2);

    fireEvent.click(detailButtons[1]); // Click second task (invite failed)

    // Modal should open
    expect(screen.getByText("Detail Tugas Automasi")).toBeDefined();
    expect(screen.getByText("Task ID: job-inv-87654321")).toBeDefined();
    expect(screen.getByText("A wait of 300 seconds is required (FloodWaitError)")).toBeDefined();

    // Close modal
    const closeBtn = screen.getByRole("button", { name: /tutup/i });
    fireEvent.click(closeBtn);
  });

  it("handles date filter switches and refresh all action", () => {
    useAuthStore.setState({
      user: {
        id: "owner-1",
        email: "owner@telebos.id",
        role: "owner",
      } as any,
    });

    render(<AdminAutomationAnalyticsPage />);

    // Switch range
    const btn24h = screen.getByRole("button", { name: "24 Jam" });
    fireEvent.click(btn24h);

    // Click refresh
    const refreshBtn = screen.getByRole("button", { name: /refresh/i });
    fireEvent.click(refreshBtn);

    expect(mockRefetchAnalytics).toHaveBeenCalled();
    expect(mockRefetchTimeseries).toHaveBeenCalled();
    expect(mockRefetchDirectory).toHaveBeenCalled();
  });
});
