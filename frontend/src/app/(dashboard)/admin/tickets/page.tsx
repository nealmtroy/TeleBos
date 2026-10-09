"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Filter,
  LifeBuoy,
  Loader2,
  MessageSquare,
  RefreshCw,
  Search,
  Shield,
  User,
  X,
} from "lucide-react";

import api from "@/lib/api";
import { useT } from "@/lib/i18n";

interface TranscriptItem {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: string;
}

interface SupportTicket {
  id: string;
  ticket_number: string;
  user_id?: string | null;
  user_email?: string | null;
  guest_name?: string | null;
  guest_contact?: string | null;
  category: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  priority: "low" | "normal" | "high" | "urgent";
  subject: string;
  summary?: string | null;
  transcript: TranscriptItem[];
  related_order_id?: string | null;
  escalation_reason?: string | null;
  admin_notes?: string | null;
  created_at: string;
  updated_at: string;
}

export default function AdminTicketsPage() {
  const _ = useT();

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);

  // Edit state for drawer
  const [newStatus, setNewStatus] = useState<string>("open");
  const [newPriority, setNewPriority] = useState<string>("normal");
  const [adminNotes, setAdminNotes] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const fetchTickets = async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = { limit: 100 };
      if (statusFilter !== "all") {
        params.status = statusFilter;
      }
      const res = await api.get("/support/admin/tickets", { params });
      setTickets(res.data);
    } catch (err) {
      console.error("Failed to load tickets", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, [statusFilter]);

  const handleOpenDetail = (ticket: SupportTicket) => {
    setSelectedTicket(ticket);
    setNewStatus(ticket.status);
    setNewPriority(ticket.priority);
    setAdminNotes(ticket.admin_notes || "");
  };

  const handleSaveTicket = async () => {
    if (!selectedTicket) return;
    setSaving(true);
    try {
      const res = await api.patch(`/support/admin/tickets/${selectedTicket.id}`, {
        status: newStatus,
        priority: newPriority,
        admin_notes: adminNotes,
      });
      // Update in local state
      setTickets((prev) =>
        prev.map((t) => (t.id === selectedTicket.id ? res.data : t))
      );
      setSelectedTicket(res.data);
      alert("Status tiket berhasil diperbarui!");
    } catch (err: any) {
      alert(err.response?.data?.detail || "Gagal memperbarui tiket");
    } finally {
      setSaving(false);
    }
  };

  const filteredTickets = tickets.filter((t) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      t.ticket_number.toLowerCase().includes(q) ||
      t.subject.toLowerCase().includes(q) ||
      (t.user_email && t.user_email.toLowerCase().includes(q)) ||
      (t.guest_name && t.guest_name.toLowerCase().includes(q)) ||
      (t.guest_contact && t.guest_contact.toLowerCase().includes(q))
    );
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "open":
        return (
          <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400 border border-amber-500/20">
            <Clock className="h-3 w-3" /> Open
          </span>
        );
      case "in_progress":
        return (
          <span className="inline-flex items-center gap-1 rounded bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-400 border border-blue-500/20">
            <RefreshCw className="h-3 w-3 animate-spin" /> In Progress
          </span>
        );
      case "resolved":
        return (
          <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="h-3 w-3" /> Resolved
          </span>
        );
      case "closed":
        return (
          <span className="inline-flex items-center gap-1 rounded bg-slate-500/10 px-2 py-0.5 text-xs font-medium text-slate-400 border border-slate-500/20">
            Closed
          </span>
        );
      default:
        return <span>{status}</span>;
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "urgent":
        return (
          <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-bold text-red-400 border border-red-500/30">
            URGENT
          </span>
        );
      case "high":
        return (
          <span className="rounded bg-orange-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-orange-400 border border-orange-500/30">
            HIGH
          </span>
        );
      case "normal":
        return (
          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-300">
            NORMAL
          </span>
        );
      case "low":
        return (
          <span className="rounded bg-slate-800/60 px-1.5 py-0.5 text-[10px] text-slate-400">
            LOW
          </span>
        );
      default:
        return <span>{priority}</span>;
    }
  };

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <LifeBuoy className="h-6 w-6 text-blue-400" />
            Tiket Bantuan (AI Support Escalations)
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Pantau dan tindak lanjuti eskalasi tiket pertanyaan dan kendala pengguna yang dialihkan oleh AI Support.
          </p>
        </div>
        <button
          onClick={fetchTickets}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 transition-colors"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-blue-400" : ""}`} />
          Segarkan Data
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1.5 overflow-x-auto rounded-lg bg-slate-900/60 p-1 border border-slate-800 text-xs">
          {["all", "open", "in_progress", "resolved", "closed"].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                statusFilter === st
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
              }`}
            >
              {st.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari tiket, email, subjek..."
            className="w-full rounded-lg border border-slate-800 bg-slate-900/80 pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Tickets Table */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Loader2 className="h-7 w-7 animate-spin text-blue-400 mb-2" />
            <p className="text-xs">Memuat antrean tiket bantuan...</p>
          </div>
        ) : filteredTickets.length === 0 ? (
          <div className="py-20 text-center text-slate-500">
            <LifeBuoy className="h-10 w-10 mx-auto mb-2 text-slate-600" />
            <p className="text-sm font-medium text-slate-300">Tidak ada tiket bantuan ditemukan</p>
            <p className="text-xs text-slate-500 mt-1">Semua kendala terselesaikan atau belum ada eskalasi baru.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-semibold">
                <tr>
                  <th className="px-4 py-3">Tiket #</th>
                  <th className="px-4 py-3">Pengirim</th>
                  <th className="px-4 py-3">Subjek & Alasan</th>
                  <th className="px-4 py-3">Prioritas</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Waktu Dibuat</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {filteredTickets.map((ticket) => (
                  <tr key={ticket.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3 font-mono font-semibold text-blue-400">
                      #{ticket.ticket_number}
                    </td>
                    <td className="px-4 py-3">
                      {ticket.user_id ? (
                        <div className="space-y-0.5">
                          <span className="font-medium text-white flex items-center gap-1">
                            <User className="h-3 w-3 text-blue-400" /> Member
                          </span>
                          <span className="text-[11px] text-slate-400 block truncate max-w-[150px]">
                            {ticket.user_email || ticket.user_id}
                          </span>
                        </div>
                      ) : (
                        <div className="space-y-0.5">
                          <span className="font-medium text-amber-400 flex items-center gap-1">
                            <Shield className="h-3 w-3" /> Tamu ({ticket.guest_name || "Anon"})
                          </span>
                          <span className="text-[11px] text-slate-400 block truncate max-w-[150px]">
                            {ticket.guest_contact || "Tanpa Kontak"}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <p className="font-semibold text-white truncate">{ticket.subject}</p>
                      <p className="text-[11px] text-slate-400 line-clamp-1">
                        {ticket.escalation_reason || ticket.summary || "Bantuan AI"}
                      </p>
                    </td>
                    <td className="px-4 py-3">{getPriorityBadge(ticket.priority)}</td>
                    <td className="px-4 py-3">{getStatusBadge(ticket.status)}</td>
                    <td className="px-4 py-3 text-slate-400">
                      {new Date(ticket.created_at).toLocaleString("id-ID", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleOpenDetail(ticket)}
                        className="rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-200 hover:border-blue-500 hover:text-white transition-colors"
                      >
                        Detail & Balas
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail & Response Drawer Modal */}
      {selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="flex h-[90vh] max-h-[750px] w-full max-w-3xl flex-col rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4 bg-slate-900/40">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-blue-600/20 p-2 text-blue-400 border border-blue-500/30">
                  <LifeBuoy className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    Tiket #{selectedTicket.ticket_number}
                    {getStatusBadge(selectedTicket.status)}
                  </h3>
                  <p className="text-xs text-slate-400">{selectedTicket.subject}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedTicket(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
              {/* Meta Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl border border-slate-800 bg-slate-900/30 p-3.5">
                <div>
                  <span className="text-slate-500 block text-[10px]">PENGIRIM</span>
                  <span className="font-semibold text-slate-200">
                    {selectedTicket.user_id
                      ? `User: ${selectedTicket.user_email || selectedTicket.user_id}`
                      : `Tamu: ${selectedTicket.guest_name} (${selectedTicket.guest_contact})`}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">KATEGORI</span>
                  <span className="font-semibold text-slate-200 uppercase">
                    {selectedTicket.category}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">ORDER TERKAIT</span>
                  <span className="font-semibold text-slate-200">
                    {selectedTicket.related_order_id ? `#${selectedTicket.related_order_id}` : "-"}
                  </span>
                </div>
              </div>

              {/* Chat Transcript Timeline */}
              <div className="space-y-3">
                <h4 className="font-semibold text-white flex items-center gap-1.5 text-xs">
                  <MessageSquare className="h-3.5 w-3.5 text-blue-400" />
                  Transkrip Percakapan dengan AI Support
                </h4>
                <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
                  {selectedTicket.transcript && selectedTicket.transcript.length > 0 ? (
                    selectedTicket.transcript.map((msg, idx) => (
                      <div
                        key={idx}
                        className={`flex flex-col ${
                          msg.role === "user" ? "items-end" : "items-start"
                        }`}
                      >
                        <span className="text-[10px] text-slate-500 mb-0.5">
                          {msg.role === "user" ? "Pengguna" : "AI Support"}
                        </span>
                        <div
                          className={`max-w-[85%] rounded-xl px-3 py-2 text-xs ${
                            msg.role === "user"
                              ? "bg-blue-600 text-white"
                              : "bg-slate-850 border border-slate-800 text-slate-200"
                          }`}
                        >
                          {msg.content}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-slate-500 italic">Tidak ada transkrip pesan tersimpan.</p>
                  )}
                </div>
              </div>

              {/* Admin Management Section */}
              <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                <h4 className="font-semibold text-white flex items-center gap-1.5 text-xs">
                  <Shield className="h-3.5 w-3.5 text-emerald-400" />
                  Tindakan & Catatan Admin
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-medium text-slate-400 block mb-1">
                      Status Tiket
                    </label>
                    <select
                      value={newStatus}
                      onChange={(e) => setNewStatus(e.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white focus:border-blue-500 focus:outline-none"
                    >
                      <option value="open">Open (Menunggu Tindakan)</option>
                      <option value="in_progress">In Progress (Sedang Ditangani)</option>
                      <option value="resolved">Resolved (Terselesaikan)</option>
                      <option value="closed">Closed (Ditutup)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-slate-400 block mb-1">
                      Prioritas
                    </label>
                    <select
                      value={newPriority}
                      onChange={(e) => setNewPriority(e.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white focus:border-blue-500 focus:outline-none"
                    >
                      <option value="low">Low</option>
                      <option value="normal">Normal</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-medium text-slate-400 block mb-1">
                    Catatan Internal / Resolusi
                  </label>
                  <textarea
                    rows={3}
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    placeholder="Tuliskan catatan tindak lanjut, kompensasi yang diberikan, atau nomor resi..."
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2.5 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-2 border-t border-slate-800 bg-slate-900/60 px-6 py-3">
              <button
                type="button"
                onClick={() => setSelectedTicket(null)}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800"
              >
                Tutup
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleSaveTicket}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Menyimpan...
                  </>
                ) : (
                  "Simpan Perubahan"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
