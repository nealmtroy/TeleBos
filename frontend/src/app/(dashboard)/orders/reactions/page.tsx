"use client";

import { SmmOrderManager } from "@/components/orders/smm-order-manager";
import { TELEGRAM_REACTIONS_IDS } from "@/lib/services-filter";
import { useT } from "@/lib/i18n";

export default function TelegramReactionsPage() {
  const t = useT();
  return (
    <SmmOrderManager
      title={t("nav.telegramReactions") || "Telegram Post Reactions"}
      description="Tingkatkan engagement postingan Telegram dengan reaksi emoji positif, beragam emoji interaktif, dan tayangan instan dari server TeleBos Cloud Gateway."
      allowedServiceIds={TELEGRAM_REACTIONS_IDS}
      categoryKey="reactions"
      targetPlaceholder="https://t.me/channel_name/1234 (Link postingan publik)"
      targetHelperText="Wajib menggunakan link spesifik satu postingan dari channel Telegram publik. Format: https://t.me/username/123."
      targetExample="https://t.me/namachannel/123"
    />
  );
}
