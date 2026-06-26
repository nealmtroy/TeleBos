"use client";

import { useState, Suspense, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useT } from "@/lib/i18n";
import { useAccounts } from "@/hooks/use-accounts";
import {
  useContacts,
  useContactDetail,
  useDeleteContact,
  type ContactItem,
} from "@/hooks/use-contacts";
import { cn } from "@/lib/utils";
import { ChatRowSkeleton } from "@/components/ui/skeleton-cards";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAuthStore } from "@/store/auth-store";
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
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const getApiUrl = useCallback(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "/api/v1";
    if (typeof window !== "undefined" && apiUrl.includes("backend:8000")) {
      return "/api/v1";
    }
    return apiUrl;
  }, []);

  // Auto-select first account
  useEffect(() => {
    if (Array.isArray(accounts) && accounts.length > 0 && !selectedAccount) {
      setSelectedAccount(accounts[0].id);
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

  return (
    <>
    <div className="flex h-[calc(100vh-7rem)] -m-6 bg-white rounded-xl overflow-hidden border border-gray-200 shadow-sm">
      {/* ── Left Panel: Contact List ────────────────────────────────────── */}
      <div
        className={cn(
          "flex flex-col border-r border-gray-200 bg-white transition-all duration-200",
          selectedContactId ? "hidden md:flex w-[360px] flex-shrink-0" : "flex-1 md:w-[360px] md:flex-shrink-0"
        )}
      >
        {/* List Header */}
        <div className="p-4 border-b border-gray-100 space-y-3">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold text-gray-900">{_("contacts.title")}</h1>
            {selectedAccount && (
              <span className="text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">
                {_("contacts.contactsCount", { count: String(total) })}
              </span>
            )}
          </div>

          <select
            value={selectedAccount}
            onChange={(e) => setSelectedAccount(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none bg-gray-50 text-gray-700"
          >
            <option value="">{_("contacts.selectAccount")}</option>
            {(Array.isArray(accounts) ? accounts : []).map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.first_name || acc.phone}
              </option>
            ))}
          </select>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder={_("contacts.search")}
              className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
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
                    <div className="w-11 h-11 rounded-full overflow-hidden flex-shrink-0 relative bg-gray-100">
                      {isAuthenticated && selectedAccount && (
                        <img
                          src={`${getApiUrl()}/accounts/${selectedAccount}/chats/${contact.contact_id}/photo`}
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                            const fb = e.currentTarget.nextElementSibling as HTMLElement;
                            if (fb) fb.style.display = "flex";
                          }}
                          className="w-full h-full object-cover"
                          alt=""
                        />
                      )}
                      <div
                        className="w-full h-full flex items-center justify-center text-white font-bold text-sm bg-blue-500"
                        style={{ display: isAuthenticated && selectedAccount ? "none" : "flex" }}
                      >
                        {(contact.first_name || "?")[0]?.toUpperCase()}
                      </div>
                    </div>

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
          "flex-1 flex flex-col bg-gray-50 min-w-0",
          !selectedContactId && "hidden md:flex"
        )}
      >
        {selectedContactId ? (
          <>
            {/* Detail Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 bg-white flex-shrink-0">
              <button
                onClick={() => setSelectedContactId(null)}
                className="md:hidden p-1.5 hover:bg-gray-100 rounded-lg transition"
              >
                <ArrowLeft className="h-5 w-5 text-gray-500" />
              </button>
              <h2 className="text-sm font-bold text-gray-900">
                {_("contacts.title")}
              </h2>
            </div>

            {/* Detail body */}
            <div className="flex-1 overflow-y-auto p-6">
              {detailLoading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-300" />
                </div>
              ) : detailError ? (
                <div className="flex items-center justify-center py-20 text-sm text-red-400">
                  {_("contacts.failedToLoad")}
                </div>
              ) : contactDetail ? (
                <div className="max-w-md mx-auto space-y-6">
                  {/* Avatar & Name */}
                  <div className="flex flex-col items-center text-center">
                    <div className="w-24 h-24 rounded-full overflow-hidden relative shadow-lg mb-4">
                      {isAuthenticated && selectedAccount && (
                        <img
                          src={`${getApiUrl()}/accounts/${selectedAccount}/chats/${selectedContactId}/photo`}
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                            const fb = e.currentTarget.nextElementSibling as HTMLElement;
                            if (fb) fb.style.display = "flex";
                          }}
                          className="w-full h-full object-cover rounded-full"
                          alt=""
                        />
                      )}
                      <div
                        className="w-full h-full rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-3xl font-bold"
                        style={{ display: isAuthenticated && selectedAccount ? "none" : "flex" }}
                      >
                        {(contactDetail.first_name || "?")[0]?.toUpperCase()}
                      </div>
                    </div>
                    <h2 className="text-xl font-bold text-gray-900">
                      {contactDetail.first_name}
                      {contactDetail.last_name ? ` ${contactDetail.last_name}` : ""}
                    </h2>
                    {contactDetail.username && (
                      <p className="text-sm text-gray-500 mt-0.5">
                        @{contactDetail.username}
                      </p>
                    )}

                    {/* Mutual badge */}
                    <div className="mt-2">
                      {contactDetail.mutual ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2.5 py-0.5 rounded-full border border-green-200">
                          <UserCheck className="h-3.5 w-3.5" />
                          {_("contacts.mutual")}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 bg-gray-100 px-2.5 py-0.5 rounded-full">
                          <UserX className="h-3.5 w-3.5" />
                          {_("contacts.notMutual")}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Info Card */}
                  <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 shadow-sm">
                    {/* Phone */}
                    <div className="flex items-center gap-3 px-4 py-3.5">
                      <Phone className="h-4 w-4 text-gray-400 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs text-gray-400">{_("contacts.phone")}</p>
                        <p className="text-sm font-medium text-gray-800">
                          {contactDetail.phone || "—"}
                        </p>
                      </div>
                    </div>

                    {/* Username */}
                    <div className="flex items-center gap-3 px-4 py-3.5">
                      <AtSign className="h-4 w-4 text-gray-400 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs text-gray-400">{_("contacts.username")}</p>
                        <p className="text-sm font-medium text-gray-800">
                          {contactDetail.username
                            ? `@${contactDetail.username}`
                            : "—"}
                        </p>
                      </div>
                    </div>

                    {/* About / Bio */}
                    <div className="flex items-start gap-3 px-4 py-3.5">
                      <Info className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-xs text-gray-400">{_("contacts.about")}</p>
                        <p className="text-sm font-medium text-gray-800 whitespace-pre-wrap">
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
            <h2 className="text-xl font-bold text-gray-800 mb-2">
              {_("contacts.selectContact")}
            </h2>
            <p className="text-sm text-gray-400 max-w-xs">
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
    </>
  );
}
