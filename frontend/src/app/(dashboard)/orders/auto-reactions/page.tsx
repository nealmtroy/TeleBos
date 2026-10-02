"use client";

import { SmmOrderManager } from "@/components/orders/smm-order-manager";
import { TELEGRAM_AUTO_REACTIONS_IDS } from "@/lib/services-filter";
import { useT } from "@/lib/i18n";

export default function TelegramAutoReactionsPage() {
  const t = useT();
  return (
    <SmmOrderManager
      title={t("nav.telegramAutoReactions") || "Telegram Auto Reactions"}
      description="Otomasi reaksi emoji untuk setiap postingan baru di channel Telegram Anda secara terjadwal dan konsisten 24/7 tanpa perlu order manual setiap post."
      allowedServiceIds={TELEGRAM_AUTO_REACTIONS_IDS}
      categoryKey="auto-reactions"
      targetPlaceholder="https://t.me/channel_name atau @channel_name"
      targetHelperText="Masukkan username atau link channel publik Anda. Sistem akan memantau postingan baru dan memberikan reaksi otomatis sesuai kuota."
      targetExample="https://t.me/namachannel"
    />
  );
}
