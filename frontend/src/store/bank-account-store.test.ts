import { beforeEach, describe, expect, it, vi } from "vitest";
import api from "@/lib/api";
import { useBankAccountStore } from "./bank-account-store";

describe("useBankAccountStore (SEC-03 remediation)", () => {
  beforeEach(() => {
    localStorage.clear();
    useBankAccountStore.setState({
      accounts: [],
      isHydrated: false,
    });
    vi.restoreAllMocks();
  });

  it("purges legacy bank account credentials from localStorage on hydrate", async () => {
    // Simulate preexisting sensitive data left by older client versions
    localStorage.setItem(
      "telebos_user_bank_accounts",
      JSON.stringify([{ id: "acc-1", accountNumber: "1234567890", accountHolder: "Victim" }])
    );
    localStorage.setItem(
      "telebos_bank_accounts",
      JSON.stringify([{ id: "acc-2", accountNumber: "9876543210", accountHolder: "Victim 2" }])
    );

    vi.spyOn(api, "get").mockResolvedValueOnce({
      data: [
        {
          id: "server-acc-1",
          type: "bank",
          provider: "BCA",
          account_number: "5551234567",
          account_number_last4: "4567",
          account_holder: "TeleBos User",
          is_default: true,
          created_at: "2026-10-13T10:00:00Z",
        },
      ],
    } as any);

    await useBankAccountStore.getState().hydrate();

    // Sensitive keys must be completely removed from localStorage
    expect(localStorage.getItem("telebos_user_bank_accounts")).toBeNull();
    expect(localStorage.getItem("telebos_bank_accounts")).toBeNull();

    // In-memory store should receive decrypted server accounts
    const accounts = useBankAccountStore.getState().accounts;
    expect(accounts).toHaveLength(1);
    expect(accounts[0].accountNumber).toBe("5551234567");
    expect(accounts[0].provider).toBe("BCA");
    expect(accounts[0].isDefault).toBe(true);
  });

  it("never writes bank accounts to localStorage when creating or deleting accounts", async () => {
    vi.spyOn(api, "post").mockResolvedValueOnce({
      data: {
        id: "server-acc-99",
        type: "bank",
        provider: "Mandiri",
        account_number: "1400019283311",
        account_number_last4: "3311",
        account_holder: "John Doe",
        is_default: true,
        created_at: "2026-10-13T10:00:00Z",
      },
    } as any);

    await useBankAccountStore.getState().addAccount({
      type: "bank",
      provider: "Mandiri",
      accountNumber: "1400019283311",
      accountHolder: "John Doe",
      isDefault: true,
    });

    // Verify localStorage has zero traces of sensitive bank details
    expect(localStorage.getItem("telebos_user_bank_accounts")).toBeNull();
    expect(localStorage.getItem("telebos_bank_accounts")).toBeNull();

    // Verify in-memory state updated
    expect(useBankAccountStore.getState().accounts).toHaveLength(1);
    expect(useBankAccountStore.getState().accounts[0].id).toBe("server-acc-99");

    vi.spyOn(api, "delete").mockResolvedValueOnce({ data: { status: "success" } } as any);
    await useBankAccountStore.getState().deleteAccount("server-acc-99");

    expect(useBankAccountStore.getState().accounts).toHaveLength(0);
    expect(localStorage.getItem("telebos_user_bank_accounts")).toBeNull();
  });

  it("manages default account selection strictly in memory without localStorage writes", async () => {
    useBankAccountStore.setState({
      accounts: [
        { id: "acc-1", type: "bank", provider: "BCA", accountNumber: "111", accountHolder: "A", isDefault: true, createdAt: "" },
        { id: "acc-2", type: "ewallet", provider: "GoPay", accountNumber: "222", accountHolder: "B", isDefault: false, createdAt: "" },
      ],
    });

    vi.spyOn(api, "put").mockResolvedValueOnce({ data: { status: "success" } } as any);
    await useBankAccountStore.getState().setDefaultAccount("acc-2");

    const accounts = useBankAccountStore.getState().accounts;
    expect(accounts.find((a) => a.id === "acc-2")?.isDefault).toBe(true);
    expect(accounts.find((a) => a.id === "acc-1")?.isDefault).toBe(false);

    expect(localStorage.getItem("telebos_user_bank_accounts")).toBeNull();
    expect(localStorage.getItem("telebos_bank_accounts")).toBeNull();
  });
});
