"use client";

import { SmmOrderManager } from "@/components/orders/smm-order-manager";
import { TELEGRAM_MEMBERS_IDS } from "@/lib/services-filter";
import { useT } from "@/lib/i18n";

export default function TelegramMembersPage() {
  const t = useT();
  return (
    <SmmOrderManager
      title={t("nav.telegramMembers") || "Telegram Members & Subscribers"}
      description="Pesan anggota grup dan subscriber channel Telegram berkualitas tinggi dengan proses cepat, stabil, dan bergaransi dari server TeleBos Cloud Gateway."
      allowedServiceIds={TELEGRAM_MEMBERS_IDS}
      categoryKey="members"
      targetPlaceholder="https://t.me/channel_name atau @channel_name"
      targetHelperText="Pastikan channel atau grup bersifat publik saat proses pengisian, atau gunakan link tautan undangan resmi jika didukung."
      targetExample="https://t.me/namachannel atau @namagrup"
    />
  );
}
