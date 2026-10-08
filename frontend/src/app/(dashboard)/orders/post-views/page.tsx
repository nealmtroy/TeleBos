"use client";

import { SmmOrderManager } from "@/components/orders/smm-order-manager";
import { TELEGRAM_POST_VIEWS_IDS } from "@/lib/services-filter";
import { useT } from "@/lib/i18n";

export default function TelegramPostViewsPage() {
  const t = useT();
  return (
    <SmmOrderManager
      title={t("orderServices.postViews.title")}
      description={t("orderServices.postViews.desc")}
      allowedServiceIds={TELEGRAM_POST_VIEWS_IDS}
      categoryKey="post-views"
      targetPlaceholder={t("orderServices.postViews.targetPlaceholder")}
      targetHelperText={t("orderServices.postViews.targetHelper")}
      targetExample="https://t.me/namachannel/123"
    />
  );
}
