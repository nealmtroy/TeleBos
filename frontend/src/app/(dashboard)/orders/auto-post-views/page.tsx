"use client";

import { SmmOrderManager } from "@/components/orders/smm-order-manager";
import { TELEGRAM_AUTO_POST_VIEWS_IDS } from "@/lib/services-filter";
import { useT } from "@/lib/i18n";

export default function TelegramAutoPostViewsPage() {
  const t = useT();
  return (
    <SmmOrderManager
      title={t("orderServices.autoPostViews.title")}
      description={t("orderServices.autoPostViews.desc")}
      allowedServiceIds={TELEGRAM_AUTO_POST_VIEWS_IDS}
      categoryKey="auto-post-views"
      targetPlaceholder={t("orderServices.autoPostViews.targetPlaceholder")}
      targetHelperText={t("orderServices.autoPostViews.targetHelper")}
      targetExample="https://t.me/namachannel"
    />
  );
}
