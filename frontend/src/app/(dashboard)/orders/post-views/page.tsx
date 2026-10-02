"use client";

import { SmmOrderManager } from "@/components/orders/smm-order-manager";
import { TELEGRAM_POST_VIEWS_IDS } from "@/lib/services-filter";
import { useT } from "@/lib/i18n";

export default function TelegramPostViewsPage() {
  const t = useT();
  return (
    <SmmOrderManager
      title={t("nav.telegramPostViews") || "Telegram Post Views & Impressions"}
      description="Tingkatkan jumlah impresi dan pembaca pada postingan Telegram Anda secara instan untuk memperkuat social proof dan kredibilitas channel."
      allowedServiceIds={TELEGRAM_POST_VIEWS_IDS}
      categoryKey="post-views"
      targetPlaceholder="https://t.me/channel_name/1234 (Link postingan)"
      targetHelperText="Masukkan link postingan spesifik channel publik atau gunakan format multi-link jika didukung oleh layanan yang dipilih."
      targetExample="https://t.me/namachannel/123"
    />
  );
}
