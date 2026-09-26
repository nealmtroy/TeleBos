"use client";

import { useState, Suspense, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useT } from "@/lib/i18n";
import { useAccounts } from "@/hooks/use-accounts";
import {
  useContacts,
  useContactDetail,
  useDeleteContact,
  useImportContacts,
  downloadContactsExport,
  type ContactItem,
  type ContactImportItem,
} from "@/hooks/use-contacts";
import { cn } from "@/lib/utils";
import { ChatRowSkeleton } from "@/components/ui/skeleton-cards";
import { ChatAvatar } from "@/components/chat/ChatAvatar";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAuthStore } from "@/store/auth-store";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import {
  Users,
  Search,
  Shield,
  Loader2,
  Phone,
  AtSign,
  Info,
  MessageCircle,
  UserCheck,
  UserX,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Send,
  Upload,
  Download,
  FileSpreadsheet,
  FileText,
  FileCode,
  X,
  CheckCircle2,
  AlertCircle,
  Plus,
} from "lucide-react";

export default function ContactsPage() {
  const user = useAuthStore((s) => s.user);

  // Role check: basic users cannot access contacts
  if (user?.role === "basic") {
    return (
      <div className="text-center py-16">
        <Shield className="h-16 w-16 mx-auto mb-4 text-gray-300" />
        <h3 className="font-semibold text-gray-900 mb-1">Access Denied</h3>
        <p className="text-sm text-gray-500">Contacts feature is not available for your plan. Upgrade to Pro or Premium to access this feature.</p>
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      }
    >
      <ContactsContent />
    </Suspense>
  );
}

function ContactsContent() {
  const searchParams = useSearchParams();
  const { data: accounts } = useAccounts();
  const [selectedAccount, setSelectedAccount] = useState<string>(
    searchParams.get("account") || ""
  );
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [selectedContactId, setSelectedContactId] = useState<number | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ContactItem | null>(null);
  const _ = useT();
  const { toast } = useToast();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // ── Import / Export State ──────────────────────────────────────────────────
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [importTab, setImportTab] = useState<"manual" | "file">("manual");
  const [importText, setImportText] = useState("");
  const [parsedContacts, setParsedContacts] = useState<ContactImportItem[]>([]);
  const [isParsingFile, setIsParsingFile] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<"csv" | "vcf" | "json" | null>(null);

  const importMutation = useImportContacts(selectedAccount);

  const getApiUrl = useCallback(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "/api/v1";
    if (typeof window !== "undefined" && apiUrl.includes("backend:8000")) {
      return "/api/v1";
    }
    return apiUrl;
  }, []);

  // Auto-select first account
  useEffect(() => {
    const activeAccs = Array.isArray(accounts) ? accounts.filter((acc) => acc.is_active && !acc.for_sale) : [];
    const isSelectedActive = activeAccs.some(acc => acc.id === selectedAccount);
    if (activeAccs.length > 0 && (!selectedAccount || !isSelectedActive)) {
      setSelectedAccount(activeAccs[0].id);
    }
  }, [accounts, selectedAccount]);

  // Reset selection when account changes
  useEffect(() => {
    setSelectedContactId(null);
    setPage(1);
    setSearch("");
  }, [selectedAccount]);

  // ── Fetch contacts ──────────────────────────────────────────────────────
  const {
    data: contactsData,
    isLoading,
    error,
    refetch,
  } = useContacts(selectedAccount, page, 50, search || undefined);

  const contacts = Array.isArray(contactsData?.contacts) ? contactsData.contacts : [];
  const total = contactsData?.total ?? 0;

  // ── Fetch contact detail ────────────────────────────────────────────────
  const {
    data: contactDetail,
    isLoading: detailLoading,
    error: detailError,
  } = useContactDetail(selectedAccount, selectedContactId);

  // ── Delete mutation ─────────────────────────────────────────────────────
  const deleteMutation = useDeleteContact(selectedAccount);

  function handleConfirmDelete() {
    if (deleteTarget) {
      deleteMutation.mutate(deleteTarget.contact_id, {
        onSuccess: () => {
          if (selectedContactId === deleteTarget.contact_id) {
            setSelectedContactId(null);
          }
        },
      });
    }
    setDeleteOpen(false);
    setDeleteTarget(null);
  }

  function handleDeleteClick(e: React.MouseEvent, contact: ContactItem) {
    e.stopPropagation();
    setDeleteTarget(contact);
    setDeleteOpen(true);
  }

  const totalPages = Math.max(1, Math.ceil(total / 50));

  // ── Parser logic ───────────────────────────────────────────────────────────
  function parseTextLines(text: string): ContactImportItem[] {
    const lines = text.split("\n");
    const results: ContactImportItem[] = [];
    const seenPhones = new Set<string>();

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      // Delimiter could be comma, tab, or semicolon
      const parts = line.split(/[,;\t]/).map((p) => p.trim());
      const rawPhone = parts[0];
      // Clean phone: keep '+' if at start, strip out formatting
      const cleanPhone = rawPhone.replace(/[^\d+]/g, "");
      if (cleanPhone.length < 6 || seenPhones.has(cleanPhone)) continue;

      seenPhones.add(cleanPhone);
      const firstName = parts[1] || "";
      const lastName = parts.slice(2).join(" ") || "";

      results.push({
        phone: cleanPhone,
        first_name: firstName || undefined,
        last_name: lastName || undefined,
      });
    }
    return results;
  }

  // Update parsed items when manual text changes
  useEffect(() => {
    if (importTab === "manual") {
      setParsedContacts(parseTextLines(importText));
    }
  }, [importText, importTab]);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsingFile(true);
    try {
      const content = await file.text();
      const ext = file.name.split(".").pop()?.toLowerCase();

      if (ext === "vcf") {
        // Parse vCard format
        const vcards = content.split(/BEGIN:VCARD/i).slice(1);
        const list: ContactImportItem[] = [];
        const seenPhones = new Set<string>();

        for (const vcard of vcards) {
          const telMatch = vcard.match(/TEL[^:]*:([^\r\n]+)/i);
          const fnMatch = vcard.match(/FN[^:]*:([^\r\n]+)/i);
          const nMatch = vcard.match(/N[^:]*:([^\r\n]+)/i);

          if (telMatch) {
            const rawPhone = telMatch[1].trim();
            const cleanPhone = rawPhone.replace(/[^\d+]/g, "");
            if (cleanPhone.length >= 6 && !seenPhones.has(cleanPhone)) {
              seenPhones.add(cleanPhone);
              let first = "";
              let last = "";

              if (fnMatch) {
                const names = fnMatch[1].trim().split(" ");
                first = names[0];
                last = names.slice(1).join(" ");
              } else if (nMatch) {
                const parts = nMatch[1].split(";");
                last = parts[0]?.trim() || "";
                first = parts[1]?.trim() || "";
              }

              list.push({
                phone: cleanPhone,
                first_name: first || undefined,
                last_name: last || undefined,
              });
            }
          }
        }
        setParsedContacts(list);
      } else {
        // CSV or TXT file
        setParsedContacts(parseTextLines(content));
      }
    } catch (err) {
      console.error(err);
      toast({
        variant: "error",
        title: "File Parse Error",
        description: "Gagal membaca file kontak. Pastikan format file valid (.csv, .vcf, .txt).",
      });
    } finally {
      setIsParsingFile(false);
    }
  }

  async function handleExecuteImport() {
    if (parsedContacts.length === 0) return;
    try {
      const res = await importMutation.mutateAsync(parsedContacts);
      toast({
        variant: "success",
        title: _("contacts.importSuccess", { count: String(res.imported_count) }),
        description: `${res.imported_count} dari ${res.total_submitted} kontak berhasil ditambahkan.`,
      });
      setImportOpen(false);
      setImportText("");
      setParsedContacts([]);
      refetch();
    } catch (err: any) {
      console.error(err);
      toast({
        variant: "error",
        title: "Import Gagal",
        description: err?.response?.data?.detail || "Terjadi kesalahan saat mengimpor kontak ke Telegram.",
      });
    }
  }

  async function handleExecuteExport(fmt: "csv" | "vcf" | "json") {
    if (!selectedAccount) return;
    setExportingFormat(fmt);
    try {
      await downloadContactsExport(selectedAccount, fmt);
      toast({
        variant: "success",
        title: "Download Dimulai",
        description: `Kontak akun berhasil diekspor sebagai .${fmt}`,
      });
      setExportOpen(false);
    } catch (err: any) {
      console.error(err);
      toast({
        variant: "error",
        title: "Ekspor Gagal",
        description: err?.response?.data?.detail || "Gagal mengunduh kontak dari server.",
      });
    } finally {
      setExportingFormat(null);
    }
  }

  return (
    <>
    <div className="flex h-[calc(100vh-7rem)] -m-6 bg-white dark:bg-slate-800 rounded-xl overflow-hidden border border-gray-200 dark:border-slate-700 shadow-sm">
      {/* ── Left Panel: Contact List ────────────────────────────────────── */}
      <div
        className={cn(
          "flex flex-col border-r border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 transition-all duration-200",
          selectedContactId ? "hidden md:flex w-[360px] flex-shrink-0" : "flex-1 md:w-[360px] md:flex-shrink-0"
        )}
      >
        {/* List Header */}
        <div className="p-4 border-b border-gray-100 dark:border-slate-700 space-y-3">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold text-gray-900 dark:text-slate-100">{_("contacts.title")}</h1>
            {selectedAccount && (
              <span className="text-xs text-gray-400 dark:text-slate-400 bg-gray-50 dark:bg-slate-700/60 px-2 py-0.5 rounded-full">
                {_("contacts.contactsCount", { count: String(total) })}
              </span>
            )}
          </div>

          <select
            value={selectedAccount}
            onChange={(e) => setSelectedAccount(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none bg-gray-50 dark:bg-slate-900 text-gray-700 dark:text-slate-200"
          >
            <option value="">{_("contacts.selectAccount")}</option>
            {(Array.isArray(accounts) ? accounts.filter((acc) => acc.is_active && !acc.for_sale) : []).map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.first_name || acc.phone}
              </option>
            ))}
          </select>

          {/* Action buttons: Import & Export */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={!selectedAccount}
              onClick={() => {
                setParsedContacts([]);
                setImportText("");
                setImportOpen(true);
              }}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-700 hover:bg-gray-50 dark:hover:bg-slate-600 text-xs font-semibold text-gray-700 dark:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-xs transition"
            >
              <Upload className="h-3.5 w-3.5 text-primary-600 dark:text-primary-400" />
              {_("contacts.importContacts")}
            </button>
            <button
              type="button"
              disabled={!selectedAccount || total === 0}
              onClick={() => setExportOpen(true)}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-700 hover:bg-gray-50 dark:hover:bg-slate-600 text-xs font-semibold text-gray-700 dark:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-xs transition"
            >
              <Download className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              {_("contacts.exportContacts")}
            </button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder={_("contacts.search")}
              className="w-full pl-9 pr-4 py-2 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg text-sm text-gray-900 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-primary-500 outline-none"
            />
          </div>
        </div>

        {/* Contact list body */}
        <div className="flex-1 overflow-y-auto">
          {!selectedAccount ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <Users className="h-10 w-10 text-gray-200 mb-3" />
              <p className="text-sm text-gray-400">
                {Array.isArray(accounts) && accounts.length > 0
                  ? _("contacts.selectAccount")
                  : _("contacts.noAccounts")}
              </p>
            </div>
          ) : isLoading ? (
            <div className="divide-y divide-gray-50">
              {Array.from({ length: 8 }).map((_, i) => (
                <ChatRowSkeleton key={i} />
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <p className="text-sm text-red-400 mb-2">{_("contacts.failedToLoad")}</p>
              <button
                onClick={() => refetch()}
                className="text-sm text-primary-600 hover:underline"
              >
                {_("contacts.retry")}
              </button>
            </div>
          ) : contacts.length === 0 ? (
            <div className="flex items-center justify-center h-full text-sm text-gray-400">
              {_("contacts.noContacts")}
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {contacts.map((contact) => {
                const isSelected = selectedContactId === contact.contact_id;

                return (
                  <button
                    key={contact.contact_id}
                    onClick={() => setSelectedContactId(contact.contact_id)}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 w-full text-left transition-colors duration-150",
                      isSelected ? "bg-primary-50 hover:bg-primary-50" : "hover:bg-gray-50"
                    )}
                  >
                    {/* Avatar */}
                    <ChatAvatar
                      accountId={selectedAccount}
                      chatId={contact.contact_id}
                      chatTitle={contact.first_name}
                      chatType="user"
                      photoVersion={contact.photo_version}
                      sizeClassName="w-11 h-11 text-sm font-bold"
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold truncate text-gray-900">
                          {contact.first_name}
                          {contact.last_name ? ` ${contact.last_name}` : ""}
                        </h3>
                        {contact.mutual && (
                          <UserCheck className="h-3.5 w-3.5 text-green-500 flex-shrink-0 ml-1" />
                        )}
                      </div>
                      <p className="text-xs text-gray-400 truncate mt-0.5">
                        {contact.username ? `@${contact.username}` : contact.phone || ""}
                      </p>
                    </div>
                  </button>
                );
              })}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 py-3">
                  <button
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page <= 1}
                    className="p-1.5 rounded-md border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="h-4 w-4 text-gray-500" />
                  </button>
                  <span className="text-xs text-gray-400">
                    {_("contacts.page")} {page} / {totalPages}
                  </span>
                  <button
                    onClick={() => setPage(page + 1)}
                    disabled={page >= totalPages}
                    className="p-1.5 rounded-md border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="h-4 w-4 text-gray-500" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Right Panel: Contact Detail ──────────────────────────────────── */}
      <div
        className={cn(
          "flex-1 flex flex-col bg-gray-50 dark:bg-slate-900/50 min-w-0",
          !selectedContactId && "hidden md:flex"
        )}
      >
        {selectedContactId ? (
          <>
            {/* Detail Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex-shrink-0">
              <button
                onClick={() => setSelectedContactId(null)}
                className="md:hidden p-1.5 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition"
              >
                <ArrowLeft className="h-5 w-5 text-gray-500 dark:text-slate-400" />
              </button>
              <h2 className="text-sm font-bold text-gray-900 dark:text-slate-100">
                {_("contacts.title")}
              </h2>
            </div>

            {/* Detail body */}
            <div className="flex-1 overflow-y-auto p-6">
              {detailLoading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-300 dark:text-slate-600" />
                </div>
              ) : detailError ? (
                <div className="flex items-center justify-center py-20 text-sm text-red-400">
                  {_("contacts.failedToLoad")}
                </div>
              ) : contactDetail ? (
                <div className="max-w-md mx-auto space-y-6">
                  {/* Avatar & Name */}
                  <div className="flex flex-col items-center text-center">
                    <ChatAvatar
                      accountId={selectedAccount}
                      chatId={selectedContactId}
                      chatTitle={contactDetail.first_name}
                      chatType="user"
                      photoVersion={contactDetail.photo_version}
                      sizeClassName="w-24 h-24 text-3xl font-bold"
                      className="shadow-lg mb-4"
                    />
                    <h2 className="text-xl font-bold text-gray-900 dark:text-slate-100">
                      {contactDetail.first_name}
                      {contactDetail.last_name ? ` ${contactDetail.last_name}` : ""}
                    </h2>
                    {contactDetail.username && (
                      <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
                        @{contactDetail.username}
                      </p>
                    )}

                    {/* Mutual badge */}
                    <div className="mt-2">
                      {contactDetail.mutual ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 dark:bg-green-950/40 px-2.5 py-0.5 rounded-full border border-green-200 dark:border-green-800/60">
                          <UserCheck className="h-3.5 w-3.5" />
                          {_("contacts.mutual")}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-slate-400 bg-gray-100 dark:bg-slate-700 px-2.5 py-0.5 rounded-full">
                          <UserX className="h-3.5 w-3.5" />
                          {_("contacts.notMutual")}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Info Card */}
                  <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 divide-y divide-gray-100 dark:divide-slate-700 shadow-sm">
                    {/* Phone */}
                    <div className="flex items-center gap-3 px-4 py-3.5">
                      <Phone className="h-4 w-4 text-gray-400 dark:text-slate-400 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs text-gray-400 dark:text-slate-400">{_("contacts.phone")}</p>
                        <p className="text-sm font-medium text-gray-800 dark:text-slate-100">
                          {contactDetail.phone || "—"}
                        </p>
                      </div>
                    </div>

                    {/* Username */}
                    <div className="flex items-center gap-3 px-4 py-3.5">
                      <AtSign className="h-4 w-4 text-gray-400 dark:text-slate-400 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs text-gray-400 dark:text-slate-400">{_("contacts.username")}</p>
                        <p className="text-sm font-medium text-gray-800 dark:text-slate-100">
                          {contactDetail.username
                            ? `@${contactDetail.username}`
                            : "—"}
                        </p>
                      </div>
                    </div>

                    {/* About / Bio */}
                    <div className="flex items-start gap-3 px-4 py-3.5">
                      <Info className="h-4 w-4 text-gray-400 dark:text-slate-400 flex-shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-xs text-gray-400 dark:text-slate-400">{_("contacts.about")}</p>
                        <p className="text-sm font-medium text-gray-800 dark:text-slate-100 whitespace-pre-wrap">
                          {contactDetail.about || "—"}
                        </p>
                      </div>
                    </div>
                    {/* Common Chats */}
                    <div className="flex items-center gap-3 px-4 py-3.5">
                      <MessageCircle className="h-4 w-4 text-gray-400 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs text-gray-400">{_("contacts.commonChats")}</p>
                        <p className="text-sm font-medium text-gray-800">
                          {contactDetail.common_chats_count}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* ── Chat Button ───────────────────────────────────── */}
                  <div className="flex flex-col gap-2">
                    <Link
                      href={`/chats?account=${selectedAccount}&chat=${selectedContactId}`}
                      className="inline-flex items-center justify-center gap-2 w-full px-4 py-3 bg-primary-600 text-white rounded-xl font-semibold text-sm hover:bg-primary-700 transition shadow-sm hover:shadow-md active:scale-[0.98]"
                    >
                      <Send className="h-4 w-4" />
                      {_("contacts.sendMessage")}
                    </Link>
                  </div>
                </div>
              ) : null}
            </div>
          </>
        ) : (
          /* Empty state */
          <div className="flex flex-col items-center justify-center h-full text-center px-8">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary-100 to-primary-200 flex items-center justify-center mb-5">
              <Users className="h-9 w-9 text-primary-500" />
            </div>
            <h2 className="text-xl font-bold text-gray-800 dark:text-slate-100 mb-2">
              {_("contacts.selectContact")}
            </h2>
            <p className="text-sm text-gray-400 dark:text-slate-400 max-w-xs">
              {_("contacts.selectContactDesc")}
            </p>
          </div>
        )}
      </div>
    </div>

    <ConfirmDialog
      open={deleteOpen}
      onOpenChange={setDeleteOpen}
      onConfirm={handleConfirmDelete}
      title={_("contacts.delete")}
      message={_("contacts.deleteConfirm", {
        name:
          deleteTarget?.first_name ||
          deleteTarget?.username ||
          _("contacts.unknown"),
      })}
      confirmText={_("contacts.delete")}
      cancelText={_("navbar.cancel")}
      variant="danger"
    />

    {/* ── Import Contacts Modal ─────────────────────────────────────────── */}
    {importOpen &&
      typeof document !== "undefined" &&
      createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-900/40">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-950/40 border border-primary-100 dark:border-primary-800 flex items-center justify-center text-primary-600 dark:text-primary-400">
                  <Upload className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-slate-100">{_("contacts.importContacts")}</h3>
                  <p className="text-xs text-gray-500 dark:text-slate-400">{_("contacts.importContactsDesc")}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setImportOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 dark:text-slate-400 hover:text-gray-600 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Tab switch */}
            <div className="px-5 pt-4">
              <div className="flex rounded-xl bg-gray-100 dark:bg-slate-900 p-1 border border-gray-200/60 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setImportTab("manual")}
                  className={cn(
                    "flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all",
                    importTab === "manual" ? "bg-white dark:bg-slate-700 text-gray-900 dark:text-white shadow-xs" : "text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200"
                  )}
                >
                  {_("contacts.bulkInput")}
                </button>
                <button
                  type="button"
                  onClick={() => setImportTab("file")}
                  className={cn(
                    "flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all",
                    importTab === "file" ? "bg-white dark:bg-slate-700 text-gray-900 dark:text-white shadow-xs" : "text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200"
                  )}
                >
                  {_("contacts.uploadFile")} (.csv, .vcf, .txt)
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              {importTab === "manual" ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-gray-700 dark:text-slate-200">
                      Masukkan Nomor & Nama (1 per baris):
                    </label>
                    <span className="text-[11px] font-mono text-gray-500 dark:text-slate-400 bg-gray-100 dark:bg-slate-700 px-2 py-0.5 rounded-md">
                      Format: nomor, nama depan, nama belakang
                    </span>
                  </div>
                  <textarea
                    rows={6}
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    placeholder={"+628123456789, Budi, Santoso\n+628987654321, Siti\n+628111222333"}
                    className="w-full p-3 font-mono text-xs border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none leading-relaxed"
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <label className="block text-xs font-semibold text-gray-700">Pilih File Kontak</label>
                  <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-200 hover:border-primary-400 bg-gray-50/50 hover:bg-primary-50/20 rounded-xl p-6 cursor-pointer transition">
                    <Upload className="h-8 w-8 text-gray-400 mb-2" />
                    <span className="text-xs font-medium text-gray-700">Klik untuk memilih file kontak</span>
                    <span className="text-[11px] text-gray-400 mt-1">Mendukung format .CSV, .VCF (vCard), .TXT</span>
                    <input
                      type="file"
                      accept=".csv,.vcf,.txt"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                  {isParsingFile && (
                    <div className="flex items-center justify-center gap-2 text-xs text-primary-600 py-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Sedang membaca dan mem-parse file...</span>
                    </div>
                  )}
                </div>
              )}

              {/* Preview of Parsed Contacts */}
              {parsedContacts.length > 0 && (
                <div className="space-y-2 border border-emerald-100 bg-emerald-50/30 rounded-xl p-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-emerald-800 flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      {parsedContacts.length} Kontak Siap Diimpor
                    </span>
                    <span className="text-[11px] text-emerald-600 font-medium">Pratinjau (Maks 5 pertama)</span>
                  </div>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {parsedContacts.slice(0, 5).map((c, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-lg border border-emerald-100 text-xs"
                      >
                        <span className="font-mono font-semibold text-gray-900">{c.phone}</span>
                        <span className="text-gray-500 truncate max-w-[180px]">
                          {c.first_name || ""} {c.last_name || ""}
                        </span>
                      </div>
                    ))}
                    {parsedContacts.length > 5 && (
                      <p className="text-[11px] text-gray-400 text-center pt-1 italic">
                        +{parsedContacts.length - 5} kontak lainnya
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between p-4 border-t border-gray-100 bg-gray-50">
              <span className="text-xs text-gray-500">
                Akun: <strong className="text-gray-800">{accounts?.find((a) => a.id === selectedAccount)?.phone || "—"}</strong>
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setImportOpen(false)}
                  className="rounded-xl text-xs"
                >
                  Batal
                </Button>
                <Button
                  size="sm"
                  disabled={parsedContacts.length === 0 || importMutation.isPending}
                  onClick={handleExecuteImport}
                  className="rounded-xl text-xs font-semibold"
                >
                  {importMutation.isPending ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      {_("contacts.importing")}
                    </>
                  ) : (
                    <>
                      <Upload className="h-3.5 w-3.5 mr-1.5" />
                      Impor ({parsedContacts.length})
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

    {/* ── Export Contacts Modal ─────────────────────────────────────────── */}
    {exportOpen &&
      typeof document !== "undefined" &&
      createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 w-full max-w-md overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-900/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-800/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                  <Download className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-slate-100">{_("contacts.exportContacts")}</h3>
                  <p className="text-xs text-gray-500 dark:text-slate-400">{_("contacts.exportContactsDesc")}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setExportOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-3">
              <p className="text-xs text-gray-600 dark:text-slate-300">
                Total <strong className="text-gray-900 dark:text-slate-100">{total} kontak</strong> akan diekspor dari akun Telegram ini:
              </p>

              {/* Format options */}
              <div className="space-y-2">
                <button
                  type="button"
                  disabled={exportingFormat !== null}
                  onClick={() => handleExecuteExport("csv")}
                  className="w-full flex items-center justify-between p-3.5 rounded-xl border border-gray-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-500 hover:bg-emerald-50/20 dark:hover:bg-emerald-950/20 text-left transition group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 flex items-center justify-center">
                      <FileSpreadsheet className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Format CSV (.csv)</p>
                      <p className="text-xs text-gray-400 dark:text-slate-400">Cocok untuk Excel, Google Sheets, atau aplikasi spreadsheet</p>
                    </div>
                  </div>
                  {exportingFormat === "csv" ? (
                    <Loader2 className="h-4 w-4 animate-spin text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <Download className="h-4 w-4 text-gray-400 dark:text-slate-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition" />
                  )}
                </button>

                <button
                  type="button"
                  disabled={exportingFormat !== null}
                  onClick={() => handleExecuteExport("vcf")}
                  className="w-full flex items-center justify-between p-3.5 rounded-xl border border-gray-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-500 hover:bg-blue-50/20 dark:hover:bg-blue-950/20 text-left transition group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 flex items-center justify-center">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Format vCard / VCF (.vcf)</p>
                      <p className="text-xs text-gray-400 dark:text-slate-400">Dapat langsung diimpor ke kontak HP (Android / iOS)</p>
                    </div>
                  </div>
                  {exportingFormat === "vcf" ? (
                    <Loader2 className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400" />
                  ) : (
                    <Download className="h-4 w-4 text-gray-400 dark:text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition" />
                  )}
                </button>

                <button
                  type="button"
                  disabled={exportingFormat !== null}
                  onClick={() => handleExecuteExport("json")}
                  className="w-full flex items-center justify-between p-3.5 rounded-xl border border-gray-200 dark:border-slate-700 hover:border-purple-300 dark:hover:border-purple-500 hover:bg-purple-50/20 dark:hover:bg-purple-950/20 text-left transition group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 flex items-center justify-center">
                      <FileCode className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Format JSON (.json)</p>
                      <p className="text-xs text-gray-400 dark:text-slate-400">Data mentah terstruktur untuk developer / integrasi API</p>
                    </div>
                  </div>
                  {exportingFormat === "json" ? (
                    <Loader2 className="h-4 w-4 animate-spin text-purple-600 dark:text-purple-400" />
                  ) : (
                    <Download className="h-4 w-4 text-gray-400 dark:text-slate-400 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition" />
                  )}
                </button>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end p-4 border-t border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setExportOpen(false)}
                className="rounded-xl text-xs dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Tutup
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
