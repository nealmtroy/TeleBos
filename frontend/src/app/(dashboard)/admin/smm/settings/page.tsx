"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function LegacySmmSettingsRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/admin/settings?tab=smm");
  }, [router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] space-y-3">
      <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
      <p className="text-xs text-gray-500">Mengarahkan ke Konfigurasi Sistem Admin...</p>
    </div>
  );
}
