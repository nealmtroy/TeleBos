"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Bot,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Unlink,
  Clock,
  Sparkles,
} from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";
import {
  SettingsBadge,
  SettingsCard,
  SettingsCardHeader,
  SettingsDivider,
  StatusDot,
} from "./settings-cards";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";

interface TelegramStatus {
  is_connected: boolean;
  telegram_chat_id: number | null;
  bot_username: string;
  has_active_token: boolean;
  active_token: string | null;
  token_ttl: number;
}

export function TelegramBotSection() {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [tokenTtl, setTokenTtl] = useState<number>(0);
  const [copied, setCopied] = useState(false);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Load initial status
  const fetchStatus = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.get<TelegramStatus>("/telegram-bot/status");
      setStatus(res.data);
      if (res.data.active_token) {
        setToken((curr) => curr || res.data.active_token);
        setTokenTtl(res.data.token_ttl);
      }
      return res.data;
    } catch {
      if (!silent) {
        toast.error("Gagal memuat status integrasi Telegram");
      }
      return null;
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Countdown timer for active token
  useEffect(() => {
    if (!token || tokenTtl <= 0) return;

    const timer = setInterval(() => {
      setTokenTtl((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setToken(null);
          toast.info("Token penghubung telah kedaluwarsa. Silakan buat token baru.");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [token, tokenTtl]);

  // Real-time polling when a token is active to detect connection automatically
  useEffect(() => {
    if (token && !status?.is_connected) {
      pollIntervalRef.current = setInterval(async () => {
        const latest = await fetchStatus(true);
        if (latest?.is_connected) {
          setToken(null);
          setTokenTtl(0);
          toast.success("🎉 Akun Telegram berhasil terhubung!", {
            description: `Tautkan dengan ID: ${latest.telegram_chat_id}`,
          });
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        }
      }, 3000);
    } else {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [token, status?.is_connected, fetchStatus]);

  // Generate new token
  async function handleGenerateToken() {
    setGenerating(true);
    try {
      const res = await api.post("/telegram-bot/token");
      setToken(res.data.token);
      setTokenTtl(res.data.expires_in);
      toast.success("Token penghubung berhasil dibuat!", {
        description: "Gunakan token ini di bot Telegram dalam waktu 10 menit.",
      });
    } catch (err: any) {
      const message = err.response?.data?.detail || "Gagal membuat token penghubung";
      toast.error(message);
    } finally {
      setGenerating(false);
    }
  }

  // Unlink telegram
  async function handleUnlink() {
    setUnlinking(true);
    try {
      await api.post("/telegram-bot/unlink");
      toast.success("Akun Telegram berhasil diputuskan.");
      setConfirmOpen(false);
      setToken(null);
      setTokenTtl(0);
      await fetchStatus();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Gagal memutuskan hubungan Telegram");
    } finally {
      setUnlinking(false);
    }
  }

  // Copy token to clipboard
  function handleCopy() {
    if (!token) return;
    navigator.clipboard.writeText(token);
    setCopied(true);
    toast.success("Token berhasil disalin ke clipboard!");
    setTimeout(() => setCopied(false), 2000);
  }

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const isConnected = status?.is_connected ?? false;
  const botUsername = status?.bot_username || "TeleBosBot";
  const deepLink = token ? `https://t.me/${botUsername}?start=${token}` : `https://t.me/${botUsername}`;

  if (loading) {
    return (
      <SettingsCard className="p-8 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary mr-2" />
        <span className="text-sm text-muted-foreground">Memuat integrasi Telegram...</span>
      </SettingsCard>
    );
  }

  return (
    <div className="space-y-6">
      <SettingsCard>
        <SettingsCardHeader
          icon={<Bot className="h-5 w-5 text-sky-500" />}
          title="Integrasi Bot Telegram"
          description="Hubungkan akun TeleBos Anda dengan bot Telegram resmi untuk mengelola akun, memantau broadcast, dan menerima notifikasi sistem langsung dari Telegram."
          action={
            <SettingsBadge tone={isConnected ? "success" : "neutral"}>
              <StatusDot tone={isConnected ? "success" : "neutral"} />
              {isConnected ? "Terhubung" : "Belum Terhubung"}
            </SettingsBadge>
          }
        />
        <SettingsDivider className="my-5" />

        {isConnected ? (
          /* ── CONNECTED STATE ────────────────────────────────────────── */
          <div className="space-y-6">
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 sm:p-5 flex items-start gap-4">
              <div className="rounded-lg bg-emerald-500/10 p-2.5 text-emerald-600 dark:text-emerald-400 shrink-0">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-semibold text-foreground">
                  Akun Telegram Aktif & Terlindungi
                </h4>
                <p className="mt-1 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  Akun TeleBos Anda telah terhubung secara aman dengan bot Telegram. Anda dapat menjalankan perintah bot tanpa perlu login ulang.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
                  <div>
                    <span className="font-medium text-foreground">Bot Resmi: </span>
                    <a
                      href={`https://t.me/${botUsername}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline font-mono inline-flex items-center gap-1"
                    >
                      @{botUsername}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  <div>
                    <span className="font-medium text-foreground">Telegram Chat ID: </span>
                    <span className="font-mono bg-muted/60 px-1.5 py-0.5 rounded text-foreground">
                      {status?.telegram_chat_id ?? "-"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <Button
                variant="outline"
                size="sm"
                asChild
                className="gap-2"
              >
                <a href={`https://t.me/${botUsername}`} target="_blank" rel="noopener noreferrer">
                  <Bot className="h-4 w-4 text-sky-500" />
                  Buka Chat Bot di Telegram
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                </a>
              </Button>

              <Button
                variant="destructive"
                size="sm"
                onClick={() => setConfirmOpen(true)}
                disabled={unlinking}
                className="gap-2"
              >
                {unlinking ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Unlink className="h-4 w-4" />
                )}
                Putuskan Hubungan
              </Button>
            </div>
          </div>
        ) : (
          /* ── NOT CONNECTED STATE (AUTHENTICATOR STYLE) ─────────────────── */
          <div className="space-y-6">
            {!token ? (
              <div className="space-y-5">
                <div className="rounded-xl border border-border/60 bg-muted/30 p-5 space-y-3">
                  <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    Cara Menghubungkan (Authenticator Token):
                  </h4>
                  <ol className="list-decimal list-inside space-y-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                    <li>Klik tombol <strong>&quot;Buat Token Penghubung&quot;</strong> di bawah.</li>
                    <li>Sistem akan menghasilkan kode otentikasi sekali pakai yang berlaku selama 10 menit.</li>
                    <li>Buka bot Telegram <strong>@{botUsername}</strong> dan kirimkan kode token tersebut (atau klik tautan langsung yang disediakan).</li>
                  </ol>
                  <p className="text-xs text-muted-foreground pt-1 border-t border-border/40">
                    🔒 <strong>Keamanan Terjamin:</strong> Anda tidak perlu memasukkan email atau kata sandi di dalam chat Telegram.
                  </p>
                </div>

                <div className="pt-2">
                  <Button
                    onClick={handleGenerateToken}
                    disabled={generating}
                    className="gap-2 shadow-sm font-medium"
                  >
                    {generating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Bot className="h-4 w-4" />
                    )}
                    Buat Token Penghubung
                  </Button>
                </div>
              </div>
            ) : (
              /* ── TOKEN GENERATED VIEW (AUTHENTICATOR CARD) ─────────────── */
              <div className="space-y-6">
                <div className="rounded-2xl border-2 border-primary/20 bg-gradient-to-b from-primary/5 via-background to-background p-6 sm:p-7 shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <span className="text-xs font-semibold tracking-wider uppercase text-primary">
                        Token Penghubung Sekali Pakai
                      </span>
                      <h4 className="text-lg font-bold text-foreground mt-0.5">
                        Kirimkan Kode Ini ke Bot Telegram
                      </h4>
                    </div>

                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-medium self-start sm:self-auto">
                      <Clock className="h-3.5 w-3.5" />
                      <span>Kedaluwarsa: </span>
                      <span className="font-mono font-bold">{formatTimer(tokenTtl)}</span>
                    </div>
                  </div>

                  {/* Token Display Box */}
                  <div className="mt-5 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1 flex items-center justify-between gap-3 px-5 py-4 rounded-xl bg-muted/80 border border-border text-center sm:text-left">
                      <span className="font-mono text-2xl sm:text-3xl font-extrabold tracking-widest text-primary select-all">
                        {token}
                      </span>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={handleCopy}
                        className="gap-1.5 shrink-0"
                      >
                        {copied ? (
                          <>
                            <Check className="h-4 w-4 text-emerald-500" />
                            <span>Tersalin</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-4 w-4" />
                            <span>Salin</span>
                          </>
                        )}
                      </Button>
                    </div>

                    <Button
                      asChild
                      className="gap-2 py-6 px-5 font-semibold shrink-0"
                    >
                      <a href={deepLink} target="_blank" rel="noopener noreferrer">
                        <Bot className="h-4.5 w-4.5" />
                        Buka di Telegram
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                  </div>

                  {/* Waiting live indicator */}
                  <div className="mt-5 flex items-center gap-2.5 text-xs text-muted-foreground bg-primary/5 rounded-lg px-3.5 py-2.5 border border-primary/10">
                    <RefreshCw className="h-3.5 w-3.5 text-primary animate-spin" />
                    <span>
                      Menunggu verifikasi token di bot <strong>@{botUsername}</strong>... Halaman ini akan diperbarui otomatis saat berhasil terhubung.
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground pt-1">
                  <span>
                    Butuh token baru?
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleGenerateToken}
                    disabled={generating}
                    className="text-xs h-8 text-muted-foreground hover:text-foreground"
                  >
                    {generating ? "Membuat..." : "Buat Ulang Token"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </SettingsCard>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={handleUnlink}
        title="Putuskan Hubungan Telegram?"
        message="Apakah Anda yakin ingin memutuskan tautan bot Telegram? Anda tidak akan dapat mengelola TeleBos melalui bot Telegram sampai akun dihubungkan kembali dengan token baru."
        confirmText="Putuskan Sekarang"
        cancelText="Batal"
        variant="danger"
        loading={unlinking}
      />
    </div>
  );
}
