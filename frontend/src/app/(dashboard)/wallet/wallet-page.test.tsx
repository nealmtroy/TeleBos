import { render, fireEvent, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAuthStore } from "@/store/auth-store";
import { useI18nStore } from "@/lib/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import WalletPage from "./page";

const initialTransactions = [
  {
    id: "tx-pending",
    type: "topup",
    amount: 100_000,
    status: "pending",
    created_at: new Date().toISOString(),
  },
  {
    id: "tx-approved",
    type: "topup",
    amount: 250_000,
    status: "approved",
    created_at: new Date().toISOString(),
  },
  {
    id: "tx-rejected",
    type: "withdraw",
    amount: 50_000,
    status: "rejected",
    created_at: new Date().toISOString(),
  },
];

let mockTransactions = [...initialTransactions];

vi.mock("@/lib/api", () => {
  let txCounter = 1;
  return {
    default: {
      get: vi.fn(async (url: string) => {
        if (url.includes("/wallet/transactions")) {
          return {
            data: {
              transactions: mockTransactions,
              total: mockTransactions.length,
              pending_count: mockTransactions.filter((t) => t.status === "pending").length,
            },
          };
        }
        return { data: {} };
      }),
      post: vi.fn(async (url: string, payload: any) => {
        if (url === "/wallet/topup") {
          const newTx = {
            id: `tx-${++txCounter}`,
            type: "topup",
            amount: payload.amount,
            note: payload.note || "QRIS",
            created_at: new Date().toISOString(),
            qr_string: "00020101021226600016ID.CO.QRIS.WWW...",
            status: "pending",
          };
          mockTransactions.unshift(newTx);
          return { data: newTx };
        }
        return { data: { success: true } };
      }),
    },
  };
});

/** Render the wallet page with a known balance and scoped queries. */
function renderWallet(balance = 500_000) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  useAuthStore.setState({
    user: balance > 0 || balance === 0 ? {
      id: "u1",
      email: "user@example.com",
      full_name: "Tester",
      role: "basic",
      is_active: true,
      balance,
    } : null,
  });

  const { container } = render(
    <QueryClientProvider client={queryClient}>
      <WalletPage />
    </QueryClientProvider>
  );
  const scope = within(container);
  return {
    container,
    byRole: (name: RegExp | string) => scope.getByRole("button", { name }),
    byRoleAll: (name: RegExp) => scope.getAllByRole("button", { name }),
    byLabel: (text: string) => scope.getByLabelText(text),
    byText: (re: RegExp | string) => scope.getByText(re),
    queryByText: (re: RegExp | string) => scope.queryByText(re),
    amount: () => container.querySelector("#wallet-amount") as HTMLInputElement,
  };
}

/** The submit button in the form card (Create Payment or Submit Withdraw). */
function submitButton(container: HTMLElement): HTMLButtonElement {
  const button = within(container).getByRole("button", {
    name: /Submit Top Up Request|Submit Withdraw Request|Kirim Permintaan|Buat Pembayaran|Create Payment/,
  });
  return button as HTMLButtonElement;
}

beforeEach(() => {
  useI18nStore.setState({ locale: "en" });
  mockTransactions = JSON.parse(JSON.stringify(initialTransactions));
});

describe("WalletPage — balance display", () => {
  it("shows the current balance in Indonesian digit grouping", () => {
    const { byText } = renderWallet(1_400_000);
    expect(byText("Rp 1.400.000")).toBeInTheDocument();
  });

  it("falls back to zero when no user is loaded", () => {
    useAuthStore.setState({ user: null });
    const { byText } = renderWallet(-1);
    expect(byText("Rp 0")).toBeInTheDocument();
  });
});

describe("WalletPage — amount validation", () => {
  it("strips non-numeric characters from the amount field", () => {
    const { amount } = renderWallet();
    fireEvent.change(amount(), { target: { value: "12a3.4" } });
    expect(amount().value).toBe("1234");
  });

  it("keeps submit disabled until an amount is entered", () => {
    const { container } = renderWallet();
    expect(submitButton(container)).toBeDisabled();
  });

  it("rejects an amount below the 10.000 minimum", () => {
    const { container, amount } = renderWallet();
    fireEvent.change(amount(), { target: { value: "5000" } });

    expect(container.textContent).toContain("Minimum request is Rp 10.000");
    expect(submitButton(container)).toBeDisabled();
  });

  it("accepts an amount at exactly the minimum", () => {
    const { container, amount } = renderWallet();
    fireEvent.change(amount(), { target: { value: "10000" } });
    expect(submitButton(container)).toBeEnabled();
  });
});

describe("WalletPage — withdraw guardrails", () => {
  it("rejects a withdrawal above the available balance", () => {
    const { container, amount } = renderWallet(500_000);
    fireEvent.click(within(container).getByRole("tab", { name: /Withdraw/ }));
    fireEvent.change(amount(), { target: { value: "600000" } });

    expect(container.textContent).toContain("Amount exceeds your available balance");
    expect(submitButton(container)).toBeDisabled();
  });

  it("allows a withdrawal equal to the full balance", () => {
    const { container, amount } = renderWallet(500_000);
    fireEvent.click(within(container).getByRole("tab", { name: /Withdraw/ }));
    fireEvent.change(amount(), { target: { value: "500000" } });

    expect(submitButton(container)).toBeEnabled();
  });

  it("does not apply the balance guard to a top-up", () => {
    const { container, amount } = renderWallet(500_000);
    fireEvent.change(amount(), { target: { value: "900000" } });

    expect(container.textContent).not.toContain("Amount exceeds your available balance");
    expect(submitButton(container)).toBeEnabled();
  });
});

describe("WalletPage — top-up flow with QRIS", () => {
  it("fills the amount from a preset button", () => {
    const { amount, container } = renderWallet();
    fireEvent.click(within(container).getByRole("button", { name: "Rp 250.000" }));
    expect(amount().value).toBe("250000");
  });

  it("shows the deposit destination channels only for a top-up", () => {
    const { container } = renderWallet();
    expect(container.textContent).toContain("BCA");

    fireEvent.click(within(container).getByRole("tab", { name: /Withdraw/ }));
    expect(container.textContent).not.toContain("BCA");
  });

  it("generates a QRIS code and shows the download QR button after submitting", async () => {
    const { container, amount } = renderWallet();
    fireEvent.change(amount(), { target: { value: "100000" } });
    fireEvent.click(submitButton(container));

    await vi.waitFor(() => {
      // The QR code SVG is rendered
      expect(container.querySelector("#qris-qr-code")).toBeInTheDocument();
      // Download QR button is displayed
      expect(container.textContent).toContain("Download QR Code");
    });
  });

  it("adds a pending request to the history after submitting", async () => {
    const { container, amount } = renderWallet();
    fireEvent.change(amount(), { target: { value: "100000" } });
    fireEvent.click(submitButton(container));

    await vi.waitFor(() => {
      const pills = container.querySelectorAll("li span.rounded-full");
      expect([...pills].some((el) => el.textContent === "Pending")).toBe(true);
    });
  });

  it("allows returning to amount selection via Change Amount button", async () => {
    const { container, amount } = renderWallet();
    fireEvent.change(amount(), { target: { value: "75000" } });
    fireEvent.click(submitButton(container));

    await vi.waitFor(() => {
      expect(container.textContent).toContain("Download QR Code");
    });

    const changeBtn = within(container).getByRole("button", { name: /^Change Amount$/i });
    fireEvent.click(changeBtn);

    expect(container.querySelector("#wallet-amount")).toBeInTheDocument();
  });
});

describe("WalletPage — request history", () => {
  it("renders the seeded requests with their statuses", async () => {
    const { container } = renderWallet();
    await vi.waitFor(() => {
      expect(container.textContent).toContain("Approved");
      expect(container.textContent).toContain("Rejected");
    });
  });

  it("counts only pending requests in the header badge", async () => {
    const { container } = renderWallet();
    await vi.waitFor(() => {
      expect(container.textContent).toContain("1 pending");
    });
  });
});
