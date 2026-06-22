"use client";

import { useState } from "react";
import { useAccounts, type Account } from "@/hooks/use-accounts";
import { useAppStore } from "@/store/app-store";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { ChevronsUpDown } from "lucide-react";
import { AccountAvatar } from "@/components/accounts/account-avatar";

function Avatar({ account, size = "sm" }: { account: Account; size?: "sm" | "md" }) {
  const dim = size === "sm" ? "w-6 h-6" : "w-10 h-10";
  return (
    <AccountAvatar
      accountId={account.id}
      firstName={account.first_name}
      phone={account.phone}
      photoVersion={account.photo_version}
      size={size === "sm" ? "sm" : "lg"}
      className={dim}
    />
  );
}

export function AccountSwitcher() {
  const _ = useT();
  const { data: accounts } = useAccounts();
  const selectedAccountId = useAppStore((s) => s.selectedAccountId);
  const setSelectedAccount = useAppStore((s) => s.setSelectedAccount);
  const [open, setOpen] = useState(false);

  const accountsList = Array.isArray(accounts) ? accounts : [];
  const selected = accountsList.find((a) => a.id === selectedAccountId);

  if (accountsList.length === 0) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition w-full"
      >
        {selected ? <Avatar account={selected} /> : (
          <div className="w-6 h-6 rounded-full bg-primary-100 flex items-center justify-center text-xs font-bold text-primary-700">
            T
          </div>
        )}
        <span className="truncate text-gray-700">
          {selected?.first_name || _("accountSwitcher.selectAccount")}
        </span>
        <ChevronsUpDown className="h-3.5 w-3.5 text-gray-400 ml-auto" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1">
            {accountsList.map((account) => (
              <button
                key={account.id}
                onClick={() => {
                  setSelectedAccount(account.id);
                  setOpen(false);
                }}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 text-sm w-full text-left hover:bg-gray-50 transition",
                  selected?.id === account.id && "bg-primary-50"
                )}
              >
                <Avatar account={account} />
                <span className="truncate">
                  {account.first_name || account.phone}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
