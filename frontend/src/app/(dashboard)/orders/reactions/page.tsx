"use client";

import { SmmOrderManager } from "@/components/orders/smm-order-manager";
import { TELEGRAM_REACTIONS_IDS } from "@/lib/services-filter";
import { useT } from "@/lib/i18n";

export default function TelegramReactionsPage() {
  const t = useT();
  return (
    <SmmOrderManager
      title={t("nav.telegramReactions")}
      description="Order Telegram reactions and views for your posts from our SMM panel."
      allowedServiceIds={TELEGRAM_REACTIONS_IDS}
    />
  );
}
