"use client";

import { useState, useEffect, useRef } from "react";
import {
  Bot,
  LifeBuoy,
  Wallet,
  Crown,
  Radio,
  Bug,
  Lightbulb,
  ShieldCheck,
  ShoppingCart,
  HelpCircle,
  Send,
  Loader2,
  RefreshCw,
  Plus,
  ArrowLeft,
  Clock,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  MessageSquare,
  Copy,
  Check,
  Search,
  Filter,
  Shield,
  Sparkles,
  ChevronRight,
  User,
} from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuthStore } from "@/store/auth-store";

// ── Types ───────────────────────────────────────────────────────────────────

interface CategoryOption {
  id: string;
  name: string;
  badge: string;
  desc: string;
  icon: any;
  color: string;
  bgLight: string;
  borderLight: string;
  welcomePrompt: string;
  quickStarters: string[];
}

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: string;
  suggested_actions?: string[];
  order_data?: any[];
}

interface SupportTicket {
  id: string;
  ticket_number: string;
  category: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  priority: "low" | "normal" | "high" | "urgent";
  subject: string;
  summary?: string | null;
  transcript?: any[];
  related_order_id?: string | null;
  escalation_reason?: string | null;
  admin_notes?: string | null;
  resolved_at?: string | null;
  created_at: string;
  updated_at: string;
}

// ── Categories Definition ───────────────────────────────────────────────────

const SUPPORT_CATEGORIES: CategoryOption[] = [
  {
    id: "isi_saldo",
    name: "Isi Saldo & Pembayaran",
    badge: "Keuangan",
    desc: "Bantuan deposit QRIS otomatis, invoice pending, bukti transfer, dan mutasi saldo dompet.",
    icon: Wallet,
    color: "text-emerald-500",
    bgLight: "bg-emerald-500/10",
    borderLight: "border-emerald-500/20",
    welcomePrompt:
      "Halo! Saya TeleBos AI Support khusus topik **Isi Saldo & Pembayaran**. Ada yang bisa saya bantu terkait transaksi deposit QRIS, konfirmasi saldo, atau mutasi akun Anda?",
    quickStarters: [
      "Bagaimana cara deposit saldo via QRIS?",
      "Invoice pembayaran saya sudah dibayar tapi saldo belum masuk",
      "Berapa minimal top-up saldo di TeleBos?",
      "Apakah ada biaya admin untuk pembayaran QRIS?",
    ],
  },
  {
    id: "subscription",
    name: "Langganan & Paket Akun",
    badge: "Membership",
    desc: "Info paket Basic, Pro, Enterprise, perpanjangan masa aktif, batas kuota broadcast.",
    icon: Crown,
    color: "text-amber-500",
    bgLight: "bg-amber-500/10",
    borderLight: "border-amber-500/20",
    welcomePrompt:
      "Halo! Saya siap membantu seputar **Paket Langganan & Membership TeleBos**. Ingin tahu perbedaan benefit paket atau cara upgrade akun?",
    quickStarters: [
      "Apa perbedaan benefit paket Basic, Pro, dan Enterprise?",
      "Bagaimana cara upgrade ke paket Pro?",
      "Kapan masa aktif langganan saya berakhir?",
      "Apakah langganan diperpanjang otomatis?",
    ],
  },
  {
    id: "broadcast",
    name: "Broadcast & Akun Telegram",
    badge: "Otomasi",
    desc: "Panduan blast pesan, format spintax, rotasi multi-akun, delay anti-banned, dan status spam.",
    icon: Radio,
    color: "text-sky-500",
    bgLight: "bg-sky-500/10",
    borderLight: "border-sky-500/20",
    welcomePrompt:
      "Halo! Saya asisten khusus **Broadcast & Manajemen Akun Telegram**. Silakan tanyakan seputar optimasi broadcast, delay aman, atau rotasi akun.",
    quickStarters: [
      "Berapa delay yang direkomendasikan agar akun tidak kena limit?",
      "Bagaimana cara menghubungkan banyak akun Telegram sekaligus?",
      "Akun saya terkena batasan SpamBot, apa yang harus dilakukan?",
      "Cara menggunakan template pesan dengan spintax",
    ],
  },
  {
    id: "report_bug",
    name: "Laporan Bug & Kendala Sistem",
    badge: "Teknis",
    desc: "Laporkan error sistem, tombol tidak merespons, glitch tampilan, atau kendala teknis fitur.",
    icon: Bug,
    color: "text-rose-500",
    bgLight: "bg-rose-500/10",
    borderLight: "border-rose-500/20",
    welcomePrompt:
      "Halo! Mohon maaf atas kendala teknis yang Anda alami. Ceritakan masalah atau pesan error yang muncul agar saya dapat menganalisis dan membantu Anda.",
    quickStarters: [
      "Halaman tidak merespons atau muncul error",
      "Gagal menghubungkan sesi akun Telegram",
      "Tombol aksi di dashboard tidak berfungsi",
      "Tampilan dashboard berantakan di layar ponsel",
    ],
  },
  {
    id: "suggestion",
    name: "Saran & Masukan Fitur",
    badge: "Feedback",
    desc: "Punya ide fitur baru atau saran penyempurnaan TeleBos? Kirimkan usulan Anda ke tim kami.",
    icon: Lightbulb,
    color: "text-yellow-500",
    bgLight: "bg-yellow-500/10",
    borderLight: "border-yellow-500/20",
    welcomePrompt:
      "Halo! Kami sangat menghargai ide dan masukan dari Anda untuk membuat TeleBos semakin hebat. Fitur atau peningkatan apa yang Anda usulkan?",
    quickStarters: [
      "Usulan fitur baru untuk sistem broadcast",
      "Saran integrasi metode pembayaran baru",
      "Masukan untuk antarmuka pengguna (UI/UX)",
      "Permintaan penambahan layanan SMM tertentu",
    ],
  },
  {
    id: "account_security",
    name: "Akun & Keamanan",
    badge: "Keamanan",
    desc: "Pengaturan 2FA, session string MTProto, bot telegram authenticator, dan privasi login.",
    icon: ShieldCheck,
    color: "text-indigo-500",
    bgLight: "bg-indigo-500/10",
    borderLight: "border-indigo-500/20",
    welcomePrompt:
      "Halo! Saya asisten keamanan TeleBos. Ingin bertanya tentang autentikasi dua faktor (2FA), menghubungkan bot Telegram, atau perlindungan akun?",
    quickStarters: [
      "Bagaimana cara menghubungkan Bot Telegram dengan token?",
      "Cara mengaktifkan Google Authenticator 2FA",
      "Apakah sesi Telegram saya tersimpan dengan aman?",
      "Bagaimana cara mengganti kata sandi akun?",
    ],
  },
  {
    id: "marketplace_smm",
    name: "Marketplace & Layanan SMM",
    badge: "Layanan",
    desc: "Pemesanan views, reactions, members Telegram, beli/jual akun, dan kebijakan refund pesanan.",
    icon: ShoppingCart,
    color: "text-purple-500",
    bgLight: "bg-purple-500/10",
    borderLight: "border-purple-500/20",
    welcomePrompt:
      "Halo! Saya siap membantu seputar **Layanan SMM & Marketplace Akun Telegram**. Anda bisa mengecek status pesanan atau menanyakan aturan refund otomatis.",
    quickStarters: [
      "Berapa lama proses pengerjaan pesanan SMM?",
      "Kenapa pesanan saya berstatus Partial?",
      "Bagaimana cara membeli akun Telegram di Marketplace?",
      "Apakah saldo otomatis di-refund jika pesanan gagal?",
    ],
  },
  {
    id: "general",
    name: "Pertanyaan Umum / Lainnya",
    badge: "Umum",
    desc: "Konsultasi seputar fitur umum platform TeleBos atau pertanyaan lainnya.",
    icon: HelpCircle,
    color: "text-blue-500",
    bgLight: "bg-blue-500/10",
    borderLight: "border-blue-500/20",
    welcomePrompt:
      "Halo! Selamat datang di TeleBos AI Support. Silakan tanyakan apa saja seputar operasional platform TeleBos, dan saya akan dengan senang hati membantu Anda.",
    quickStarters: [
      "Apa saja fitur utama platform TeleBos?",
      "Panduan awal untuk pengguna baru",
      "Bagaimana cara menghubungi admin langsung?",
      "Jam operasional dukungan pelanggan",
    ],
  },
];

export default function SupportPage() {
  const user = useAuthStore((s) => s.user);

  // Active Tab
  const [activeTab, setActiveTab] = useState<"ai-chat" | "my-tickets">("ai-chat");

  // Pre-Chat Category State
  const [selectedCategory, setSelectedCategory] = useState<CategoryOption | null>(null);

  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [canEscalate, setCanEscalate] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Tickets State
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [ticketSearch, setTicketSearch] = useState("");
  const [ticketStatusFilter, setTicketStatusFilter] = useState<string>("all");
  const [selectedTicketDetail, setSelectedTicketDetail] = useState<SupportTicket | null>(null);

  // Escalation / New Ticket Dialog State
  const [escalateDialogOpen, setEscalateDialogOpen] = useState(false);
  const [escalateSubject, setEscalateSubject] = useState("");
  const [escalateCategory, setEscalateCategory] = useState("general");
  const [escalatePriority, setEscalatePriority] = useState("normal");
  const [escalateOrderId, setEscalateOrderId] = useState("");
  const [escalateReason, setEscalateReason] = useState("");
  const [includeTranscript, setIncludeTranscript] = useState(true);
  const [isEscalating, setIsEscalating] = useState(false);

  // Copy Ticket Number state
  const [copiedTicketId, setCopiedTicketId] = useState<string | null>(null);

  // Auto-scroll chat to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isSending]);

  // Fetch Tickets
  async function fetchTickets() {
    setTicketsLoading(true);
    try {
      const res = await api.get<SupportTicket[]>("/support/tickets/my");
      setTickets(res.data);
    } catch {
      // ignore or toast
    } finally {
      setTicketsLoading(false);
    }
  }

  useEffect(() => {
    fetchTickets();
  }, []);

  // When a category is selected, initialize chat with its welcome prompt
  function handleSelectCategory(cat: CategoryOption) {
    setSelectedCategory(cat);
    setEscalateCategory(cat.id);
    setMessages([
      {
        role: "assistant",
        content: cat.welcomePrompt,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
    setCanEscalate(false);
  }

  // Reset to category picker
  function handleResetCategory() {
    setSelectedCategory(null);
    setMessages([]);
    setInputMessage("");
    setCanEscalate(false);
  }

  // Send message to AI
  async function handleSendMessage(overrideText?: string) {
    const textToSend = overrideText || inputMessage;
    if (!textToSend.trim() || isSending) return;

    const userMsg: ChatMessage = {
      role: "user",
      content: textToSend.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInputMessage("");
    setIsSending(true);

    try {
      const payloadHistory = newHistory.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await api.post("/support/chat", {
        message: textToSend.trim(),
        history: payloadHistory,
        context_page: selectedCategory ? `Kategori: ${selectedCategory.name}` : undefined,
      });

      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: res.data.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        suggested_actions: res.data.suggested_actions,
        order_data: res.data.order_data,
      };

      setMessages((prev) => [...prev, assistantMsg]);
      if (res.data.can_escalate) {
        setCanEscalate(true);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Gagal memproses pesan AI Support");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Mohon maaf, terjadi kendala koneksi ke server AI Support. Silakan coba kembali atau buat tiket bantuan jika mendesak.",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
      setCanEscalate(true);
    } finally {
      setIsSending(false);
    }
  }

  // Submit Escalation Ticket
  async function handleSubmitEscalate() {
    if (!escalateSubject.trim()) {
      toast.error("Subjek tiket wajib diisi");
      return;
    }

    setIsEscalating(true);
    try {
      const transcriptPayload = includeTranscript
        ? messages.map((m) => ({ role: m.role, content: m.content }))
        : [];

      const res = await api.post("/support/escalate", {
        subject: escalateSubject.trim(),
        category: escalateCategory,
        related_order_id: escalateOrderId.trim() || undefined,
        escalation_reason: escalateReason.trim() || undefined,
        transcript: transcriptPayload,
      });

      toast.success("Tiket Bantuan Berhasil Dibuat!", {
        description: `Nomor Tiket: ${res.data.ticket_number}. Tim Admin telah menerima notifikasi.`,
      });

      setEscalateDialogOpen(false);
      setEscalateSubject("");
      setEscalateReason("");
      setEscalateOrderId("");

      // Refresh tickets list and switch to tickets tab
      await fetchTickets();
      setActiveTab("my-tickets");
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Gagal membuat tiket bantuan");
    } finally {
      setIsEscalating(false);
    }
  }

  // Copy Ticket ID
  function handleCopyTicket(ticketNumber: string) {
    navigator.clipboard.writeText(ticketNumber);
    setCopiedTicketId(ticketNumber);
    toast.success(`Nomor tiket ${ticketNumber} disalin!`);
    setTimeout(() => setCopiedTicketId(null), 2000);
  }

  // Filtered Tickets
  const filteredTickets = tickets.filter((t) => {
    const matchesSearch =
      ticketSearch === "" ||
      t.ticket_number.toLowerCase().includes(ticketSearch.toLowerCase()) ||
      t.subject.toLowerCase().includes(ticketSearch.toLowerCase()) ||
      t.category.toLowerCase().includes(ticketSearch.toLowerCase());

    const matchesStatus =
      ticketStatusFilter === "all" || t.status === ticketStatusFilter;

    return matchesSearch && matchesStatus;
  });

  const activeTicketsCount = tickets.filter(
    (t) => t.status === "open" || t.status === "in_progress"
  ).length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* ── Page Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Bot className="h-5 w-5" />
            </span>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              Pusat Dukungan AI & Tiket
            </h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Bantuan otomatis cerdas 24/7 dan eskalasi tiket langsung ke tim admin TeleBos.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="default"
            size="sm"
            onClick={() => {
              setEscalateCategory(selectedCategory?.id || "general");
              setEscalateDialogOpen(true);
            }}
            className="gap-2 shadow-xs"
          >
            <Plus className="h-4 w-4" />
            <span>Buat Tiket Baru</span>
          </Button>
        </div>
      </div>

      {/* ── Main Tabs: AI Assistant vs My Tickets ───────────────────────────── */}
      <Tabs
        value={activeTab}
        onValueChange={(val) => setActiveTab(val as "ai-chat" | "my-tickets")}
        className="space-y-6"
      >
        <div className="flex items-center justify-between border-b border-border pb-3">
          <TabsList className="bg-muted/70 p-1">
            <TabsTrigger value="ai-chat" className="gap-2 px-4 py-2 text-xs sm:text-sm">
              <Bot className="h-4 w-4 text-sky-500" />
              <span>AI Support Chat</span>
            </TabsTrigger>
            <TabsTrigger value="my-tickets" className="gap-2 px-4 py-2 text-xs sm:text-sm relative">
              <LifeBuoy className="h-4 w-4 text-emerald-500" />
              <span>Tiket Saya</span>
              {activeTicketsCount > 0 && (
                <Badge
                  variant="destructive"
                  className="ml-1.5 h-5 px-1.5 text-[10px] font-bold rounded-full"
                >
                  {activeTicketsCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>AI Online & Siap Membantu</span>
          </div>
        </div>

        {/* ── TAB 1: AI CHAT ────────────────────────────────────────────────── */}
        <TabsContent value="ai-chat" className="mt-0 space-y-4">
          {!selectedCategory ? (
            /* ── PRE-CHAT: CATEGORY SELECTION GRID ──────────────────────────── */
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="text-center max-w-2xl mx-auto space-y-2 py-4">
                <Badge variant="secondary" className="px-3 py-1 font-medium gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  <span>Pilih Topik Terlebih Dahulu</span>
                </Badge>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  Apa yang Ingin Anda Tanyakan Hari Ini?
                </h2>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Pilih salah satu kategori di bawah ini agar TeleBos AI dapat memberikan konteks jawaban, data transaksi, dan panduan teknis yang tepat sasaran.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {SUPPORT_CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  return (
                    <Card
                      key={cat.id}
                      onClick={() => handleSelectCategory(cat)}
                      className="cursor-pointer transition-all duration-200 hover:shadow-md hover:border-primary/50 group relative overflow-hidden flex flex-col justify-between"
                    >
                      <CardHeader className="p-5 pb-3">
                        <div className="flex items-center justify-between gap-2 mb-3">
                          <span
                            className={cn(
                              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-110",
                              cat.bgLight,
                              cat.color
                            )}
                          >
                            <Icon className="h-5 w-5" />
                          </span>
                          <Badge variant="outline" className="text-[11px] font-medium border-border/70">
                            {cat.badge}
                          </Badge>
                        </div>
                        <CardTitle className="text-base font-semibold group-hover:text-primary transition-colors">
                          {cat.name}
                        </CardTitle>
                        <CardDescription className="text-xs line-clamp-2 mt-1 leading-relaxed">
                          {cat.desc}
                        </CardDescription>
                      </CardHeader>

                      <CardContent className="p-5 pt-0">
                        <div className="pt-3 border-t border-border/50 flex flex-wrap gap-1.5">
                          {cat.quickStarters.slice(0, 2).map((q, idx) => (
                            <span
                              key={idx}
                              className="text-[10px] text-muted-foreground bg-muted/70 px-2 py-0.5 rounded-md truncate max-w-full"
                            >
                              • {q}
                            </span>
                          ))}
                        </div>
                      </CardContent>

                      <div className="px-5 py-2.5 bg-muted/30 border-t border-border/40 text-[11px] font-medium text-primary flex items-center justify-between">
                        <span>Mulai Obrolan</span>
                        <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                      </div>
                    </Card>
                  );
                })}
              </div>

              {/* Bottom direct escalation banner */}
              <div className="rounded-xl border border-border/70 bg-muted/20 p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3 text-center sm:text-left">
                  <div className="rounded-lg bg-emerald-500/10 p-2.5 text-emerald-600 dark:text-emerald-400 shrink-0 hidden sm:flex">
                    <LifeBuoy className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">
                      Punya kendala mendesak atau ingin langsung ditangani Admin?
                    </h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Anda dapat melewati obrolan AI dan langsung membuat tiket bantuan ke tim teknis kami.
                    </p>
                  </div>
                </div>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => {
                    setEscalateCategory("general");
                    setEscalateDialogOpen(true);
                  }}
                  className="shrink-0 gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Buat Tiket Langsung</span>
                </Button>
              </div>
            </div>
          ) : (
            /* ── ACTIVE CHAT SESSION ────────────────────────────────────────── */
            <Card className="border border-border/70 shadow-sm overflow-hidden flex flex-col h-[700px] animate-in fade-in duration-200">
              {/* Chat Session Top Bar */}
              <div className="px-5 py-3.5 bg-card border-b border-border flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleResetCategory}
                    className="h-8 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
                    title="Kembali ke pemilihan kategori"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    <span className="hidden sm:inline">Ganti Topik</span>
                  </Button>

                  <div className="h-4 w-px bg-border hidden sm:block" />

                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "flex h-7 w-7 items-center justify-center rounded-lg text-xs",
                        selectedCategory.bgLight,
                        selectedCategory.color
                      )}
                    >
                      <selectedCategory.icon className="h-4 w-4" />
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">
                          {selectedCategory.name}
                        </span>
                        <Badge variant="secondary" className="text-[10px] py-0 px-1.5">
                          {selectedCategory.badge}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => {
                      setEscalateCategory(selectedCategory.id);
                      setEscalateDialogOpen(true);
                    }}
                    className="h-8 text-xs gap-1.5"
                  >
                    <LifeBuoy className="h-3.5 w-3.5" />
                    <span>Eskalasi ke Admin</span>
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleSelectCategory(selectedCategory)}
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    title="Bersihkan riwayat percakapan saat ini"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Chat Quick Starter Pills */}
              <div className="px-5 py-2.5 bg-muted/30 border-b border-border/50 flex items-center gap-2 overflow-x-auto scrollbar-none text-xs">
                <span className="text-muted-foreground text-[11px] shrink-0 font-medium">Saran Cepat:</span>
                {selectedCategory.quickStarters.map((starter, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleSendMessage(starter)}
                    disabled={isSending}
                    className="shrink-0 rounded-full bg-background border border-border px-3 py-1 text-xs text-foreground/80 hover:text-primary hover:border-primary/40 transition-colors shadow-2xs"
                  >
                    {starter}
                  </button>
                ))}
              </div>

              {/* Message Stream Area */}
              <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-4 bg-muted/10">
                {messages.map((msg, index) => {
                  const isUser = msg.role === "user";
                  return (
                    <div
                      key={index}
                      className={cn("flex gap-3 max-w-[85%] sm:max-w-[78%]", isUser ? "ml-auto flex-row-reverse" : "mr-auto")}
                    >
                      {/* Avatar */}
                      <span
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold select-none",
                          isUser
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted border border-border text-sky-500"
                        )}
                      >
                        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                      </span>

                      {/* Bubble */}
                      <div className="space-y-2">
                        <div
                          className={cn(
                            "rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-2xs",
                            isUser
                              ? "bg-primary text-primary-foreground rounded-tr-xs"
                              : "bg-card border border-border/80 text-foreground rounded-tl-xs"
                          )}
                        >
                          <div className="whitespace-pre-wrap">{msg.content}</div>

                          {/* Order context cards if returned by AI */}
                          {msg.order_data && msg.order_data.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-border/40 space-y-2">
                              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                                Riwayat Pesanan Terkait:
                              </span>
                              <div className="space-y-1.5">
                                {msg.order_data.map((ord: any) => (
                                  <div
                                    key={ord.id}
                                    className="p-2 rounded-lg bg-muted/60 border border-border/60 text-xs flex items-center justify-between gap-2"
                                  >
                                    <div>
                                      <p className="font-semibold text-foreground">{ord.service_name}</p>
                                      <p className="text-muted-foreground text-[11px]">
                                        Jumlah: {ord.quantity.toLocaleString()} | Target: {ord.data_target}
                                      </p>
                                    </div>
                                    <Badge variant="outline" className="text-[10px] shrink-0 font-medium">
                                      {ord.status}
                                    </Badge>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Suggested Actions pills from AI */}
                          {msg.suggested_actions && msg.suggested_actions.length > 0 && (
                            <div className="mt-3 pt-2.5 border-t border-border/40 flex flex-wrap gap-1.5">
                              {msg.suggested_actions.map((act, idx) => (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => handleSendMessage(act)}
                                  className="text-[11px] bg-muted/80 text-primary border border-primary/20 px-2.5 py-1 rounded-md hover:bg-primary/10 transition"
                                >
                                  {act}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className={cn("text-[10px] text-muted-foreground px-1", isUser ? "text-right" : "text-left")}>
                          {msg.timestamp}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Typing Indicator */}
                {isSending && (
                  <div className="flex gap-3 max-w-[75%] mr-auto items-center">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted border border-border text-sky-500">
                      <Bot className="h-4 w-4" />
                    </span>
                    <div className="rounded-2xl rounded-tl-xs px-4 py-3 bg-card border border-border/80 flex items-center gap-1.5 text-muted-foreground">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" />
                      <span className="text-xs ml-1.5">TeleBos AI sedang mengetik...</span>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Escalation Prompt Footer Banner if needed */}
              {canEscalate && (
                <div className="px-5 py-2.5 bg-amber-500/10 border-t border-amber-500/20 flex items-center justify-between gap-3 text-xs text-amber-800 dark:text-amber-300">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>Jawaban AI belum menyelesaikan masalah Anda?</span>
                  </div>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => {
                      setEscalateCategory(selectedCategory.id);
                      setEscalateDialogOpen(true);
                    }}
                    className="h-7 text-xs"
                  >
                    Buka Tiket Admin
                  </Button>
                </div>
              )}

              {/* Chat Input Bar */}
              <div className="p-3.5 sm:p-4 bg-card border-t border-border space-y-2">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendMessage();
                  }}
                  className="flex items-end gap-2"
                >
                  <Textarea
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    placeholder={`Tanyakan seputar ${selectedCategory.name}... (Tekan Enter untuk kirim)`}
                    className="min-h-[50px] max-h-[140px] resize-none text-sm leading-relaxed"
                    disabled={isSending}
                  />

                  <Button
                    type="submit"
                    disabled={!inputMessage.trim() || isSending}
                    className="h-[50px] px-5 gap-2 font-medium shrink-0"
                  >
                    {isSending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    <span className="hidden sm:inline">Kirim</span>
                  </Button>
                </form>

                <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
                  <span>
                    🔒 <strong>Privasi Terjaga:</strong> Jangan membagikan kode OTP atau kredensial rahasia Telegram.
                  </span>
                  <span>Shift + Enter untuk baris baru</span>
                </div>
              </div>
            </Card>
          )}
        </TabsContent>

        {/* ── TAB 2: MY TICKETS ─────────────────────────────────────────────── */}
        <TabsContent value="my-tickets" className="mt-0 space-y-6">
          {/* Stats Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Total Tiket Dibuat</p>
                <p className="text-2xl font-bold text-foreground mt-0.5">{tickets.length}</p>
              </div>
              <span className="p-2.5 rounded-xl bg-primary/10 text-primary">
                <MessageSquare className="h-5 w-5" />
              </span>
            </Card>

            <Card className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Sedang Diproses (Aktif)</p>
                <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-0.5">
                  {tickets.filter((t) => t.status === "open" || t.status === "in_progress").length}
                </p>
              </div>
              <span className="p-2.5 rounded-xl bg-amber-500/10 text-amber-500">
                <Clock className="h-5 w-5" />
              </span>
            </Card>

            <Card className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Terselesaikan</p>
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {tickets.filter((t) => t.status === "resolved" || t.status === "closed").length}
                </p>
              </div>
              <span className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-500">
                <CheckCircle2 className="h-5 w-5" />
              </span>
            </Card>
          </div>

          {/* Filters & Actions Bar */}
          <Card className="p-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex flex-1 items-center gap-2">
                <div className="relative flex-1 max-w-sm">
                  <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Cari nomor tiket, subjek, kategori..."
                    value={ticketSearch}
                    onChange={(e) => setTicketSearch(e.target.value)}
                    className="pl-9 text-xs sm:text-sm h-9"
                  />
                </div>

                <Select value={ticketStatusFilter} onValueChange={setTicketStatusFilter}>
                  <SelectTrigger className="w-[140px] sm:w-[160px] h-9 text-xs">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Status</SelectItem>
                    <SelectItem value="open">Open (Baru)</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="default"
                  size="sm"
                  onClick={fetchTickets}
                  disabled={ticketsLoading}
                  className="h-9 px-3 gap-1.5 text-xs"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", ticketsLoading && "animate-spin")} />
                  <span>Refresh</span>
                </Button>

                <Button
                  size="sm"
                  onClick={() => {
                    setEscalateCategory("general");
                    setEscalateDialogOpen(true);
                  }}
                  className="h-9 gap-1.5 text-xs font-medium"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Buat Tiket</span>
                </Button>
              </div>
            </div>
          </Card>

          {/* Tickets Table / List */}
          <Card className="overflow-hidden border border-border/80">
            {ticketsLoading ? (
              <div className="p-12 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="text-xs">Memuat daftar tiket bantuan...</span>
              </div>
            ) : filteredTickets.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <LifeBuoy className="h-6 w-6" />
                </div>
                <h3 className="text-sm font-semibold text-foreground">Tidak Ada Tiket Bantuan</h3>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  {ticketSearch || ticketStatusFilter !== "all"
                    ? "Tidak ditemukan tiket dengan filter pencarian tersebut."
                    : "Anda belum memiliki tiket bantuan. Butuh bantuan teknis? Mulai chat dengan AI atau buat tiket baru."}
                </p>
                <div className="pt-2">
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => {
                      setEscalateCategory("general");
                      setEscalateDialogOpen(true);
                    }}
                    className="text-xs gap-1.5"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Buat Tiket Bantuan
                  </Button>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[170px]">No. Tiket</TableHead>
                      <TableHead>Subjek</TableHead>
                      <TableHead className="w-[140px]">Kategori</TableHead>
                      <TableHead className="w-[120px]">Status</TableHead>
                      <TableHead className="w-[100px]">Prioritas</TableHead>
                      <TableHead className="w-[140px]">Dibuat</TableHead>
                      <TableHead className="text-right w-[100px]">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTickets.map((t) => {
                      const isCopied = copiedTicketId === t.ticket_number;
                      return (
                        <TableRow key={t.id} className="hover:bg-muted/40">
                          <TableCell className="font-mono text-xs font-medium">
                            <div className="flex items-center gap-1.5">
                              <span>{t.ticket_number}</span>
                              <button
                                type="button"
                                onClick={() => handleCopyTicket(t.ticket_number)}
                                className="text-muted-foreground hover:text-foreground transition p-0.5 rounded"
                                title="Salin nomor tiket"
                              >
                                {isCopied ? (
                                  <Check className="h-3 w-3 text-emerald-500" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </button>
                            </div>
                          </TableCell>

                          <TableCell>
                            <div className="font-medium text-xs sm:text-sm text-foreground line-clamp-1">
                              {t.subject}
                            </div>
                            {t.summary && (
                              <div className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                                {t.summary}
                              </div>
                            )}
                          </TableCell>

                          <TableCell>
                            <Badge variant="secondary" className="text-[11px] font-normal capitalize">
                              {t.category.replace("_", " ")}
                            </Badge>
                          </TableCell>

                          <TableCell>
                            {t.status === "open" && (
                              <Badge variant="outline" className="text-blue-600 dark:text-blue-400 border-blue-500/30 bg-blue-500/10 text-[10px]">
                                🔵 Baru (Open)
                              </Badge>
                            )}
                            {t.status === "in_progress" && (
                              <Badge variant="outline" className="text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/10 text-[10px]">
                                🟡 Diproses
                              </Badge>
                            )}
                            {t.status === "resolved" && (
                              <Badge variant="outline" className="text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10 text-[10px]">
                                🟢 Selesai
                              </Badge>
                            )}
                            {t.status === "closed" && (
                              <Badge variant="outline" className="text-muted-foreground border-border text-[10px]">
                                ⚪ Ditutup
                              </Badge>
                            )}
                          </TableCell>

                          <TableCell>
                            <span
                              className={cn(
                                "text-[11px] font-medium capitalize",
                                t.priority === "urgent" && "text-rose-600 font-bold",
                                t.priority === "high" && "text-amber-600",
                                t.priority === "normal" && "text-muted-foreground",
                                t.priority === "low" && "text-muted-foreground/80"
                              )}
                            >
                              {t.priority}
                            </span>
                          </TableCell>

                          <TableCell className="text-xs text-muted-foreground">
                            {new Date(t.created_at).toLocaleDateString("id-ID", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                          </TableCell>

                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedTicketDetail(t)}
                              className="h-8 text-xs text-primary hover:text-primary hover:bg-primary/10"
                            >
                              Detail
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── DIALOG: CREATE / ESCALATE SUPPORT TICKET ─────────────────────────── */}
      <Dialog open={escalateDialogOpen} onOpenChange={setEscalateDialogOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <LifeBuoy className="h-5 w-5 text-primary" />
              <span>Buat Tiket Dukungan Admin</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Tiket ini akan diteruskan langsung ke antrean admin TeleBos dan mengirimkan alert prioritas via Telegram Bot.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">
                Kategori Masalah <span className="text-destructive">*</span>
              </label>
              <Select value={escalateCategory} onValueChange={setEscalateCategory}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Pilih kategori" />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORT_CATEGORIES.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="text-xs">
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">
                Subjek Tiket <span className="text-destructive">*</span>
              </label>
              <Input
                placeholder="Contoh: Saldo QRIS belum masuk setelah 15 menit"
                value={escalateSubject}
                onChange={(e) => setEscalateSubject(e.target.value)}
                className="h-9 text-xs sm:text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Tingkat Prioritas</label>
                <Select value={escalatePriority} onValueChange={setEscalatePriority}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Prioritas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low" className="text-xs">Rendah (Low)</SelectItem>
                    <SelectItem value="normal" className="text-xs">Normal</SelectItem>
                    <SelectItem value="high" className="text-xs">Tinggi (High)</SelectItem>
                    <SelectItem value="urgent" className="text-xs">Mendesak (Urgent)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">No. Invoice / Order (Opsional)</label>
                <Input
                  placeholder="ID Order / TRX"
                  value={escalateOrderId}
                  onChange={(e) => setEscalateOrderId(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">
                Detail Penjelasan Kendala (Opsional)
              </label>
              <Textarea
                placeholder="Jelaskan detail kendala Anda agar admin dapat langsung memverifikasi..."
                value={escalateReason}
                onChange={(e) => setEscalateReason(e.target.value)}
                className="text-xs min-h-[85px] leading-relaxed"
              />
            </div>

            {messages.length > 1 && (
              <div className="p-3 rounded-lg bg-muted/60 border border-border/60 flex items-center justify-between text-xs">
                <div>
                  <p className="font-medium text-foreground">Lampirkan Riwayat Chat AI</p>
                  <p className="text-[11px] text-muted-foreground">
                    Sertakan {messages.length} pesan obrolan agar admin memahami konteks.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={includeTranscript}
                  onChange={(e) => setIncludeTranscript(e.target.checked)}
                  className="h-4 w-4 rounded accent-primary cursor-pointer"
                />
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() => setEscalateDialogOpen(false)}
            >
              Batal
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSubmitEscalate}
              disabled={isEscalating || !escalateSubject.trim()}
              className="gap-2"
            >
              {isEscalating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LifeBuoy className="h-4 w-4" />
              )}
              Kirim Tiket ke Admin
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── DIALOG: VIEW TICKET DETAIL & TRANSCRIPT ─────────────────────────── */}
      <Dialog
        open={Boolean(selectedTicketDetail)}
        onOpenChange={(open) => !open && setSelectedTicketDetail(null)}
      >
        <DialogContent className="sm:max-w-[620px] max-h-[85vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-center justify-between gap-3 pr-6">
              <DialogTitle className="text-base font-bold flex items-center gap-2">
                <span>Tiket {selectedTicketDetail?.ticket_number}</span>
                <Badge variant="secondary" className="text-xs font-normal">
                  {selectedTicketDetail?.category.replace("_", " ")}
                </Badge>
              </DialogTitle>
              <Badge
                variant="outline"
                className={cn(
                  "text-xs capitalize",
                  selectedTicketDetail?.status === "resolved" && "text-emerald-600 bg-emerald-500/10 border-emerald-500/30",
                  selectedTicketDetail?.status === "in_progress" && "text-amber-600 bg-amber-500/10 border-amber-500/30",
                  selectedTicketDetail?.status === "open" && "text-blue-600 bg-blue-500/10 border-blue-500/30"
                )}
              >
                {selectedTicketDetail?.status}
              </Badge>
            </div>
            <DialogDescription className="text-xs">
              Dibuat pada {selectedTicketDetail && new Date(selectedTicketDetail.created_at).toLocaleString("id-ID")}
            </DialogDescription>
          </DialogHeader>

          {selectedTicketDetail && (
            <div className="flex-1 overflow-y-auto space-y-4 py-2 text-xs">
              <div className="rounded-xl bg-muted/40 border border-border/60 p-4 space-y-2">
                <div>
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase">Subjek Tiket:</span>
                  <p className="text-sm font-semibold text-foreground mt-0.5">{selectedTicketDetail.subject}</p>
                </div>

                {selectedTicketDetail.escalation_reason && (
                  <div className="pt-2 border-t border-border/40">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase">Penjelasan Pengguna:</span>
                    <p className="text-xs text-foreground/90 mt-0.5 leading-relaxed">
                      {selectedTicketDetail.escalation_reason}
                    </p>
                  </div>
                )}

                {selectedTicketDetail.related_order_id && (
                  <div className="pt-2 border-t border-border/40 text-[11px]">
                    <span className="font-semibold text-muted-foreground">ID Order Terkait: </span>
                    <span className="font-mono text-foreground">{String(selectedTicketDetail.related_order_id)}</span>
                  </div>
                )}
              </div>

              {/* Admin Feedback Notes */}
              {selectedTicketDetail.admin_notes ? (
                <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-4 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300 font-semibold text-xs">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Catatan / Tindak Lanjut dari Admin:</span>
                  </div>
                  <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">
                    {selectedTicketDetail.admin_notes}
                  </p>
                </div>
              ) : (
                <div className="rounded-lg bg-muted/30 border border-border/40 p-3 text-muted-foreground text-[11px] flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 text-amber-500" />
                  <span>Admin sedang meninjau tiket ini. Respons atau solusi akan muncul di sini.</span>
                </div>
              )}

              {/* Transcript Accordion / List */}
              {selectedTicketDetail.transcript && selectedTicketDetail.transcript.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-border/40">
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <MessageSquare className="h-3.5 w-3.5 text-primary" />
                    Lampiran Percakapan AI Support ({selectedTicketDetail.transcript.length} pesan)
                  </span>

                  <div className="max-h-[240px] overflow-y-auto space-y-2 p-3 rounded-lg bg-muted/30 border border-border/50">
                    {selectedTicketDetail.transcript.map((item: any, idx: number) => {
                      const isUserRole = item.role === "user";
                      return (
                        <div
                          key={idx}
                          className={cn(
                            "p-2.5 rounded-lg text-xs leading-relaxed",
                            isUserRole
                              ? "bg-primary/10 border border-primary/20 text-foreground ml-4"
                              : "bg-card border border-border text-foreground mr-4"
                          )}
                        >
                          <span className="font-bold text-[10px] text-muted-foreground block mb-0.5 uppercase">
                            {isUserRole ? "👤 Pengguna" : "🤖 TeleBos AI"}
                          </span>
                          <p className="whitespace-pre-wrap">{item.content}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="pt-2 border-t border-border">
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() => setSelectedTicketDetail(null)}
            >
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
