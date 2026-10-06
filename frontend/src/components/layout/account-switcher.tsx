"use client";

import { useAccounts, type Account } from "@/hooks/use-accounts";
import { useAppStore } from "@/store/app-store";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { ChevronsUpDown, Check } from "lucide-react";
import { AccountAvatar } from "@/components/accounts/account-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function Avatar({ account, size = "sm" }: { account: Account; size?: "sm" | "md" }) {
  const dim = size === "sm" ? "w-6 h-6" : "w-10 h-10";
  return (
    <AccountAvatar
      accountId={account.id}
      telegramId={account.telegram_id}
      firstName={account.first_name}
      phone={account.phone}
      colorId={account.color_id}
      hasProfilePhoto={account.has_profile_photo}
      photoVersion={account.photo_version}
      isActive={account.is_active}
      profilePhotoPath={account.profile_photo_path}
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

  const accountsList = Array.isArray(accounts)
    ? accounts.filter((acc) => acc.is_active && !acc.for_sale)
    : [];
  const selected = accountsList.find((a) => a.id === selectedAccountId);

  if (accountsList.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-800 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 transition w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {selected ? (
            <Avatar account={selected} />
          ) : (
            <div className="w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-950 flex items-center justify-center text-xs font-bold text-primary-700 dark:text-primary-300">
              T
            </div>
          )}
          <span className="truncate text-gray-700 dark:text-slate-200 flex-1">
            {selected?.first_name || _("accountSwitcher.selectAccount")}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 text-gray-400 dark:text-slate-500 shrink-0" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-[240px] max-h-72 overflow-y-auto">
        <DropdownMenuLabel className="text-xs text-muted-foreground dark:text-slate-400">
          {_("accountSwitcher.accounts") || "Accounts"}
        </DropdownMenuLabel>
        {accountsList.map((account) => {
          const isCurrent = selected?.id === account.id;
          return (
            <DropdownMenuItem
              key={account.id}
              onClick={() => setSelectedAccount(account.id)}
              className={cn(
                "flex items-center gap-2 cursor-pointer",
                isCurrent && "bg-primary-50 dark:bg-primary-950/50 font-medium"
              )}
            >
              <Avatar account={account} />
              <span className="truncate flex-1 text-gray-800 dark:text-slate-200">
                {account.first_name || account.phone}
              </span>
              {isCurrent && (
                <Check className="h-4 w-4 text-primary shrink-0" />
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
