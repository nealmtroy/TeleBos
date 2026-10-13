import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18nStore } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import OrderHistoryPage from "./page";
import { UnifiedOrder } from "./components/types";

// Mock next/navigation
const mockSearchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ push: vi.fn() }),
}));

// Mock clipboard
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn().mockImplementation(() => Promise.resolve()),
  },
});

const mockItems: UnifiedOrder[] = [
  {
    id: "ord-1",
    orderIdDisplay: "#TB-ORD12345",
    type: "smm",
    typeName: "SMM Order",
    serviceName: "Instagram Followers High Quality",
    serviceSublabel: "Instagram",
    detail: "@test_profile",
    quantityDisplay: "1,000 Pengikut",
    quantityRaw: 1000,
    priceDisplay: "Rp 25,000",
    priceRaw: 25000,
    status: "Selesai",
    statusRaw: "Success",
    dateRaw: new Date("2026-10-14T02:00:00Z"),
    dateStr: "14 Okt 2026",
    timeStr: "09:00 WIB",
    smmOrderId: "998811",
  },
  {
    id: "ord-2",
    orderIdDisplay: "#TB-ORD67890",
    type: "telegram_account",
    typeName: "Akun Telegram",
    serviceName: "Pembelian Akun",
    serviceSublabel: "Transaksi Akun",
    detail: "+6281234567890",
    quantityDisplay: "1 Akun",
    quantityRaw: 1,
    priceDisplay: "Rp 35,000",
    priceRaw: 35000,
    status: "Proses",
    statusRaw: "list_for_sale",
    dateRaw: new Date("2026-10-14T03:00:00Z"),
    dateStr: "14 Okt 2026",
    timeStr: "10:00 WIB",
    phone: "+6281234567890",
    telegramId: 12345678,
  },
];

let mockHookReturn: any = {
  data: {
    items: mockItems,
    metrics: {
      totalOrders: 2,
      totalAccounts: 1,
      totalSmm: 1,
      totalDeposits: 0,
      totalWithdrawals: 0,
      totalBalanceAdj: 0,
      totalSpend: 60000,
      inProgressCount: 1,
      completedCount: 1,
      successRate: "50.0",
    },
    pagination: {
      page: 1,
      pageSize: 10,
      totalItems: 2,
      totalPages: 1,
    },
  },
  isLoading: false,
  isError: false,
};

vi.mock("@/hooks/use-activity-history", () => ({
  useActivityHistory: () => mockHookReturn,
}));

describe("OrderHistoryPage Component Decomposition (TASK-31)", () => {
  beforeEach(() => {
    mockHookReturn = {
      data: {
        items: mockItems,
        metrics: {
          totalOrders: 2,
          totalAccounts: 1,
          totalSmm: 1,
          totalDeposits: 0,
          totalWithdrawals: 0,
          totalBalanceAdj: 0,
          totalSpend: 60000,
          inProgressCount: 1,
          completedCount: 1,
          successRate: "50.0",
        },
        pagination: {
          page: 1,
          pageSize: 10,
          totalItems: 2,
          totalPages: 1,
        },
      },
      isLoading: false,
      isError: false,
    };
    useI18nStore.setState({ locale: "id" });
    useAuthStore.setState({
      user: {
        id: "usr-1",
        name: "Test User",
        email: "test@example.com",
        role: "basic",
        balance: 150000,
      } as any,
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders page header, wallet balance chip, and executive KPI bento deck", () => {
    render(<OrderHistoryPage />);

    expect(screen.getByText("Riwayat Pesanan")).toBeDefined();
    expect(screen.getByText("2 Total Entri")).toBeDefined();
    expect(screen.getByText(/150/)).toBeDefined();

    // KPI Deck metrics
    expect(screen.getByText("Total Pesanan")).toBeDefined();
    expect(screen.getByText("1 SMM • 1 Akun")).toBeDefined();
    expect(screen.getByText("Sedang Diproses")).toBeDefined();
    expect(screen.getByText("Tingkat Selesai")).toBeDefined();
    expect(screen.getByText("50.0%")).toBeDefined();
  });

  it("renders navigation ribbon tabs and search command bar", () => {
    render(<OrderHistoryPage />);

    expect(screen.getByText("Semua Order")).toBeDefined();
    expect(screen.getAllByText("Layanan SMM").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Akun TG").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByPlaceholderText("Cari ID Order / Layanan / Target...")).toBeDefined();
  });

  it("renders desktop and mobile orders representations with items", () => {
    render(<OrderHistoryPage />);

    const idElements = screen.getAllByText("#TB-ORD12345");
    expect(idElements.length).toBeGreaterThanOrEqual(1);

    const serviceElements = screen.getAllByText("Instagram Followers High Quality");
    expect(serviceElements.length).toBeGreaterThanOrEqual(1);

    const accountDetail = screen.getAllByText("+6281234567890");
    expect(accountDetail.length).toBeGreaterThanOrEqual(1);
  });

  it("opens order detail dialog when clicking Detail button and closes on Tutup", () => {
    render(<OrderHistoryPage />);

    const detailButtons = screen.getAllByText("Detail");
    expect(detailButtons.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(detailButtons[0]);

    // Modal dialog content
    expect(screen.getByText("Detail Spesifikasi Pesanan")).toBeDefined();
    expect(screen.getByText("Salin Ringkasan")).toBeDefined();

    const closeBtn = screen.getByText("Tutup");
    fireEvent.click(closeBtn);
  });

  it("renders empty state when there are no items returned", () => {
    mockHookReturn = {
      data: {
        items: [],
        metrics: {
          totalOrders: 0,
          totalAccounts: 0,
          totalSmm: 0,
          totalDeposits: 0,
          totalWithdrawals: 0,
          totalBalanceAdj: 0,
          totalSpend: 0,
          inProgressCount: 0,
          completedCount: 0,
          successRate: "100.0",
        },
        pagination: {
          page: 1,
          pageSize: 10,
          totalItems: 0,
          totalPages: 1,
        },
      },
      isLoading: false,
      isError: false,
    };

    render(<OrderHistoryPage />);

    expect(screen.getByText("Belum ada riwayat pesanan")).toBeDefined();
    expect(screen.getByText("Beli Akun")).toBeDefined();
    expect(screen.getAllByText("Layanan SMM").length).toBeGreaterThanOrEqual(1);
  });
});
