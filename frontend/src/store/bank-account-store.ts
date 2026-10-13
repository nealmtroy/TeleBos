import { create } from "zustand";
import api from "@/lib/api";

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

export type TransactionType = "topup" | "withdraw" | "redeem" | "admin_adjustment" | "subscription" | "smm" | "marketplace";
export type TransactionStatus = "pending" | "approved" | "rejected";

export interface WalletTransaction {
  id: string;
  type: TransactionType;
  amount: number;
  totalAmount?: number | null;
  method: string;
  note: string;
  createdAt: string;
  status: TransactionStatus;
  qrisUrl?: string | null;
  qrisImage?: string | null;
  expiredAt?: string | null;
  userId?: string;
  userEmail?: string;
  adminNote?: string;
  processedAt?: string;
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
    id: "wrn_rd102a",
    type: "redeem",
    amount: 50_000,
    method: "Voucher Redeem",
    note: "TELEBOS-WELCOME50K",
    createdAt: "2026-09-12T10:00:00Z",
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
  {
    id: "wrn_ad441b",
    type: "admin_adjustment",
    amount: 100_000,
    method: "Admin System",
    note: "Penyesuaian saldo bonus oleh Administrator",
    createdAt: "2026-09-08T09:15:00Z",
    status: "approved",
  },
];

interface BankAccountStore {
  accounts: UserBankAccount[];
  depositSettings: DepositSettings;
  transactions: WalletTransaction[];
  isHydrated: boolean;

  hydrate: () => Promise<void> | void;
  addAccount: (account: Omit<UserBankAccount, "id" | "createdAt">) => Promise<UserBankAccount | void> | void;
  updateAccount: (id: string, updates: Partial<UserBankAccount>) => Promise<void> | void;
  deleteAccount: (id: string) => Promise<void> | void;
  setDefaultAccount: (id: string) => Promise<void> | void;

  updateDepositSettings: (settings: Partial<DepositSettings>) => void;

  addTransaction: (tx: Omit<WalletTransaction, "id" | "createdAt"> & { id?: string; createdAt?: string }) => WalletTransaction;
  updateTransactionStatus: (id: string, status: TransactionStatus, adminNote?: string) => void;
}

export const useBankAccountStore = create<BankAccountStore>((set, get) => ({
  accounts: DEFAULT_ACCOUNTS,
  depositSettings: DEFAULT_DEPOSIT_SETTINGS,
  transactions: SEED_TRANSACTIONS,
  isHydrated: false,

  hydrate: async () => {
    if (typeof window === "undefined") return;

    let depositSettings = DEFAULT_DEPOSIT_SETTINGS;
    let transactions = SEED_TRANSACTIONS;

    // Purge any legacy banking credentials persisted in browser LocalStorage (SEC-03 / TASK-11)
    try {
      localStorage.removeItem(STORAGE_KEY_ACCOUNTS);
      localStorage.removeItem("telebos_bank_accounts");
    } catch {}

    try {
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
      depositSettings,
      transactions,
      isHydrated: true,
    });

    // Fetch user's server-stored, encrypted bank accounts on-demand
    try {
      const res = await api.get<any[]>("/wallet/bank-accounts");
      if (Array.isArray(res.data)) {
        const fetchedAccounts: UserBankAccount[] = res.data.map((item) => ({
          id: String(item.id),
          type: item.type === "ewallet" ? "ewallet" : "bank",
          provider: item.provider,
          accountNumber: item.account_number || item.accountNumber || "",
          accountHolder: item.account_holder || item.accountHolder || "",
          isDefault: Boolean(item.is_default ?? item.isDefault),
          createdAt: item.created_at || item.createdAt || new Date().toISOString(),
        }));
        set({ accounts: fetchedAccounts });
      }
    } catch {
      // In offline / mock / unauthenticated mode, keep existing in-memory accounts
    }
  },

  addAccount: async (data) => {
    let newAccount: UserBankAccount = {
      ...data,
      id: `acc_${Date.now()}`,
      createdAt: new Date().toISOString(),
    };

    try {
      const res = await api.post("/wallet/bank-accounts", {
        type: data.type,
        provider: data.provider,
        account_number: data.accountNumber,
        account_holder: data.accountHolder,
        is_default: data.isDefault,
      });
      if (res.data) {
        const saved = res.data;
        newAccount = {
          id: String(saved.id),
          type: saved.type,
          provider: saved.provider,
          accountNumber: saved.account_number || saved.accountNumber || data.accountNumber,
          accountHolder: saved.account_holder || saved.accountHolder || data.accountHolder,
          isDefault: Boolean(saved.is_default ?? saved.isDefault),
          createdAt: saved.created_at || new Date().toISOString(),
        };
      }
    } catch (err) {
      console.warn("Could not save bank account to backend API, keeping local state:", err);
    }

    set((state) => {
      let updatedAccounts = state.accounts;
      if (newAccount.isDefault) {
        updatedAccounts = updatedAccounts.map((a) => ({ ...a, isDefault: false }));
      } else if (updatedAccounts.length === 0) {
        newAccount.isDefault = true;
      }
      return { accounts: [newAccount, ...updatedAccounts.filter((a) => a.id !== newAccount.id)] };
    });

    return newAccount;
  },

  updateAccount: async (id, updates) => {
    try {
      await api.put(`/wallet/bank-accounts/${id}`, {
        type: updates.type,
        provider: updates.provider,
        account_number: updates.accountNumber,
        account_holder: updates.accountHolder,
        is_default: updates.isDefault,
      });
    } catch (err) {
      console.warn("Could not update bank account on backend API:", err);
    }

    set((state) => {
      let updatedAccounts = state.accounts.map((a) => (a.id === id ? { ...a, ...updates } : a));
      if (updates.isDefault) {
        updatedAccounts = updatedAccounts.map((a) => (a.id === id ? a : { ...a, isDefault: false }));
      }
      return { accounts: updatedAccounts };
    });
  },

  deleteAccount: async (id) => {
    try {
      await api.delete(`/wallet/bank-accounts/${id}`);
    } catch (err) {
      console.warn("Could not delete bank account on backend API:", err);
    }

    set((state) => {
      const remaining = state.accounts.filter((a) => a.id !== id);
      if (remaining.length > 0 && !remaining.some((a) => a.isDefault)) {
        remaining[0].isDefault = true;
      }
      return { accounts: remaining };
    });
  },

  setDefaultAccount: async (id) => {
    try {
      await api.put(`/wallet/bank-accounts/${id}/default`);
    } catch (err) {
      console.warn("Could not set default bank account on backend API:", err);
    }

    set((state) => {
      const updated = state.accounts.map((a) => ({
        ...a,
        isDefault: a.id === id,
      }));
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
      id: (tx as any).id || `wrn_${Math.random().toString(16).slice(2, 8)}`,
      createdAt: (tx as any).createdAt || new Date().toISOString(),
    };

    set((state) => {
      const next = [newTx, ...state.transactions.filter((t) => t.id !== newTx.id)];
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(STORAGE_KEY_TRANSACTIONS, JSON.stringify(next));
        } catch {}
      }
      return { transactions: next };
    });

    return newTx;
  },

  updateTransactionStatus: (id, status, adminNote) => {
    set((state) => {
      const next = state.transactions.map((t) =>
        t.id === id
          ? {
              ...t,
              status,
              ...(adminNote !== undefined ? { adminNote } : {}),
              processedAt: new Date().toISOString(),
            }
          : t
      );
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(STORAGE_KEY_TRANSACTIONS, JSON.stringify(next));
        } catch {}
      }
      return { transactions: next };
    });
  },
}));
