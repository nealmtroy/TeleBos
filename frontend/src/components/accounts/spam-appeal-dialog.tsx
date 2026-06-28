"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/lib/i18n";
import { useStartSpamAppeal, useResumeSpamAppeal } from "@/hooks/use-accounts";
import { useToast } from "@/components/ui/toast";
import { AlertTriangle, ExternalLink, Loader2, Send, CheckCircle2, ShieldAlert } from "lucide-react";

interface SpamAppealDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
}

const APPEAL_PRESETS = [
  {
    id: "en_default",
    name: "English (Default)",
    text: "Hello moderator, my account was restricted by mistake. I have never sent any spam, advertising, or annoying messages to anyone. Please review my account and lift the restriction. Thank you."
  },
  {
    id: "id_default",
    name: "Bahasa Indonesia",
    text: "Halo moderator, akun saya terkena restricted secara tidak sengaja. Saya tidak pernah mengirim spam, iklan, atau pesan yang mengganggu kepada siapapun. Mohon periksa kembali akun saya dan bebaskan dari pembatasan ini. Terima kasih."
  },
  {
    id: "en_short",
    name: "Short & Simple (English)",
    text: "Dear Telegram team, I believe my account was restricted by mistake. I always follow the rules and have never engaged in spam behavior. Please kindly review and unrestrict my account. Thank you."
  },
  {
    id: "en_formal",
    name: "Professional & Formal",
    text: "Dear Telegram Support Team, I am writing to respectfully request a review of my account restriction. I have been a long-time user of Telegram and have always adhered to the Terms of Service. I believe my account was flagged in error as I have never engaged in any spam or abusive activities on the platform. I kindly ask you to lift the restriction so I can continue using Telegram as usual. Thank you for your time and consideration."
  },
  {
    id: "en_deep",
    name: "Deep Explanation (English)",
    text: "Hello Telegram Moderator, I sincerely apologize if any of my actions violated Telegram's policies, though I believe it was unintentional. I have thoroughly reviewed the guidelines and fully understand the importance of keeping Telegram safe from spam and abuse. I am confident my account was flagged by mistake because I have always been a responsible user who respects the community rules. I kindly request you to review my case and lift the restriction. I will continue to be a valuable and law-abiding member of the Telegram community. Thank you for your understanding."
  },
  {
    id: "id_short",
    name: "Simple Bahasa Indonesia",
    text: "Halo Tim Telegram, saya yakin akun saya kena restrict tidak sengaja. Saya selalu patuh aturan dan tidak pernah spam. Mohon diperiksa dan dibebaskan ya. Terima kasih."
  },
  {
    id: "custom",
    name: "Custom (ketik manual)",
    text: ""
  }
];

export function SpamAppealDialog({ open, onOpenChange, accountId }: SpamAppealDialogProps) {
  const _ = useT();
  const { toast } = useToast();
  const dialogRef = useRef<HTMLDivElement>(null);

  // Mutations
  const startAppealMutation = useStartSpamAppeal();
  const resumeAppealMutation = useResumeSpamAppeal();

  // Dialog flow state
  const [selectedPreset, setSelectedPreset] = useState("en_default");
  const [reason, setReason] = useState(APPEAL_PRESETS[0].text);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Status states
  const [status, setStatus] = useState<"idle" | "submitting" | "warning" | "captcha" | "success">("idle");
  const [captchaUrl, setCaptchaUrl] = useState<string | null>(null);

  // Sync state with open/close
  useEffect(() => {
    if (open) {
      setSelectedPreset("en_default");
      setReason(APPEAL_PRESETS[0].text);
      setErrorMsg(null);
      setCaptchaUrl(null);
      setStatus("idle");
    }
  }, [open]);

  // Handle body scroll locking
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Handle Escape key
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && status !== "submitting") {
        onOpenChange(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, status, onOpenChange]);

  if (!open) return null;

  const isSubmitting = status === "submitting";

  async function handleStartAppeal(force = false) {
    if (!reason.trim()) {
      setErrorMsg(_("accountDetail.nameRequired")); // fallback to a non-empty warning
      return;
    }

    setErrorMsg(null);
    setStatus("submitting");

    try {
      const res = await startAppealMutation.mutateAsync({
        accountId,
        reason,
        force,
      });

      if (res.status === "completed") {
        setStatus("success");
        toast({ variant: "success", description: _("accountDetail.appealSuccessDesc") });
        // Let it display success state in dialog for a moment before closing,
        // or let the user click OK.
      } else if (res.status === "already_submitted") {
        setStatus("warning");
      } else if (res.status === "captcha_required" && res.captcha_url) {
        setCaptchaUrl(res.captcha_url);
        setStatus("captcha");
      } else {
        setStatus("idle");
        setErrorMsg(res.message || "Appeal failed");
      }
    } catch (err: any) {
      setStatus("idle");
      const errDetail = err?.response?.data?.detail || err?.message || "Unknown error";
      setErrorMsg(_("accountDetail.appealFailedDesc", { error: errDetail }));
    }
  }

  async function handleResumeAppeal() {
    setErrorMsg(null);
    setStatus("submitting");

    try {
      const res = await resumeAppealMutation.mutateAsync({
        accountId,
        reason,
      });

      if (res.status === "completed") {
        setStatus("success");
        toast({ variant: "success", description: _("accountDetail.appealSuccessDesc") });
      } else if (res.status === "captcha_required" && res.captcha_url) {
        // Keep captcha state, maybe they need to solve again
        setCaptchaUrl(res.captcha_url);
        setStatus("captcha");
        setErrorMsg(_("accountDetail.appealCaptchaTitle")); // Re-prompt
      } else {
        setStatus("idle");
        setErrorMsg(res.message || "Appeal resumption failed");
      }
    } catch (err: any) {
      setStatus("captcha"); // return to captcha state
      const errDetail = err?.response?.data?.detail || err?.message || "Unknown error";
      setErrorMsg(_("accountDetail.appealFailedDesc", { error: errDetail }));
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
        onClick={() => {
          if (!isSubmitting) onOpenChange(false);
        }}
        style={{ animation: "fadeIn 0.2s ease-out" }}
      />

      {/* Dialog container */}
      <div
        ref={dialogRef}
        className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto"
        style={{
          animation: "scaleIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Success State */}
        {status === "success" && (
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-8 w-8 text-emerald-600 animate-bounce" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-slate-900">{_("accountDetail.appealSuccessTitle")}</h3>
              <p className="text-sm text-slate-500 max-w-sm mx-auto">{_("accountDetail.appealSuccessDesc")}</p>
            </div>
            <button
              onClick={() => onOpenChange(false)}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition duration-150 shadow-md active:scale-95"
            >
              OK
            </button>
          </div>
        )}

        {/* Warning State: Already Submitted */}
        {status === "warning" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-xl border border-amber-200 text-amber-800">
              <ShieldAlert className="h-8 w-8 flex-shrink-0 text-amber-600 animate-pulse" />
              <div>
                <h4 className="font-bold text-sm">{_("accountDetail.appealForceWarningTitle")}</h4>
                <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">{_("accountDetail.appealForceWarningDesc")}</p>
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => setStatus("idle")}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl transition"
              >
                {_("accountDetail.appealCancel")}
              </button>
              <button
                onClick={() => handleStartAppeal(true)}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-xl transition shadow-md active:scale-95"
              >
                {_("accountDetail.appealForceSubmit")}
              </button>
            </div>
          </div>
        )}

        {/* Captcha State */}
        {status === "captcha" && captchaUrl && (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500 animate-pulse" />
              {_("accountDetail.appealCaptchaTitle")}
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-100 font-sans">
              {_("accountDetail.appealCaptchaDesc")}
            </p>

            {errorMsg && (
              <p className="text-xs text-rose-600 font-medium bg-rose-50 p-2.5 rounded-lg border border-rose-100">
                {errorMsg}
              </p>
            )}

            <div className="space-y-3 pt-3">
              <a
                href={captchaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold rounded-xl transition shadow-md hover:shadow-lg active:scale-98"
              >
                <ExternalLink className="h-4 w-4" />
                {_("accountDetail.appealCaptchaOpenBtn")}
              </a>
              
              <div className="flex gap-3">
                <button
                  onClick={() => setStatus("idle")}
                  className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl transition"
                >
                  {_("accountDetail.appealCancel")}
                </button>
                <button
                  onClick={handleResumeAppeal}
                  className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition shadow-md active:scale-95"
                >
                  {_("accountDetail.appealCaptchaDoneBtn")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Main Appeal Form State */}
        {status === "idle" && (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Send className="h-5 w-5 text-primary-500" />
              {_("accountDetail.appealTitle")}
            </h3>

            {errorMsg && (
              <p className="text-xs text-rose-600 font-medium bg-rose-50 p-2.5 rounded-lg border border-rose-100">
                {errorMsg}
              </p>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase text-slate-400">
                {_("accountDetail.appealReasonLabel")}
              </label>
              <select
                value={selectedPreset}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedPreset(val);
                  const preset = APPEAL_PRESETS.find(p => p.id === val);
                  if (preset && val !== "custom") {
                    setReason(preset.text);
                  }
                }}
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white text-slate-900 transition-all font-medium"
              >
                {APPEAL_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase text-slate-400">
                {_("accountDetail.appealCustomReasonLabel")}
              </label>
              <textarea
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  setSelectedPreset("custom");
                }}
                rows={5}
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white text-slate-900 transition-all font-sans resize-none"
                placeholder={_("accountDetail.appealCustomReasonPlaceholder")}
              />
            </div>

            <div className="flex gap-3 justify-end pt-3">
              <button
                onClick={() => onOpenChange(false)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl transition"
              >
                {_("accountDetail.appealCancel")}
              </button>
              <button
                onClick={() => handleStartAppeal(false)}
                className="px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold rounded-xl transition shadow-md active:scale-95"
              >
                {_("accountDetail.appealSubmit")}
              </button>
            </div>
          </div>
        )}

        {/* Submitting/Loading State */}
        {status === "submitting" && (
          <div className="text-center py-12 space-y-4">
            <Loader2 className="h-10 w-10 text-primary-500 animate-spin mx-auto" />
            <p className="text-sm font-medium text-slate-500">
              {_("accountDetail.appealSubmitting")}
            </p>
          </div>
        )}
      </div>

      {/* Global CSS styles for transitions */}
      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(8px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}</style>
    </div>,
    document.body
  );
}
