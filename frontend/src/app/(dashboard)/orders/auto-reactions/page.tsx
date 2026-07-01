"use client";

import { SmmOrderManager } from "@/components/orders/smm-order-manager";
import { TELEGRAM_AUTO_REACTIONS_IDS } from "@/lib/services-filter";
import { useT } from "@/lib/i18n";

export default function TelegramAutoReactionsPage() {
  const t = useT();
  return (
    <SmmOrderManager
      title={t("nav.telegramAutoReactions")}
      description="Order Telegram automatic positive/negative reactions and views for future posts."
      allowedServiceIds={TELEGRAM_AUTO_REACTIONS_IDS}
    />
  );
}
