import { create } from "zustand";

export interface UserBankAccount {
  id: string;
  type: "bank" | "ewallet";
  provider: string; // e.g. "BCA", "Mandiri", "BRI", "BNI", "GoPay", "OVO", "DANA", "ShopeePay"
  accountNumber: string;
  accountHolder: string;
  isDefault: boolean;
  createdAt: string;
}

export interface DepositSettings {
  merchantName: string;
  nmid: string;
  qrisEnabled: boolean;
  bankName: string;
  bankAccountNumber: string;
  bankAccountHolder: string;
}

export type TransactionStatus = "pending" | "approved" | "rejected";

export interface WalletTransaction {
  id: string;
  type: "topup" | "withdraw";
  amount: number;
  method: string;
  note: string;
  createdAt: string;
  status: TransactionStatus;
}

const STORAGE_KEY_ACCOUNTS = "telebos_user_bank_accounts";
const STORAGE_KEY_DEPOSIT_SETTINGS = "telebos_deposit_settings";
const STORAGE_KEY_TRANSACTIONS = "telebos_wallet_transactions";

const DEFAULT_ACCOUNTS: UserBankAccount[] = [];

const DEFAULT_DEPOSIT_SETTINGS: DepositSettings = {
  merchantName: "TELEBOS",
  nmid: "ID1020042918290",
  qrisEnabled: true,
  bankName: "Mandiri",
  bankAccountNumber: "1400 0019 4488 2",
  bankAccountHolder: "TeleBos Official",
};

const SEED_TRANSACTIONS: WalletTransaction[] = [
  {
    id: "wrn_8fd21a",
    type: "topup",
    amount: 250_000,
    method: "QRIS",
    note: "TRX 4471 2209",
    createdAt: "2026-09-28T14:22:00Z",
    status: "approved",
  },
  {
    id: "wrn_3c07be",
    type: "withdraw",
    amount: 150_000,
    method: "ewallet",
    note: "0812 3456 7890",
    createdAt: "2026-09-26T09:05:00Z",
    status: "pending",
  },
  {
    id: "wrn_9b41c7",
    type: "withdraw",
    amount: 75_000,
    method: "bank",
    note: "Mandiri 1122 0098 7712",
    createdAt: "2026-09-21T18:40:00Z",
    status: "rejected",
  },
  {
    id: "wrn_4a1f82",
    type: "topup",
    amount: 500_000,
    method: "QRIS",
    note: "Top Up QRIS TeleBos",
    createdAt: "2026-09-18T11:10:00Z",
    status: "approved",
  },
  {
    id: "wrn_7e3d19",
    type: "withdraw",
    amount: 200_000,
    method: "Mandiri",
    note: "Mandiri • 1400 0192 8331 1",
    createdAt: "2026-09-14T16:45:00Z",
    status: "approved",
  },
  {
    id: "wrn_2b8c94",
    type: "topup",
    amount: 100_000,
    method: "QRIS",
    note: "Isi Saldo QRIS",
    createdAt: "2026-09-10T08:30:00Z",
    status: "approved",
  },
];

interface BankAccountStore {
  accounts: UserBankAccount[];
  depositSettings: DepositSettings;
  transactions: WalletTransaction[];
  isHydrated: boolean;

  hydrate: () => void;
  addAccount: (account: Omit<UserBankAccount, "id" | "createdAt">) => void;
  updateAccount: (id: string, updates: Partial<UserBankAccount>) => void;
  deleteAccount: (id: string) => void;
  setDefaultAccount: (id: string) => void;

  updateDepositSettings: (settings: Partial<DepositSettings>) => void;

  addTransaction: (tx: Omit<WalletTransaction, "id" | "createdAt">) => WalletTransaction;
  updateTransactionStatus: (id: string, status: TransactionStatus) => void;
}

export const useBankAccountStore = create<BankAccountStore>((set, get) => ({
  accounts: DEFAULT_ACCOUNTS,
  depositSettings: DEFAULT_DEPOSIT_SETTINGS,
  transactions: SEED_TRANSACTIONS,
  isHydrated: false,

  hydrate: () => {
    if (typeof window === "undefined") return;

    let accounts = DEFAULT_ACCOUNTS;
    let depositSettings = DEFAULT_DEPOSIT_SETTINGS;
    let transactions = SEED_TRANSACTIONS;

    try {
      const storedAcc = localStorage.getItem(STORAGE_KEY_ACCOUNTS);
      if (storedAcc) {
        const parsed = JSON.parse(storedAcc);
        if (Array.isArray(parsed)) {
          const cleaned = parsed.filter(
            (a) =>
              a.id !== "acc_mandiri_1" &&
              a.id !== "acc_dana_2" &&
              a.id !== "acc_bca_1" &&
              !a.accountHolder?.toLowerCase().includes("ahmad") &&
              !a.accountHolder?.toLowerCase().includes("yudha")
          );
          accounts = cleaned;
          localStorage.setItem(STORAGE_KEY_ACCOUNTS, JSON.stringify(cleaned));
        }
      }

      const storedDep = localStorage.getItem(STORAGE_KEY_DEPOSIT_SETTINGS);
      if (storedDep) {
        const parsed = JSON.parse(storedDep);
        if (parsed && typeof parsed === "object") {
          depositSettings = { ...DEFAULT_DEPOSIT_SETTINGS, ...parsed };
        }
      }

      const storedTx = localStorage.getItem(STORAGE_KEY_TRANSACTIONS);
      if (storedTx) {
        const parsed = JSON.parse(storedTx);
        if (Array.isArray(parsed) && parsed.length > 0) transactions = parsed;
      }
    } catch {
      // Ignore parse/storage errors
    }

    set({
      accounts,
      depositSettings,
      transactions,
      isHydrated: true,
    });
  },

  addAccount: (data) => {
    const newAccount: UserBankAccount = {
      ...data,
      id: `acc_${Date.now()}`,
      createdAt: new Date().toISOString(),
    };

    set((state) => {
      let updatedAccounts = state.accounts;
      if (newAccount.isDefault) {
        updatedAccounts = updatedAccounts.map((a) => ({ ...a, isDefault: false }));
      } else if (updatedAccounts.length === 0) {
        newAccount.isDefault = true;
      }
      const next = [newAccount, ...updatedAccounts];
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(STORAGE_KEY_ACCOUNTS, JSON.stringify(next));
        } catch {}
      }
      return { accounts: next };
    });
  },

  updateAccount: (id, updates) => {
    set((state) => {
      let updatedAccounts = state.accounts.map((a) => (a.id === id ? { ...a, ...updates } : a));
      if (updates.isDefault) {
        updatedAccounts = updatedAccounts.map((a) => (a.id === id ? a : { ...a, isDefault: false }));
      }
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(STORAGE_KEY_ACCOUNTS, JSON.stringify(updatedAccounts));
        } catch {}
      }
      return { accounts: updatedAccounts };
    });
  },

  deleteAccount: (id) => {
    set((state) => {
      const remaining = state.accounts.filter((a) => a.id !== id);
      if (remaining.length > 0 && !remaining.some((a) => a.isDefault)) {
        remaining[0].isDefault = true;
      }
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(STORAGE_KEY_ACCOUNTS, JSON.stringify(remaining));
        } catch {}
      }
      return { accounts: remaining };
    });
  },

  setDefaultAccount: (id) => {
    set((state) => {
      const updated = state.accounts.map((a) => ({
        ...a,
        isDefault: a.id === id,
      }));
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(STORAGE_KEY_ACCOUNTS, JSON.stringify(updated));
        } catch {}
      }
      return { accounts: updated };
    });
  },

  updateDepositSettings: (updates) => {
    set((state) => {
      const next = { ...state.depositSettings, ...updates };
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(STORAGE_KEY_DEPOSIT_SETTINGS, JSON.stringify(next));
        } catch {}
      }
      return { depositSettings: next };
    });
  },

  addTransaction: (tx) => {
    const newTx: WalletTransaction = {
      ...tx,
      id: `wrn_${Math.random().toString(16).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
    };

    set((state) => {
      const next = [newTx, ...state.transactions];
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(STORAGE_KEY_TRANSACTIONS, JSON.stringify(next));
        } catch {}
      }
      return { transactions: next };
    });

    return newTx;
  },

  updateTransactionStatus: (id, status) => {
    set((state) => {
      const next = state.transactions.map((t) => (t.id === id ? { ...t, status } : t));
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(STORAGE_KEY_TRANSACTIONS, JSON.stringify(next));
        } catch {}
      }
      return { transactions: next };
    });
  },
}));
