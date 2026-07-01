"use client";

import { SmmOrderManager } from "@/components/orders/smm-order-manager";
import { TELEGRAM_POST_VIEWS_IDS } from "@/lib/services-filter";
import { useT } from "@/lib/i18n";

export default function TelegramPostViewsPage() {
  const t = useT();
  return (
    <SmmOrderManager
      title={t("nav.telegramPostViews")}
      description="Order Telegram views for one or more posts instantly from our SMM panel."
      allowedServiceIds={TELEGRAM_POST_VIEWS_IDS}
    />
  );
}
