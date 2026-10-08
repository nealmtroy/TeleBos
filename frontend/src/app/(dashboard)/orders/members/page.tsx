"use client";

import { SmmOrderManager } from "@/components/orders/smm-order-manager";
import { TELEGRAM_MEMBERS_IDS } from "@/lib/services-filter";
import { useT } from "@/lib/i18n";

export default function TelegramMembersPage() {
  const t = useT();
  return (
    <SmmOrderManager
      title={t("orderServices.members.title")}
      description={t("orderServices.members.desc")}
      allowedServiceIds={TELEGRAM_MEMBERS_IDS}
      categoryKey="members"
      targetPlaceholder={t("orderServices.members.targetPlaceholder")}
      targetHelperText={t("orderServices.members.targetHelper")}
      targetExample="https://t.me/namachannel atau @namagrup"
    />
  );
}
