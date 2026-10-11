import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18nStore } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import AdminSystemHealthAnalyticsPage from "./page";
import type { SystemHealthAnalyticsData } from "@/hooks/use-admin-analytics";

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock hooks
const mockRefetchHealth = vi.fn();

const mockSystemHealthData: SystemHealthAnalyticsData = {
  overall_status: "healthy",
  measured_at: "2026-10-12T03:30:00Z",
  resources: {
    cpu_percent: 24.5,
    process_cpu_percent: 1.8,
    cpu_cores: 8,
    memory_total_bytes: 16 * 1024 * 1024 * 1024,
    memory_used_bytes: 8 * 1024 * 1024 * 1024,
    memory_available_bytes: 8 * 1024 * 1024 * 1024,
    memory_percent: 50.0,
    process_memory_rss_bytes: 256 * 1024 * 1024,
    disk_total_bytes: 512 * 1024 * 1024 * 1024,
    disk_used_bytes: 215 * 1024 * 1024 * 1024,
    disk_free_bytes: 297 * 1024 * 1024 * 1024,
    disk_percent: 42.1,
    network_bytes_sent: 1024 * 1024 * 50,
    network_bytes_recv: 1024 * 1024 * 120,
  },
  api_traffic: {
    total_requests: 12500,
    requests_per_minute: 142.5,
    latency_p50_ms: 18.2,
    latency_p95_ms: 64.8,
    latency_p99_ms: 185.0,
    latency_avg_ms: 22.4,
    status_2xx_count: 12300,
    status_3xx_count: 0,
    status_4xx_count: 45,
    status_5xx_count: 5,
    error_4xx_rate: 0.36,
    error_5xx_rate: 0.04,
    status_code_breakdown: {
      "200": 11500,
      "201": 800,
      "400": 20,
      "500": 5,
    },
    top_failing_routes: [
      {
        route: "/api/automation/broadcast/launch",
        requests: 25,
        errors: 5,
        error_rate: 20.0,
        avg_duration_ms: 540.2,
      },
      {
        route: "/api/telegram-accounts/unknown-account",
        requests: 15,
        errors: 12,
        error_rate: 80.0,
        avg_duration_ms: 45.1,
      },
    ],
  },
  database: {
    is_connected: true,
    pool_size: 10,
    checked_out_connections: 2,
    checked_in_connections: 8,
    overflow_connections: 0,
    max_overflow: 10,
    pool_utilization_percent: 20.0,
    query_ping_latency_ms: 2.4,
    database_dialect: "postgresql",
    slow_queries_count: 1,
    slow_queries: [
      {
        query: "SELECT count(*) FROM audit_logs WHERE created_at > ...",
        duration_ms: 510.5,
        timestamp: "2026-10-12T03:20:00Z",
      },
    ],
  },
  queue_workers: {
    is_redis_connected: true,
    redis_ping_latency_ms: 1.1,
    redis_used_memory_human: "48.2 MB",
    queue_backlog_total: 14,
    queue_backlog_by_name: {
      "telebos:queue:broadcast": 10,
      "telebos:queue:invite": 3,
      "telebos:queue:autojoin": 1,
    },
    active_worker_consumers: 1,
    worker_health_status: "healthy",
    worker_failures_count: 0,
  },
  realtime: {
    active_websocket_connections: 18,
    active_channels_count: 6,
    redis_pubsub_bridge_status: "healthy",
  },
  uptime_incidents: {
    process_started_at: "2026-10-11T03:30:00Z",
    uptime_seconds: 86400,
    uptime_human: "1 hari, 0 jam, 0 mnt",
    system_status: "healthy",
    recent_incidents: [
      {
        id: "inc-1",
        timestamp: "2026-10-12T02:15:00Z",
        severity: "warning",
        subsystem: "api",
        summary: "5x HTTP 500 terdeteksi pada POST /api/automation/broadcast/launch",
        status_code: 500,
        route: "/api/automation/broadcast/launch",
      },
    ],
    measurement_limitations_note:
      "Metrik telemetri dikumpulkan secara langsung (real-time) sejak proses backend TeleBos dimulai. Uptime jangka panjang / SLA historis sebelum deployment aktif saat ini memerlukan persistent time-series monitoring eksternal.",
  },
  timeseries: [
    {
      timestamp: "03:00",
      request_volume: 120,
      latency_p95_ms: 55.0,
      error_count: 1,
      cpu_percent: 22.0,
      memory_percent: 48.0,
    },
    {
      timestamp: "03:15",
      request_volume: 145,
      latency_p95_ms: 68.0,
      error_count: 2,
      cpu_percent: 26.5,
      memory_percent: 50.0,
    },
  ],
};

let mockHealthLoading = false;
let mockHealthFetching = false;
let mockHealthError: any = null;
let mockHealthDataState: SystemHealthAnalyticsData | null = mockSystemHealthData;

vi.mock("@/hooks/use-admin-analytics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/use-admin-analytics")>();
  return {
    ...actual,
    useAdminSystemHealthAnalytics: () => ({
      data: mockHealthDataState,
      isLoading: mockHealthLoading,
      isFetching: mockHealthFetching,
      error: mockHealthError,
      refetch: mockRefetchHealth,
    }),
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  useI18nStore.setState({ locale: "id" });
  mockHealthLoading = false;
  mockHealthFetching = false;
  mockHealthError = null;
  mockHealthDataState = mockSystemHealthData;
});

describe("AdminSystemHealthAnalyticsPage", () => {
  it("blocks non-owner users with access denied message", () => {
    useAuthStore.setState({
      user: {
        id: "u-admin",
        email: "admin@telebos.id",
        role: "admin",
        full_name: "Admin User",
      } as any,
    });

    render(<AdminSystemHealthAnalyticsPage />);

    expect(screen.getByText("Akses Ditolak")).toBeDefined();
    expect(
      screen.getByText(/Hanya akun dengan peran Owner yang memiliki akses ke Panel Admin/i)
    ).toBeDefined();
    expect(screen.queryByText("System Health Analytics")).toBeNull();
  });

  it("renders system health telemetry KPIs and status for owner", () => {
    useAuthStore.setState({
      user: {
        id: "owner-1",
        email: "owner@telebos.id",
        role: "owner",
        full_name: "Owner TeleBos",
      } as any,
    });

    render(<AdminSystemHealthAnalyticsPage />);

    // Header & Badge
    expect(screen.getByText("System Health Analytics")).toBeDefined();
    expect(screen.getByText("Live System Telemetry")).toBeDefined();
    expect(screen.getByText(/Status: healthy/i)).toBeDefined();

    // Primary KPI Cards
    expect(screen.getByText("1 hari, 0 jam, 0 mnt")).toBeDefined();
    expect(screen.getByText("12.500")).toBeDefined(); // Formatted request volume
    expect(screen.getByText("64.8 ms")).toBeDefined(); // p95 latency
    expect(screen.getByText("0.04% (5xx)")).toBeDefined(); // 5xx rate
    expect(screen.getByText("24.5% CPU")).toBeDefined(); // CPU usage
    expect(screen.getAllByText("Terhubung").length).toBeGreaterThanOrEqual(1); // DB & Redis status

    // Subsystem Cards
    expect(screen.getByText("Utilisasi Server & Sumber Daya Host")).toBeDefined();
    expect(screen.getByText("Koneksi Database & Latensi Kueri")).toBeDefined();
    expect(screen.getByText("Antrean Tugas Redis & Kesehatan Worker")).toBeDefined();
    expect(screen.getByText("Koneksi Realtime & WebSocket Bridge")).toBeDefined();
  });

  it("renders transparency note regarding historical uptime limitations", () => {
    useAuthStore.setState({
      user: {
        id: "owner-1",
        email: "owner@telebos.id",
        role: "owner",
        full_name: "Owner TeleBos",
      } as any,
    });

    render(<AdminSystemHealthAnalyticsPage />);

    expect(screen.getByText("Transparansi Instrumentasi Telemetri & Batasan Pengukuran")).toBeDefined();
    expect(
      screen.getByText(/Metrik telemetri dikumpulkan secara langsung \(real-time\) sejak proses backend TeleBos dimulai/i)
    ).toBeDefined();
  });

  it("renders HTTP status breakdown and failing routes correctly", () => {
    useAuthStore.setState({
      user: {
        id: "owner-1",
        email: "owner@telebos.id",
        role: "owner",
        full_name: "Owner TeleBos",
      } as any,
    });

    render(<AdminSystemHealthAnalyticsPage />);

    expect(
      screen.getByText("Distribusi Status HTTP & Titik Akhir (Endpoints) Bermasalah")
    ).toBeDefined();
    expect(screen.getByText("Distribusi Status Kode HTTP")).toBeDefined();
    expect(screen.getByText("Titik Akhir dengan Error Tertinggi")).toBeDefined();
    expect(screen.getByText("/api/automation/broadcast/launch")).toBeDefined();
    expect(screen.getByText("/api/telegram-accounts/unknown-account")).toBeDefined();
  });

  it("renders incidents history table", () => {
    useAuthStore.setState({
      user: {
        id: "owner-1",
        email: "owner@telebos.id",
        role: "owner",
        full_name: "Owner TeleBos",
      } as any,
    });

    render(<AdminSystemHealthAnalyticsPage />);

    expect(
      screen.getByText("Riwayat Insiden & Audit Degradasi Operasional")
    ).toBeDefined();
    expect(
      screen.getByText("5x HTTP 500 terdeteksi pada POST /api/automation/broadcast/launch")
    ).toBeDefined();
  });

  it("supports manual refresh button", async () => {
    useAuthStore.setState({
      user: {
        id: "owner-1",
        email: "owner@telebos.id",
        role: "owner",
        full_name: "Owner TeleBos",
      } as any,
    });

    render(<AdminSystemHealthAnalyticsPage />);

    const refreshBtn = screen.getByRole("button", { name: /Refresh/i });
    fireEvent.click(refreshBtn);

    expect(mockRefetchHealth).toHaveBeenCalledTimes(1);
  });

  it("supports auto-refresh interval switching", () => {
    useAuthStore.setState({
      user: {
        id: "owner-1",
        email: "owner@telebos.id",
        role: "owner",
        full_name: "Owner TeleBos",
      } as any,
    });

    render(<AdminSystemHealthAnalyticsPage />);

    const offButton = screen.getByRole("button", { name: "Mati" });
    fireEvent.click(offButton);

    const fiveSecButton = screen.getByRole("button", { name: "5 dtk" });
    fireEvent.click(fiveSecButton);

    expect(fiveSecButton).toBeDefined();
  });

  it("handles loading state cleanly", () => {
    useAuthStore.setState({
      user: {
        id: "owner-1",
        email: "owner@telebos.id",
        role: "owner",
        full_name: "Owner TeleBos",
      } as any,
    });
    mockHealthLoading = true;
    mockHealthDataState = null;

    render(<AdminSystemHealthAnalyticsPage />);

    expect(screen.getByText("System Health Analytics")).toBeDefined();
  });
});
