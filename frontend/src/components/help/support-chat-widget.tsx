"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Bot,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  HelpCircle,
  Loader2,
  LogIn,
  Minimize2,
  RefreshCw,
  Send,
  Shield,
  Sparkles,
  Trash2,
  User,
  X,
} from "lucide-react";

import { useSession } from "@/lib/auth-client";
import { getSessionToken } from "@/lib/api";
import { useT } from "@/lib/i18n";

export interface OrderItem {
  id: string;
  service_name: string;
  category: string;
  data_target: string;
  quantity: number;
  status: string;
  price?: number;
  remains?: number | null;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  orders?: OrderItem[];
  canEscalate?: boolean;
}

export function SupportChatWidget() {
  const _ = useT();
  const { data: session, isPending: isAuthPending } = useSession();

  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Escalation modal / inline state
  const [showEscalationForm, setShowEscalationForm] = useState(false);
  const [escalateSubject, setEscalateSubject] = useState("");
  const [escalateReason, setEscalateReason] = useState("");
  const [guestName, setGuestName] = useState("");
  const [guestContact, setGuestContact] = useState("");
  const [isEscalating, setIsEscalating] = useState(false);
  const [escalationSuccessTicket, setEscalationSuccessTicket] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isAuthenticated = !!session?.user;
  const userName = session?.user?.name || session?.user?.email?.split("@")[0] || "User";

  // Auto-scroll to bottom of messages
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen, isLoading]);

  // Initial welcome message
  useEffect(() => {
    if (messages.length === 0) {
      const welcomeText = isAuthenticated
        ? `Halo **${userName}**! 👋\nAda kendala dengan akun, fitur broadcast, atau pesanan SMM Anda hari ini? Tanyakan saja di sini, saya siap membantu.`
        : `Halo! 👋 Selamat datang di **TeleBos Help Desk**.\nSaya adalah asisten AI yang dapat membantu menjelaskan cara kerja platform, panduan broadcast, atau menjawab pertanyaan umum seputar TeleBos.\n\n*(Catatan: Jika ingin mengecek pesanan atau saldo akun Anda, silakan Login terlebih dahulu).*`;

      setMessages([
        {
          id: "welcome-1",
          role: "assistant",
          content: welcomeText,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    }
  }, [isAuthenticated, userName, messages.length]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputMessage).trim();
    if (!text || isLoading) return;

    const userMsgId = `user-${Date.now()}`;
    const newMsg: ChatMessage = {
      id: userMsgId,
      role: "user",
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, newMsg]);
    setInputMessage("");
    setIsLoading(true);

    try {
      const historyPayload = messages.slice(-6).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      const token = getSessionToken();
      if (token) {
        headers["x-better-auth-token"] = token;
      }

      const res = await fetch("/api/v1/support/chat", {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({
          message: text,
          history: historyPayload,
          context_page: typeof window !== "undefined" ? window.location.pathname : "/help",
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      const botMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: data.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        orders: data.order_data || undefined,
        canEscalate: data.can_escalate || false,
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content:
            "Mohon maaf, terjadi kendala saat menghubungi server AI. Anda dapat mencoba kembali atau langsung klik **Hubungi Admin** jika butuh bantuan segera.",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          canEscalate: true,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEscalateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!escalateSubject.trim()) return;

    setIsEscalating(true);
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      const token = getSessionToken();
      if (token) {
        headers["x-better-auth-token"] = token;
      }

      const transcriptPayload = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch("/api/v1/support/escalate", {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({
          subject: escalateSubject,
          category: "general",
          escalation_reason: escalateReason || "User meminta eskalasi manual",
          guest_name: !isAuthenticated ? guestName : undefined,
          guest_contact: !isAuthenticated ? guestContact : undefined,
          transcript: transcriptPayload,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || "Gagal membuat tiket");
      }

      const ticketData = await res.json();
      setEscalationSuccessTicket(ticketData.ticket_number);
      setShowEscalationForm(false);

      // Add confirmation to chat
      setMessages((prev) => [
        ...prev,
        {
          id: `esc-confirm-${Date.now()}`,
          role: "assistant",
          content: `✅ **Tiket Bantuan Berhasil Dibuat!**\nNo. Tiket: **#${ticketData.ticket_number}**\n\nTim admin kami telah menerima notifikasi dan ringkasan percakapan ini. Kami akan segera meninjau dan merespons kendala Anda.`,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } catch (err: any) {
      alert(err.message || "Gagal mengirim tiket eskalasi.");
    } finally {
      setIsEscalating(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const clearChat = () => {
    setMessages([]);
    setEscalationSuccessTicket(null);
    setShowEscalationForm(false);
  };

  // Render markdown bold and bullets simply
  const renderFormattedContent = (content: string) => {
    return content.split("\n").map((line, i) => {
      // Bold replacement
      const parts = line.split(/(\*\*.*?\*\*)/g);
      const renderedParts = parts.map((part, pIdx) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={pIdx} className="font-semibold text-slate-100">
              {part.slice(2, -2)}
            </strong>
          );
        }
        return part;
      });

      if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
        return (
          <li key={i} className="ml-4 list-disc text-xs leading-relaxed text-slate-300">
            {renderedParts}
          </li>
        );
      }
      return (
        <p key={i} className="min-h-[1rem] text-xs leading-relaxed text-slate-200">
          {renderedParts}
        </p>
      );
    });
  };

  const getStatusBadge = (status: string) => {
    const s = status.toLowerCase();
    if (s.includes("success") || s.includes("completed")) {
      return (
        <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 className="h-3 w-3" /> Selesai
        </span>
      );
    }
    if (s.includes("process") || s.includes("progress")) {
      return (
        <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400 border border-amber-500/20">
          <Clock className="h-3 w-3 animate-spin" /> Proses
        </span>
      );
    }
    if (s.includes("partial")) {
      return (
        <span className="inline-flex items-center gap-1 rounded bg-orange-500/10 px-1.5 py-0.5 text-[10px] font-medium text-orange-400 border border-orange-500/20">
          <AlertCircle className="h-3 w-3" /> Sebagian (Refund)
        </span>
      );
    }
    if (s.includes("error") || s.includes("cancel")) {
      return (
        <span className="inline-flex items-center gap-1 rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-400 border border-red-500/20">
          <AlertCircle className="h-3 w-3" /> Gagal (Refund)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded bg-slate-500/10 px-1.5 py-0.5 text-[10px] font-medium text-slate-300 border border-slate-500/20">
        <Clock className="h-3 w-3" /> {status}
      </span>
    );
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {/* Floating launcher trigger */}
      {!isOpen && (
        <button
          onClick={() => {
            setIsOpen(true);
            setTimeout(() => inputRef.current?.focus(), 150);
          }}
          className="group relative flex h-14 items-center gap-3 rounded-full border border-blue-500/30 bg-slate-900/90 px-4 text-white shadow-2xl backdrop-blur-md transition-all duration-300 hover:scale-105 hover:border-blue-500 hover:shadow-blue-500/20 active:scale-95"
          aria-label="Buka AI Support"
        >
          <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 text-white shadow-inner">
            <Bot className="h-5 w-5" />
            <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
            </span>
          </div>
          <div className="text-left pr-1">
            <p className="text-xs font-semibold leading-tight text-white group-hover:text-blue-300 transition-colors">
              {_("help.aiSupportTitle")}
            </p>
            <p className="text-[10px] leading-tight text-slate-400">
              {_("help.aiSupportOnline")}
            </p>
          </div>
        </button>
      )}

      {/* Main chat window container */}
      {isOpen && (
        <div className="flex h-[560px] w-[380px] max-w-[calc(100vw-2rem)] flex-col rounded-2xl border border-slate-800 bg-slate-950/95 shadow-2xl backdrop-blur-xl transition-all duration-300 animate-in fade-in slide-in-from-bottom-5">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800/80 px-4 py-3 bg-slate-900/40 rounded-t-2xl">
            <div className="flex items-center gap-2.5">
              <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white shadow">
                <Bot className="h-4 w-4" />
                <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-slate-900" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="text-xs font-semibold text-white">{_("help.aiSupport")}</h3>
                  <span className="rounded bg-blue-500/10 px-1 py-0.2 text-[9px] font-medium text-blue-400 border border-blue-500/20">
                    AI
                  </span>
                </div>
                <p className="text-[10px] text-emerald-400 flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {_("help.aiSupportOnline")}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={clearChat}
                title={_("help.aiSupportClearChat")}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
                aria-label="Tutup"
              >
                <Minimize2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* User Status Bar */}
          <div className="flex items-center justify-between border-b border-slate-800/60 bg-slate-900/20 px-3.5 py-1.5 text-[11px]">
            {isAuthenticated ? (
              <div className="flex items-center gap-1.5 text-slate-300">
                <User className="h-3 w-3 text-blue-400" />
                <span className="font-medium text-white truncate max-w-[170px]">{userName}</span>
                <span className="rounded bg-emerald-500/10 px-1 text-[9px] text-emerald-400 border border-emerald-500/20">
                  Terhubung
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-between w-full">
                <span className="text-slate-400 flex items-center gap-1">
                  <Shield className="h-3 w-3 text-amber-400" />
                  {_("help.aiSupportGuest")}
                </span>
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-400 hover:text-blue-300 hover:underline"
                >
                  <LogIn className="h-2.5 w-2.5" /> Login
                </Link>
              </div>
            )}

            {isAuthenticated && (
              <button
                onClick={() => {
                  setEscalateSubject("Kendala Akun / Pesanan TeleBos");
                  setShowEscalationForm(true);
                }}
                className="text-[10px] text-blue-400 hover:text-blue-300 hover:underline ml-auto"
              >
                {_("help.aiSupportEscalate")}
              </button>
            )}
          </div>

          {/* Chat Messages Body */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3.5 text-xs scrollbar-thin scrollbar-thumb-slate-800">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 shadow-sm space-y-1.5 ${
                    msg.role === "user"
                      ? "bg-blue-600 text-white rounded-tr-none"
                      : "bg-slate-900/90 text-slate-200 border border-slate-800/80 rounded-tl-none"
                  }`}
                >
                  {renderFormattedContent(msg.content)}

                  {/* Render Order Cards if attached */}
                  {msg.orders && msg.orders.length > 0 && (
                    <div className="mt-2.5 space-y-2 border-t border-slate-800/80 pt-2">
                      <p className="text-[10px] font-semibold text-blue-300 flex items-center gap-1">
                        📦 {_("help.aiSupportRecentOrders")}
                      </p>
                      {msg.orders.map((ord) => (
                        <div
                          key={ord.id}
                          className="rounded-lg border border-slate-800 bg-slate-950/70 p-2.5 text-[11px] space-y-1.5"
                        >
                          <div className="flex items-start justify-between gap-1">
                            <span className="font-semibold text-white line-clamp-1">
                              {ord.service_name}
                            </span>
                            {getStatusBadge(ord.status)}
                          </div>
                          <div className="text-[10px] text-slate-400 flex items-center justify-between">
                            <span className="truncate max-w-[180px]">Target: {ord.data_target}</span>
                            <span>Qty: {ord.quantity.toLocaleString()}</span>
                          </div>
                          <div className="flex items-center justify-between border-t border-slate-800/50 pt-1 text-[9px] text-slate-500">
                            <span>ID: #{ord.id.slice(0, 8)}</span>
                            <button
                              onClick={() => copyToClipboard(ord.id, ord.id)}
                              className="text-slate-400 hover:text-white flex items-center gap-0.5"
                            >
                              {copiedId === ord.id ? (
                                <Check className="h-2.5 w-2.5 text-emerald-400" />
                              ) : (
                                <Copy className="h-2.5 w-2.5" />
                              )}
                              Salin ID
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Prompt for Escalation if flagged */}
                  {msg.canEscalate && !showEscalationForm && (
                    <div className="mt-2 border-t border-slate-800/70 pt-2 flex items-center justify-between">
                      <span className="text-[10px] text-slate-400">Masih ada kendala?</span>
                      <button
                        onClick={() => {
                          setEscalateSubject(msg.content.slice(0, 60));
                          setShowEscalationForm(true);
                        }}
                        className="rounded-md bg-blue-500/10 border border-blue-500/30 px-2 py-1 text-[10px] font-medium text-blue-300 hover:bg-blue-500/20 transition-colors"
                      >
                        🆘 {_("help.aiSupportEscalateBtn")}
                      </button>
                    </div>
                  )}
                </div>
                <span className="mt-1 px-1 text-[9px] text-slate-500">{msg.timestamp}</span>
              </div>
            ))}

            {/* Typing indicator */}
            {isLoading && (
              <div className="flex items-center gap-2 text-slate-400 bg-slate-900/60 border border-slate-800/60 rounded-xl px-3 py-2 w-fit">
                <Loader2 className="h-3 w-3 animate-spin text-blue-400" />
                <span className="text-[11px]">AI sedang menganalisis jawaban...</span>
              </div>
            )}

            {/* Inline Escalation Form */}
            {showEscalationForm && (
              <div className="rounded-xl border border-blue-500/30 bg-slate-900/95 p-3.5 space-y-2.5 animate-in fade-in">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-white flex items-center gap-1.5">
                    <Shield className="h-3.5 w-3.5 text-blue-400" />
                    Eskalasi ke Admin Manusia
                  </h4>
                  <button
                    onClick={() => setShowEscalationForm(false)}
                    className="text-slate-400 hover:text-white"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="text-[11px] text-slate-300">
                  {_("help.aiSupportEscalateDesc")}
                </p>

                <form onSubmit={handleEscalateSubmit} className="space-y-2">
                  <div>
                    <label className="text-[10px] font-medium text-slate-400 block mb-0.5">
                      Subjek Kendala
                    </label>
                    <input
                      type="text"
                      required
                      value={escalateSubject}
                      onChange={(e) => setEscalateSubject(e.target.value)}
                      placeholder="Contoh: Pesanan SMM macet / Gagal broadcast"
                      className="w-full rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                    />
                  </div>

                  {!isAuthenticated && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-medium text-slate-400 block mb-0.5">
                          Nama Anda
                        </label>
                        <input
                          type="text"
                          required
                          value={guestName}
                          onChange={(e) => setGuestName(e.target.value)}
                          placeholder="Nama"
                          className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-medium text-slate-400 block mb-0.5">
                          Email / Telegram
                        </label>
                        <input
                          type="text"
                          required
                          value={guestContact}
                          onChange={(e) => setGuestContact(e.target.value)}
                          placeholder="@username / email"
                          className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowEscalationForm(false)}
                      className="rounded-md border border-slate-700 px-2.5 py-1 text-[11px] text-slate-300 hover:bg-slate-800"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      disabled={isEscalating}
                      className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1 text-[11px] font-medium text-white hover:bg-blue-500 disabled:opacity-50"
                    >
                      {isEscalating ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" /> Mengirim...
                        </>
                      ) : (
                        "Kirim ke Admin"
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Action Suggestion Chips */}
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto border-t border-slate-800/60 bg-slate-900/30 px-3 py-2">
            {isAuthenticated ? (
              <>
                <button
                  onClick={() => handleSendMessage("Cek status pesanan SMM terakhir saya dong")}
                  className="shrink-0 rounded-full border border-slate-800 bg-slate-900 px-2.5 py-1 text-[10px] text-slate-300 hover:border-blue-500/50 hover:text-white transition-colors"
                >
                  📦 Cek Pesanan Terakhir
                </button>
                <button
                  onClick={() => handleSendMessage("Kenapa broadcast saya sering flood wait?")}
                  className="shrink-0 rounded-full border border-slate-800 bg-slate-900 px-2.5 py-1 text-[10px] text-slate-300 hover:border-blue-500/50 hover:text-white transition-colors"
                >
                  ⚡ Masalah Broadcast
                </button>
                <button
                  onClick={() => {
                    setEscalateSubject("Permintaan Bantuan Admin");
                    setShowEscalationForm(true);
                  }}
                  className="shrink-0 rounded-full border border-slate-800 bg-slate-900 px-2.5 py-1 text-[10px] text-slate-300 hover:border-blue-500/50 hover:text-white transition-colors"
                >
                  🆘 Hubungi Admin
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="shrink-0 rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-[10px] text-blue-300 hover:bg-blue-500/20 transition-colors"
                >
                  🔑 Login Akun
                </Link>
                <button
                  onClick={() => handleSendMessage("Bagaimana cara menghubungkan akun Telegram di TeleBos?")}
                  className="shrink-0 rounded-full border border-slate-800 bg-slate-900 px-2.5 py-1 text-[10px] text-slate-300 hover:border-blue-500/50 hover:text-white transition-colors"
                >
                  📖 Cara Tambah Akun
                </button>
                <button
                  onClick={() => {
                    setEscalateSubject("Pertanyaan Calon Pengguna");
                    setShowEscalationForm(true);
                  }}
                  className="shrink-0 rounded-full border border-slate-800 bg-slate-900 px-2.5 py-1 text-[10px] text-slate-300 hover:border-blue-500/50 hover:text-white transition-colors"
                >
                  🆘 Hubungi Admin
                </button>
              </>
            )}
          </div>

          {/* Input Footer */}
          <div className="border-t border-slate-800/80 bg-slate-950 p-3 rounded-b-2xl">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-center gap-2"
            >
              <input
                ref={inputRef}
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder={_("help.aiSupportPlaceholder")}
                disabled={isLoading}
                className="flex-1 rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!inputMessage.trim() || isLoading}
                className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-white transition-all hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600"
                aria-label={_("help.aiSupportSend")}
              >
                {isLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
              </button>
            </form>
            <p className="mt-1.5 text-center text-[9px] text-slate-500">
              {_("help.aiSupportDisclaimer")}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
