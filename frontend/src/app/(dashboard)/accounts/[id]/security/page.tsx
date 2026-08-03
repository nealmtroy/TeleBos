"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { useAccount } from "@/hooks/use-accounts";
import { useT } from "@/lib/i18n";
import {
  LoginEmailSettings,
  PrivacySettings,
  TwoFASettings,
} from "@/components/accounts/account-settings-page";

export default function AccountSecurityPage() {
  const _ = useT();
  const params = useParams();
  const id = params.id as string;
  const { data: account } = useAccount(id);

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-8">
      <header className="flex items-start gap-3 border-b border-border pb-5">
        <Link
          href={`/accounts/${id}`}
          aria-label={_("accountDetail.backToAccounts")}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" />
            <h1 className="text-balance text-2xl font-semibold tracking-tight text-foreground">
              {_("accountDetail.security")}
            </h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {account?.first_name || _("accountDetail.unnamed")} · {account?.phone || "Telegram"}
          </p>
        </div>
      </header>

      <PrivacySettings accountId={id} />
      <LoginEmailSettings accountId={id} />
      <TwoFASettings accountId={id} />
    </div>
  );
}
