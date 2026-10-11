"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, ArrowRight, CheckCircle2, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/auth-store";
import { useT } from "@/lib/i18n";
import api from "@/lib/api";

interface OnboardingPromptModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OnboardingPromptModal({ open, onOpenChange }: OnboardingPromptModalProps) {
  const router = useRouter();
  const _ = useT();
  const user = useAuthStore((s) => s.user);
  const [isSkipping, setIsSkipping] = useState(false);

  const handleStart = () => {
    onOpenChange(false);
    router.push("/onboarding");
  };

  const handleSkip = async () => {
    setIsSkipping(true);
    try {
      if (user?.id) {
        localStorage.setItem(`telebos_onboarding_completed_${user.id}`, "true");
      }
      await api.post("/onboarding", {
        role: "explore",
        referral: "direct",
        volume: "1-5",
        features: ["broadcast"],
        is_skipped: true,
      });
      if (user) {
        useAuthStore.setState({
          user: { ...user, onboarding_completed: true },
        });
      }
    } catch (err) {
      console.error("Failed to skip onboarding:", err);
    } finally {
      setIsSkipping(false);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md p-0 overflow-hidden border-border bg-card shadow-2xl rounded-2xl"
        showCloseButton={false}
      >
        {/* Top Header Graphic */}
        <div className="relative bg-gradient-to-br from-primary/20 via-primary/10 to-transparent p-6 pb-5 border-b border-border/60">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="absolute top-4 right-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="inline-flex p-3 rounded-2xl bg-primary text-primary-foreground shadow-md mb-3.5">
            <Sparkles className="h-6 w-6" />
          </div>

          <DialogTitle className="text-xl font-bold tracking-tight text-foreground">
            {_("onboarding.promptModalTitle") || "Selamat Datang di TeleBos! 🚀"}
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm text-muted-foreground mt-1 leading-relaxed">
            {_("onboarding.promptModalDesc") ||
              "Bantu kami menyesuaikan workspace dan rekomendasi fitur sesuai kebutuhan bisnis Anda hanya dalam 1 menit."}
          </DialogDescription>
        </div>

        {/* Benefits List */}
        <div className="p-6 pt-4 space-y-3">
          <div className="flex items-start gap-2.5 text-xs text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <span>
              {_("onboarding.promptBenefit1") ||
                "Personalisasi tata letak dashboard & metrik utama Telegram Anda."}
            </span>
          </div>
          <div className="flex items-start gap-2.5 text-xs text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <span>
              {_("onboarding.promptBenefit2") ||
                "Rekomendasi alur kerja broadcast, scrap, dan multi-akun otomatis."}
            </span>
          </div>
          <div className="flex items-start gap-2.5 text-xs text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <span>
              {_("onboarding.promptBenefit3") ||
                "Bisa diselesaikan kurang dari 60 detik tanpa konfigurasi rumit."}
            </span>
          </div>

          {/* Action Buttons */}
          <div className="pt-3 space-y-2">
            <Button
              type="button"
              onClick={handleStart}
              className="w-full gap-2 h-10 font-semibold shadow-xs"
            >
              <span>{_("onboarding.promptStartCta") || "Mulai Onboarding Sekarang"}</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={handleSkip}
              disabled={isSkipping}
              className="w-full h-9 text-xs text-muted-foreground hover:text-foreground"
            >
              {isSkipping
                ? _("common.saving") || "Menyimpan..."
                : _("onboarding.promptSkipCta") || "Lewati untuk Sekarang"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
