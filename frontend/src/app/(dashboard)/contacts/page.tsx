"use client";

import { useState, Suspense, useEffect, useCallback, useMemo } from "react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { DataPagination } from "@/components/ui/pagination";
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
    <div className="flex h-[calc(100vh-7rem)] -m-6 bg-white dark:bg-slate-900 overflow-hidden border-t border-gray-200 dark:border-slate-800">
      {/* ── Left Panel: Contact List ────────────────────────────────────── */}
      <div
        className={cn(
          "flex flex-col border-r border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 transition-colors duration-150",
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

          <Select
            value={selectedAccount || "_none"}
            onValueChange={(val) => setSelectedAccount(val === "_none" ? "" : val)}
          >
            <SelectTrigger className="w-full h-10 px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg text-sm bg-gray-50 dark:bg-slate-900 text-gray-700 dark:text-slate-200">
              <SelectValue placeholder={_("contacts.selectAccount")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">{_("contacts.selectAccount")}</SelectItem>
              {(Array.isArray(accounts) ? accounts.filter((acc) => acc.is_active && !acc.for_sale) : []).map((acc) => (
                <SelectItem key={acc.id} value={acc.id}>
                  {acc.first_name || acc.phone}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

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
              id="contacts-search"
              name="search"
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder={_("contacts.search")}
              aria-label={_("contacts.search")}
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
                <div className="py-2 border-t border-gray-100 dark:border-slate-800">
                  <DataPagination
                    page={page}
                    totalPages={totalPages}
                    onPageChange={setPage}
                    compact
                  />
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
    <Dialog open={importOpen} onOpenChange={setImportOpen}>
      <DialogContent className="max-w-lg p-0 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <DialogHeader className="p-5 border-b border-gray-100 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-900/40 flex flex-row items-center justify-between text-left space-y-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-950/40 border border-primary-100 dark:border-primary-800 flex items-center justify-center text-primary-600 dark:text-primary-400 shrink-0">
              <Upload className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-gray-900 dark:text-slate-100">
                {_("contacts.importContacts")}
              </DialogTitle>
              <DialogDescription className="text-xs text-gray-500 dark:text-slate-400">
                {_("contacts.importContactsDesc")}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Tab switch */}
        <div className="px-5 pt-4">
          <Tabs
            value={importTab}
            onValueChange={(val) => setImportTab(val as "manual" | "file")}
            className="w-full"
          >
            <TabsList className="w-full grid grid-cols-2 rounded-xl bg-gray-100 dark:bg-slate-900 p-1 border border-gray-200/60 dark:border-slate-700 h-auto">
              <TabsTrigger
                value="manual"
                className="py-1.5 text-xs font-semibold rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 data-[state=active]:text-gray-900 dark:data-[state=active]:text-white data-[state=active]:shadow-xs"
              >
                {_("contacts.bulkInput")}
              </TabsTrigger>
              <TabsTrigger
                value="file"
                className="py-1.5 text-xs font-semibold rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 data-[state=active]:text-gray-900 dark:data-[state=active]:text-white data-[state=active]:shadow-xs"
              >
                {_("contacts.uploadFile")} (.csv, .vcf, .txt)
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {importTab === "manual" ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="contacts-import-text" className="text-xs font-semibold text-gray-700 dark:text-slate-200">
                  Masukkan Nomor & Nama (1 per baris):
                </label>
                <span className="text-[11px] font-mono text-gray-500 dark:text-slate-400 bg-gray-100 dark:bg-slate-700 px-2 py-0.5 rounded-md">
                  Format: nomor, nama depan, nama belakang
                </span>
              </div>
              <textarea
                id="contacts-import-text"
                name="importText"
                rows={6}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder={"+628123456789, Budi, Santoso\n+628987654321, Siti\n+628111222333"}
                className="w-full p-3 font-mono text-xs border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none leading-relaxed"
              />
            </div>
          ) : (
            <div className="space-y-3">
              <label htmlFor="contacts-file-upload" className="block text-xs font-semibold text-gray-700 dark:text-slate-200">Pilih File Kontak</label>
              <label htmlFor="contacts-file-upload" className="flex flex-col items-center justify-center border-2 border-dashed border-gray-200 hover:border-primary-400 bg-gray-50/50 hover:bg-primary-50/20 rounded-xl p-6 cursor-pointer transition">
                <Upload className="h-8 w-8 text-gray-400 mb-2" />
                <span className="text-xs font-medium text-gray-700 dark:text-slate-200">Klik untuk memilih file kontak</span>
                <span className="text-[11px] text-gray-400 mt-1">Mendukung format .CSV, .VCF (vCard), .TXT</span>
                <input
                  id="contacts-file-upload"
                  name="contactsFile"
                  aria-label="Upload file kontak"
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
        <div className="flex items-center justify-between p-4 border-t border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/40">
          <span className="text-xs text-gray-500">
            Akun: <strong className="text-gray-800 dark:text-slate-200">{accounts?.find((a) => a.id === selectedAccount)?.phone || "—"}</strong>
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
      </DialogContent>
    </Dialog>

    {/* ── Export Contacts Modal ─────────────────────────────────────────── */}
    <Dialog open={exportOpen} onOpenChange={setExportOpen}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        {/* Modal Header */}
        <DialogHeader className="p-5 border-b border-gray-100 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-900/50 flex flex-row items-center justify-between text-left space-y-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-800/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
              <Download className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-gray-900 dark:text-slate-100">
                {_("contacts.exportContacts")}
              </DialogTitle>
              <DialogDescription className="text-xs text-gray-500 dark:text-slate-400">
                {_("contacts.exportContactsDesc")}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

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
              className="w-full flex items-center justify-between p-3.5 rounded-xl border border-gray-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-500 hover:bg-emerald-50/20 dark:hover:bg-emerald-950/20 text-left transition group cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
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
              className="w-full flex items-center justify-between p-3.5 rounded-xl border border-gray-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-500 hover:bg-blue-50/20 dark:hover:bg-blue-950/20 text-left transition group cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 flex items-center justify-center shrink-0">
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
              className="w-full flex items-center justify-between p-3.5 rounded-xl border border-gray-200 dark:border-slate-700 hover:border-purple-300 dark:hover:border-purple-500 hover:bg-purple-50/20 dark:hover:bg-purple-950/20 text-left transition group cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 flex items-center justify-center shrink-0">
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
            className="rounded-xl text-xs dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer"
          >
            Tutup
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
