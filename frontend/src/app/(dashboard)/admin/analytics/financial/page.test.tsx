import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18nStore } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import AdminFinancialAnalyticsPage from "./page";

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
const mockRefetchTable = vi.fn();

let mockFinancialAnalyticsData: any = {
  period_start: "2026-10-05T00:00:00Z",
  period_end: "2026-10-12T00:00:00Z",
  revenue: {
    gross_revenue: 5500000,
    net_revenue: 3800000,
    subscription_revenue: 2000000,
    gross_smm_revenue: 2500000,
    estimated_smm_provider_cost: 1200000,
    net_smm_margin: 1300000,
    marketplace_gmv: 1000000,
    marketplace_seller_payout: 500000,
    marketplace_spread_margin: 500000,
    refunded_volume: 50000,
    refund_count: 2,
    refund_rate_percentage: 1.2,
    direct_provider_costs: 1700000,
    estimated_taxes: 0,
  },
  subscriptions: {
    active_paid_subscriptions: 35,
    new_subscriptions_in_period: 8,
    renewals_in_period: 12,
    expirations_in_period: 3,
    upgrades_in_period: 2,
    downgrades_in_period: 1,
    cancellations_in_period: 2,
    revenue_by_plan: { pro: 1500000, premium: 500000 },
    active_users_by_plan: { pro: 25, premium: 10 },
    mrr: 2250000,
    arr: 27000000,
    arpu: 64285.7,
    churn_rate_percentage: 5.4,
    methodology_notes: "MRR estimated on active pro (50k) and premium (100k) plans.",
  },
  payments: {
    total_payment_transactions: 120,
    successful_payments: 114,
    pending_payments: 4,
    failed_payments: 2,
    payment_success_rate: 95.0,
    payment_failure_rate: 5.0,
    methods_breakdown: { QRIS: 85, WALLET: 25, VOUCHER: 10 },
    chargebacks_count: 0,
    chargebacks_volume: 0,
  },
  balance: {
    current_user_balance_liability: 8450000,
    topup_approved_volume: 6200000,
    withdraw_approved_volume: 500000,
    balance_consumed_burned: 4200000,
    total_ledger_credits_period: 6250000,
    total_ledger_debits_period: 4700000,
    net_cashflow: 5700000,
  },
  reconciliation: {
    is_reconciled: true,
    users_total_balance: 8450000,
    computed_ledger_balance: 8450000,
    discrepancy: 0,
    unreconciled_users_count: 0,
    total_users_checked: 48,
    reconciliation_status: "matched",
    reconciliation_timestamp: "2026-10-12T03:30:00Z",
  },
  gross_smm_revenue: 2500000,
  estimated_smm_provider_cost: 1200000,
  net_smm_margin: 1300000,
  marketplace_gmv: 1000000,
  marketplace_spread_margin: 500000,
  net_platform_profit: 3800000,
  topup_approved_volume: 6200000,
  withdraw_approved_volume: 500000,
  smm_orders_total_count: 45,
  smm_orders_refunded_count: 2,
  smm_orders_refunded_amount: 50000,
  refund_rate_percentage: 1.2,
  current_user_balance_liability: 8450000,
};

let mockTableData: any = {
  transactions: [
    {
      transaction_id: "WTX-20261012-TOPUP-01",
      user_id: "u-101",
      user_email: "buyer@telebos.id",
      source_type: "wallet_tx",
      category_or_type: "topup",
      amount: 250000,
      entry_type: "CREDIT",
      status: "approved",
      payment_method: "QRIS",
      reference_id: "QRIS-MID-9921",
      description: "Top-up saldo otomatis via QRIS",
      created_at: "2026-10-12T02:15:00Z",
      processed_at: "2026-10-12T02:16:30Z",
    },
    {
      transaction_id: "WTX-20261012-SUB-02",
      user_id: "u-102",
      user_email: "subscriber@telebos.id",
      source_type: "wallet_tx",
      category_or_type: "subscription",
      amount: 100000,
      entry_type: "PAYMENT",
      status: "approved",
      payment_method: "WALLET",
      reference_id: null,
      description: "Pembelian paket langganan Premium 30 hari",
      created_at: "2026-10-12T02:45:00Z",
      processed_at: "2026-10-12T02:45:05Z",
    },
  ],
  total: 2,
  page: 1,
  page_size: 15,
  total_pages: 1,
};

let mockAnalyticsLoading = false;
let mockTableLoading = false;

vi.mock("@/hooks/use-admin-analytics", () => ({
  useAdminFinancialAnalytics: () => ({
    data: mockFinancialAnalyticsData,
    isLoading: mockAnalyticsLoading,
    isFetching: false,
    error: null,
    refetch: mockRefetchAnalytics,
  }),
  useAdminAnalyticsTimeseries: () => ({
    data: {
      points: [
        { date: "2026-10-06", value: 500000 },
        { date: "2026-10-07", value: 800000 },
        { date: "2026-10-08", value: 650000 },
      ],
    },
    isLoading: false,
    refetch: mockRefetchTimeseries,
  }),
  useAdminFinancialTransactionsDirectory: () => ({
    data: mockTableData,
    isLoading: mockTableLoading,
    isFetching: false,
    error: null,
    refetch: mockRefetchTable,
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  useI18nStore.setState({ locale: "id" });
  mockAnalyticsLoading = false;
  mockTableLoading = false;
});

describe("AdminFinancialAnalyticsPage", () => {
  it("blocks non-owner users with access denied", () => {
    useAuthStore.setState({
      user: {
        id: "u-regular",
        email: "regular@example.com",
        role: "user",
        full_name: "Regular User",
      } as any,
    });

    render(<AdminFinancialAnalyticsPage />);

    expect(screen.getByText("Akses Ditolak")).toBeDefined();
    expect(screen.getByText(/Hanya akun dengan peran Owner/i)).toBeDefined();
    expect(screen.queryByText("Revenue & Balance Analytics")).toBeNull();
  });

  it("renders financial analytics KPIs and accounting invariants for owner", () => {
    useAuthStore.setState({
      user: {
        id: "owner-1",
        email: "owner@telebos.id",
        role: "owner",
        full_name: "Owner",
      } as any,
    });

    render(<AdminFinancialAnalyticsPage />);

    // Header & Badges
    expect(screen.getAllByText("Revenue & Balance Analytics").length).toBeGreaterThan(0);
    expect(screen.getByText("Verified Financial Ledger")).toBeDefined();
    expect(screen.getByText("Audited Platform Margins")).toBeDefined();

    // Accounting Invariants Banner
    expect(screen.getByText(/Prinsip Akuntansi Finansial TeleBos: Isolasi Liabilitas & Rekonsiliasi Double-Entry/i)).toBeDefined();
    expect(screen.getByText(/Top-Up Saldo adalah Liabilitas Pengguna/i)).toBeDefined();

    // Top KPI cards
    expect(screen.getAllByText("Gross Revenue").length).toBeGreaterThan(0);
    expect(screen.getByText("MRR / ARR")).toBeDefined();
    expect(screen.getByText("Saldo User Tersimpan")).toBeDefined();
    expect(screen.getByText("Top-Up Disetujui")).toBeDefined();
    expect(screen.getByText("Payment Success Rate")).toBeDefined();
    expect(screen.getByText("Audit Rekonsiliasi")).toBeDefined();
    expect(screen.getByText("Cocok (100%)")).toBeDefined();
  });

  it("renders 4 operational breakdown cards accurately", () => {
    useAuthStore.setState({
      user: {
        id: "owner-1",
        email: "owner@telebos.id",
        role: "owner",
        full_name: "Owner",
      } as any,
    });

    render(<AdminFinancialAnalyticsPage />);

    // Card 1: Revenue Streams & Cost Structure
    expect(screen.getByText("Aliran Pendapatan & Struktur Beban Pokok")).toBeDefined();
    expect(screen.getByText("Paket Langganan")).toBeDefined();
    expect(screen.getByText("GMV Pesanan SMM")).toBeDefined();
    expect(screen.getByText("GMV Marketplace Akun")).toBeDefined();

    // Card 2: Subscription Dynamics
    expect(screen.getByText("Dinamika Siklus Langganan (SaaS Metrics)")).toBeDefined();
    expect(screen.getByText("Distribusi Revenue per Plan")).toBeDefined();
    expect(screen.getByText("Paket Pro")).toBeDefined();
    expect(screen.getByText("Paket Premium")).toBeDefined();

    // Card 3: Payment Diagnostics
    expect(screen.getByText("Keandalan Pembayaran & Gateway Gateway")).toBeDefined();
    expect(screen.getByText("Distribusi Metode Pembayaran")).toBeDefined();

    // Card 4: Ledger Mathematical Reconciliation
    expect(screen.getAllByText("Rekonsiliasi Matematis Buku Besar").length).toBeGreaterThan(0);
    expect(screen.getByText("1. Total Saldo Agregat Tabel Pengguna:")).toBeDefined();
    expect(screen.getByText("2. Komputasi Jurnal (Total Kredit − Total Debit):")).toBeDefined();
    expect(screen.getByText("Discrepancy / Selisih Matematis:")).toBeDefined();
  });

  it("renders transaction directory table and opens detail modal", () => {
    useAuthStore.setState({
      user: {
        id: "owner-1",
        email: "owner@telebos.id",
        role: "owner",
        full_name: "Owner",
      } as any,
    });

    render(<AdminFinancialAnalyticsPage />);

    // Table elements
    expect(screen.getByText("Direktori Transaksi & Jurnal Finansial")).toBeDefined();
    expect(screen.getByText("buyer@telebos.id")).toBeDefined();
    expect(screen.getByText("subscriber@telebos.id")).toBeDefined();

    // Click "Detail" button
    const detailButtons = screen.getAllByText("Detail");
    expect(detailButtons.length).toBeGreaterThan(0);
    fireEvent.click(detailButtons[0]);

    // Modal opens
    expect(screen.getByText("Detail Audit Transaksi Finansial")).toBeDefined();
    expect(screen.getByText("WTX-20261012-TOPUP-01")).toBeDefined();
    expect(screen.getByText("Top-up saldo otomatis via QRIS")).toBeDefined();

    // Close button
    const closeBtn = screen.getByText("Tutup");
    fireEvent.click(closeBtn);
  });

  it("triggers refetch when Refresh button is clicked", async () => {
    useAuthStore.setState({
      user: {
        id: "owner-1",
        email: "owner@telebos.id",
        role: "owner",
        full_name: "Owner",
      } as any,
    });

    render(<AdminFinancialAnalyticsPage />);

    const refreshBtn = screen.getByRole("button", { name: /refresh/i });
    fireEvent.click(refreshBtn);

    expect(mockRefetchAnalytics).toHaveBeenCalled();
    expect(mockRefetchTimeseries).toHaveBeenCalled();
    expect(mockRefetchTable).toHaveBeenCalled();
  });

  it("renders discrepancy alert state when ledger imbalance is detected", () => {
    mockFinancialAnalyticsData = {
      ...mockFinancialAnalyticsData,
      reconciliation: {
        is_reconciled: false,
        users_total_balance: 8450000,
        computed_ledger_balance: 8300000,
        discrepancy: 150000,
        unreconciled_users_count: 1,
        total_users_checked: 48,
        reconciliation_status: "discrepancy_detected",
        reconciliation_timestamp: "2026-10-12T03:30:00Z",
      },
    };

    useAuthStore.setState({
      user: {
        id: "owner-1",
        email: "owner@telebos.id",
        role: "owner",
        full_name: "Owner",
      } as any,
    });

    render(<AdminFinancialAnalyticsPage />);

    expect(screen.getByText("Selisih Ditemukan")).toBeDefined();
    expect(screen.getByText("Selisih Terdeteksi")).toBeDefined();
  });
});
