import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AccountOtpModal } from "./account-otp-modal";
import { type Account } from "@/hooks/use-accounts";

const mockAccount = {
  id: "acc-123",
  phone: "+628123456789",
  telegram_id: 98765432,
  first_name: "John",
  last_name: "Doe",
  username: "johndoe",
  is_active: true,
  phone_verified: true,
  twofa_enabled: false,
  is_premium: false,
  is_resale: false,
  for_sale: false,
  folder_ids: [],
  created_at: "2026-01-01T00:00:00Z",
} as unknown as Account;

const mockRefetch = vi.fn();

vi.mock("@/hooks/use-account-otp", () => ({
  useAccountOTP: vi.fn(() => ({
    data: {
      account_id: "acc-123",
      phone: "+628123456789",
      telegram_id: 98765432,
      otp_code: "58291",
      otp_message: "Login code: 58291",
      otp_date: new Date().toISOString(),
      is_recent: true,
      messages: [
        {
          id: 1,
          date: new Date().toISOString(),
          text: "Login code: 58291",
          otp_code: "58291",
        },
      ],
    },
    isLoading: false,
    isError: false,
    error: null,
    refetch: mockRefetch,
    isFetching: false,
  })),
}));

vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

describe("AccountOtpModal", () => {
  it("renders OTP modal with code and phone when open", () => {
    render(<AccountOtpModal account={mockAccount} open={true} onOpenChange={vi.fn()} />);

    expect(screen.getByText("58291")).toBeInTheDocument();
    expect(screen.getByText("+628123456789")).toBeInTheDocument();
    expect(screen.getByText("ID: 777000")).toBeInTheDocument();
  });

  it("calls refetch when refresh button is clicked", () => {
    render(<AccountOtpModal account={mockAccount} open={true} onOpenChange={vi.fn()} />);

    const refreshBtn = screen.getByRole("button", { name: /muat ulang|refresh/i });
    fireEvent.click(refreshBtn);

    expect(mockRefetch).toHaveBeenCalled();
  });
});
