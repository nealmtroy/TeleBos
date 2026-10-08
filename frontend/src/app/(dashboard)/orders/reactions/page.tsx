"use client";

import { SmmOrderManager } from "@/components/orders/smm-order-manager";
import { TELEGRAM_REACTIONS_IDS } from "@/lib/services-filter";
import { useT } from "@/lib/i18n";

export default function TelegramReactionsPage() {
  const t = useT();
  return (
    <SmmOrderManager
      title={t("orderServices.reactions.title")}
      description={t("orderServices.reactions.desc")}
      allowedServiceIds={TELEGRAM_REACTIONS_IDS}
      categoryKey="reactions"
      targetPlaceholder={t("orderServices.reactions.targetPlaceholder")}
      targetHelperText={t("orderServices.reactions.targetHelper")}
      targetExample="https://t.me/namachannel/123"
    />
  );
}
