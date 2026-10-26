"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  KeyRound,
  RefreshCw,
  Copy,
  Check,
  AlertCircle,
  Clock,
  ShieldAlert,
  Smartphone,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useAccountOTP } from "@/hooks/use-account-otp";
import { type Account } from "@/hooks/use-accounts";
import { useToast } from "@/components/ui/toast";
import { useT } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface AccountOtpModalProps {
  account: Account;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AccountOtpModal({ account, open, onOpenChange }: AccountOtpModalProps) {
  const _ = useT();
  const { toast } = useToast();
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedMsgId, setCopiedMsgId] = useState<number | null>(null);
  const [showAllMessages, setShowAllMessages] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [autoRefreshActive, setAutoRefreshActive] = useState(true);

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useAccountOTP(account.id, {
    enabled: open,
  });

  // Auto-poll countdown every 5 seconds while modal is open, autoRefresh is on, and no recent OTP is present yet
  useEffect(() => {
    if (!open || !autoRefreshActive || data?.is_recent) {
      return;
    }
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          void refetch();
          return 5;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [open, autoRefreshActive, data?.is_recent, refetch]);

  // Reset countdown when modal opens
  useEffect(() => {
    if (open) {
      setCountdown(5);
      setAutoRefreshActive(true);
    }
  }, [open]);

  const handleCopyOtp = useCallback(
    async (code: string) => {
      try {
        await navigator.clipboard.writeText(code);
        setCopiedCode(true);
        toast({
          variant: "success",
          title: _("accountOtpModal.codeCopied") || "Kode Disalin!",
          description: `OTP: ${code}`,
        });
        setTimeout(() => setCopiedCode(false), 2000);
      } catch {
        // Fallback or permission error
      }
    },
    [_, toast]
  );

  const handleCopyMessage = useCallback(
    async (id: number, text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopiedMsgId(id);
        toast({
          variant: "success",
          title: "Pesan Disalin",
          description: "Isi pesan Telegram disalin ke clipboard.",
        });
        setTimeout(() => setCopiedMsgId(null), 2000);
      } catch {
        // Fallback
      }
    },
    [toast]
  );

  const formatMessageDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleString("id-ID", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return dateStr;
    }
  };

  const getTimeAgo = (dateStr: string | null) => {
    if (!dateStr) return "";
    try {
      const now = Date.now();
      const then = new Date(dateStr).getTime();
      const diffSec = Math.floor((now - then) / 1000);
      if (diffSec < 60) return "beberapa detik yang lalu";
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `${diffMin} menit yang lalu`;
      const diffHour = Math.floor(diffMin / 60);
      if (diffHour < 24) return `${diffHour} jam yang lalu`;
      const diffDay = Math.floor(diffHour / 24);
      return `${diffDay} hari yang lalu`;
    } catch {
      return "";
    }
  };

  const errorMessage =
    (error as any)?.response?.data?.detail ||
    (error as Error)?.message ||
    "Terjadi kesalahan saat mengambil pesan OTP.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-6 gap-5 bg-card border-border shadow-2xl">
        <DialogHeader className="gap-1">
          <div className="flex items-center gap-2">
            <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-foreground">
                {_("accountOtpModal.title")}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {_("accountOtpModal.description")}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Account Info Bar */}
        <div className="flex items-center justify-between px-3.5 py-2.5 rounded-lg bg-muted/60 border border-border/80 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <Smartphone className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="truncate">
              <span className="font-semibold text-foreground">{account.phone}</span>
              {account.first_name && (
                <span className="text-muted-foreground ml-1.5 truncate">
                  ({account.first_name})
                </span>
              )}
            </div>
          </div>
          <Badge variant="outline" className="text-[11px] font-mono shrink-0">
            ID: 777000
          </Badge>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="py-8 flex flex-col items-center justify-center gap-3">
            <RefreshCw className="h-8 w-8 text-emerald-500 animate-spin" />
            <p className="text-xs text-muted-foreground">
              {_("accountOtpModal.refreshing")}
            </p>
          </div>
        )}

        {/* Error State */}
        {!isLoading && isError && (
          <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 space-y-3">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <p className="font-semibold text-destructive">
                  {_("accountOtpModal.errorTitle")}
                </p>
                <p className="text-muted-foreground break-words">{errorMessage}</p>
              </div>
            </div>
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-destructive-foreground bg-destructive hover:bg-destructive/90 rounded-lg transition-colors cursor-pointer"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
              {_("accountOtpModal.retry")}
            </button>
          </div>
        )}

        {/* Success Data State */}
        {!isLoading && !isError && data && (
          <div className="space-y-4">
            {/* Primary OTP Banner */}
            {data.otp_code ? (
              <div className="relative overflow-hidden rounded-xl border border-emerald-300 dark:border-emerald-800 bg-gradient-to-br from-emerald-50/80 via-teal-50/50 to-white dark:from-emerald-950/40 dark:via-teal-950/20 dark:to-slate-900 p-4 shadow-xs">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-emerald-900 dark:text-emerald-200">
                      {_("accountOtpModal.otpCode")}
                    </span>
                    {data.is_recent ? (
                      <Badge variant="success" className="text-[10px] px-1.5 py-0">
                        {_("accountOtpModal.recentBadge")}
                      </Badge>
                    ) : (
                      <Badge variant="warning" className="text-[10px] px-1.5 py-0">
                        {_("accountOtpModal.expiredBadge")}
                      </Badge>
                    )}
                  </div>
                  {data.otp_date && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {getTimeAgo(data.otp_date)}
                    </span>
                  )}
                </div>

                {/* Big OTP Code Display with Copy Button */}
                <div className="flex items-center justify-between gap-3 bg-card/80 backdrop-blur-xs border border-emerald-200 dark:border-emerald-800/80 rounded-xl px-4 py-3">
                  <span className="font-mono text-3xl font-extrabold tracking-widest text-emerald-700 dark:text-emerald-300 select-all">
                    {data.otp_code}
                  </span>
                  <button
                    onClick={() => handleCopyOtp(data.otp_code!)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-2xs transition-colors cursor-pointer shrink-0"
                  >
                    {copiedCode ? (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        <span>{_("accountOtpModal.codeCopied")}</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>{_("accountOtpModal.copyCode")}</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Security Warning */}
                <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                  <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                  <span>{_("accountOtpModal.warningNotice")}</span>
                </div>
              </div>
            ) : (
              <div className="p-5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-muted/40 text-center space-y-2">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <KeyRound className="h-5 w-5" />
                </div>
                <h4 className="text-sm font-semibold text-foreground">
                  {_("accountOtpModal.noOtpTitle")}
                </h4>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
                  {_("accountOtpModal.noOtpDesc")}
                </p>
                <div className="mt-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-left text-[11px] space-y-1 text-foreground">
                  <p className="font-semibold text-emerald-800 dark:text-emerald-300">💡 Tips jika kode belum masuk:</p>
                  <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                    <li>Di aplikasi Telegram, pilih opsi <strong>&quot;Kirim kode melalui Telegram&quot;</strong>.</li>
                    <li>Kode verifikasi dikirimkan langsung oleh akun resmi Telegram (ID: 777000).</li>
                    <li>Tunggu 5-10 detik lalu klik tombol Muat Ulang.</li>
                  </ul>
                </div>
              </div>
            )}

            {/* Refresh Action Button with Auto-check indicator */}
            <div className="space-y-1.5">
              <button
                onClick={() => {
                  setCountdown(5);
                  void refetch();
                }}
                disabled={isFetching}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-card hover:bg-muted text-foreground shadow-2xs transition-all disabled:opacity-60 cursor-pointer"
              >
                <RefreshCw className={cn("h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400", isFetching && "animate-spin")} />
                <span>
                  {isFetching
                    ? _("accountOtpModal.refreshing")
                    : _("accountOtpModal.refresh")}
                </span>
              </button>
              {!data.is_recent && (
                <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
                  <span>
                    {autoRefreshActive ? (
                      <>Memeriksa otomatis dalam <span className="font-semibold font-mono text-emerald-600 dark:text-emerald-400">{countdown}s</span></>
                    ) : (
                      "Pemeriksaan otomatis dijeda"
                    )}
                  </span>
                  <button
                    onClick={() => setAutoRefreshActive((p) => !p)}
                    className="text-primary hover:underline cursor-pointer"
                  >
                    {autoRefreshActive ? "Jeda" : "Aktifkan"}
                  </button>
                </div>
              )}
            </div>

            {/* Message History Accordion */}
            <div className="space-y-2 pt-2 border-t border-border/80">
              <button
                onClick={() => setShowAllMessages((prev) => !prev)}
                className="w-full flex items-center justify-between text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer py-1"
              >
                <span>
                  {_("accountOtpModal.recentMessages")} ({data.messages?.length || 0})
                </span>
                {showAllMessages ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>

              {showAllMessages && (
                <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                  {data.messages && data.messages.length > 0 ? (
                    data.messages.map((msg) => (
                      <div
                        key={msg.id}
                        className="p-3 rounded-lg border border-border/70 bg-card space-y-1.5 text-xs shadow-2xs"
                      >
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                          <span className="font-mono">{formatMessageDate(msg.date)}</span>
                          <div className="flex items-center gap-1.5">
                            {msg.otp_code && (
                              <Badge variant="success" className="text-[10px] px-1 py-0">
                                OTP: {msg.otp_code}
                              </Badge>
                            )}
                            <button
                              onClick={() => handleCopyMessage(msg.id, msg.text)}
                              className="inline-flex items-center p-1 hover:text-foreground transition-colors cursor-pointer"
                              title="Salin pesan"
                            >
                              {copiedMsgId === msg.id ? (
                                <Check className="h-3 w-3 text-emerald-500" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </button>
                          </div>
                        </div>
                        <p className="font-mono text-[11px] whitespace-pre-wrap text-foreground/90 bg-muted/40 p-2 rounded border border-border/50">
                          {msg.text || "(Pesan kosong)"}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-3">
                      {_("accountOtpModal.noMessages")}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
