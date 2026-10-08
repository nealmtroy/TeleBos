"use client";

import { SmmOrderManager } from "@/components/orders/smm-order-manager";
import { TELEGRAM_AUTO_REACTIONS_IDS } from "@/lib/services-filter";
import { useT } from "@/lib/i18n";

export default function TelegramAutoReactionsPage() {
  const t = useT();
  return (
    <SmmOrderManager
      title={t("orderServices.autoReactions.title")}
      description={t("orderServices.autoReactions.desc")}
      allowedServiceIds={TELEGRAM_AUTO_REACTIONS_IDS}
      categoryKey="auto-reactions"
      targetPlaceholder={t("orderServices.autoReactions.targetPlaceholder")}
      targetHelperText={t("orderServices.autoReactions.targetHelper")}
      targetExample="https://t.me/namachannel"
    />
  );
}
