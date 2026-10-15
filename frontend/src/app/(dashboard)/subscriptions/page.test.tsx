import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { useAuthStore } from "@/store/auth-store";
import { useI18nStore } from "@/lib/i18n";
import SubscriptionPage from "./page";

afterEach(cleanup);

const { mockPush } = vi.hoisted(() => ({
  mockPush: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/subscriptions",
  useSearchParams: () => new URLSearchParams(),
}));

const mockSubscription = {
  plan: "pro",
  expires_at: new Date(Date.now() + 15 * 86400 * 1000).toISOString(),
  is_active: true,
  days_remaining: 15,
  seconds_remaining: 15 * 86400,
};

const mockAccountsSummary = {
  total: 3,
  active: 3,
  expired: 0,
  selling: 0,
  limited: 0,
};

const mockTransactions = [
  {
    id: "WTX-20261015-PRO01",
    user_id: "user-uuid-1",
    type: "subscription",
    amount: 10000,
    method: "balance",
    note: JSON.stringify({ plan_id: "pro", billing_cycle: "monthly", duration_days: 30 }),
    status: "approved",
    created_at: new Date().toISOString(),
  },
  {
    id: "WTX-20261015-PENDING02",
    user_id: "user-uuid-1",
    type: "subscription",
    amount: 20000,
    method: "QRIS",
    note: JSON.stringify({ plan_id: "premium", billing_cycle: "monthly", duration_days: 30 }),
    status: "pending",
    created_at: new Date().toISOString(),
  },
];

vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(async (url: string) => {
      if (url.includes("/subscriptions/me")) {
        return { data: mockSubscription };
      }
      if (url.includes("/accounts/summary")) {
        return { data: mockAccountsSummary };
      }
      if (url.includes("/wallet/transactions")) {
        return {
          data: {
            transactions: mockTransactions,
            total: mockTransactions.length,
          },
        };
      }
      return { data: {} };
    }),
    post: vi.fn(async (url: string, payload: any) => {
      if (url.includes("/subscriptions/checkout")) {
        return {
          data: {
            success: true,
            message: "Langganan berhasil diaktifkan",
            invoice_id: "WTX-NEW-INVOICE",
            payment_method: payload.payment_method,
          },
        };
      }
      if (url.includes("/redeem")) {
        return {
          data: {
            success: true,
            code_type: "subscription",
            granted_role: "premium",
          },
        };
      }
      return { data: {} };
    }),
  },
}));

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("Subscription Dashboard Page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useI18nStore.setState({ locale: "id" });
    useAuthStore.setState({
      user: {
        id: "user-uuid-1",
        email: "test@telebos.com",
        full_name: "Test User",
        role: "pro",
        balance: 500000,
        is_active: true,
        subscription_expires_at: mockSubscription.expires_at,
      } as any,
    });
  });

  it("renders page header and current subscription status", async () => {
    renderWithClient(<SubscriptionPage />);

    expect(screen.getByText("Manajemen Langganan")).toBeDefined();
    await waitFor(() => {
      expect(screen.getAllByText(/PRO/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Langganan Aktif/i).length).toBeGreaterThan(0);
      expect(screen.getByText(/15 hari tersisa/i)).toBeDefined();
    });
  });

  it("displays account capacity telemetry from accountsSummary", async () => {
    renderWithClient(<SubscriptionPage />);

    await waitFor(() => {
      expect(screen.getByText("Batas Penggunaan Akun")).toBeDefined();
      expect(screen.getByText("3")).toBeDefined();
      expect(screen.getByText(/dari 10 akun/i)).toBeDefined();
    });
  });

  it("displays alert for pending QRIS subscription invoice", async () => {
    renderWithClient(<SubscriptionPage />);

    await waitFor(() => {
      expect(screen.getByText("Tagihan QRIS Menunggu Pembayaran")).toBeDefined();
      expect(screen.getAllByText(/WTX-20261015-PENDING02/i).length).toBeGreaterThan(0);
      expect(screen.getByText("Bayar QRIS Sekarang")).toBeDefined();
    });
  });

  it("renders 4 tier plans and allows toggling billing cycle", async () => {
    renderWithClient(<SubscriptionPage />);

    await waitFor(() => {
      expect(screen.getAllByText("Free Trial").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Starter").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Business").length).toBeGreaterThan(0);
    });

    const monthlyBtn = screen.getByRole("radio", { name: /bulanan/i });
    fireEvent.click(monthlyBtn);

    // Business monthly price should show Rp 20.000
    await waitFor(() => {
      expect(screen.getAllByText("Rp 20.000").length).toBeGreaterThan(0);
    });
  });

  it("opens payment method modal when choosing an upgrade tier with sufficient balance", async () => {
    renderWithClient(<SubscriptionPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /pilih business/i })).toBeDefined();
    });

    const chooseBusinessBtn = screen.getByRole("button", { name: /pilih business/i });
    fireEvent.click(chooseBusinessBtn);

    await waitFor(() => {
      expect(screen.getByText("Pilih Metode Pembayaran")).toBeDefined();
      expect(screen.getByText("Bayar dengan Saldo Dompet")).toBeDefined();
      expect(screen.getByText("Bayar via QRIS Otomatis")).toBeDefined();
    });
  });

  it("renders transaction history table with recent subscription records", async () => {
    renderWithClient(<SubscriptionPage />);

    await waitFor(() => {
      expect(screen.getByText("Riwayat Transaksi Langganan")).toBeDefined();
      expect(screen.getByText("WTX-20261015-PRO01")).toBeDefined();
      expect(screen.getAllByText("WTX-20261015-PENDING02").length).toBeGreaterThan(0);
    });
  });

  it("opens voucher redeem dialog and handles submit", async () => {
    renderWithClient(<SubscriptionPage />);

    const openVoucherBtn = screen.getByRole("button", { name: /tukar voucher/i });
    fireEvent.click(openVoucherBtn);

    await waitFor(() => {
      expect(screen.getByText("Tukarkan Kode Voucher")).toBeDefined();
    });

    const input = screen.getByPlaceholderText("TELEBOS-PRO-XXXX");
    fireEvent.change(input, { target: { value: "PRO-VOUCHER-TEST" } });

    const submitBtn = screen.getByRole("button", { name: /tukarkan sekarang/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.queryByText("Tukarkan Kode Voucher")).toBeNull();
    });
  });
});
