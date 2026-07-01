"use client";

import { SmmOrderManager } from "@/components/orders/smm-order-manager";
import { TELEGRAM_MEMBERS_IDS } from "@/lib/services-filter";
import { useT } from "@/lib/i18n";

export default function TelegramMembersPage() {
  const t = useT();
  return (
    <SmmOrderManager
      title={t("nav.telegramMembers")}
      description="Order Telegram group and channel members or subscribers from our SMM panel."
      allowedServiceIds={TELEGRAM_MEMBERS_IDS}
    />
  );
}
