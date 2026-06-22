"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  FolderOpen,
  Pencil,
  Trash2,
  X,
  Check,
  Loader2,
  Search,
  FolderPlus,
  ChevronLeft,
} from "lucide-react";
import { useT } from "@/lib/i18n";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  useAccountFolders,
  useCreateFolder,
  useRenameFolder,
  useDeleteFolder,
  useAddAccountsToFolder,
  useRemoveAccountsFromFolder,
  type AccountFolder,
} from "@/hooks/use-account-folders";
import { useAccounts } from "@/hooks/use-accounts";

interface FolderManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FolderManagerDialog({ open, onOpenChange }: FolderManagerDialogProps) {
  const _ = useT();

  // Folder list
  const { data: folders, isLoading: foldersLoading, isError: foldersError } = useAccountFolders(true);
  const createFolder = useCreateFolder();
  const renameFolder = useRenameFolder();
  const deleteFolder = useDeleteFolder();

  // All accounts (for membership management)
  const { data: accounts } = useAccounts();

  // Create folder form
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  // Rename state
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  // Delete confirm
  const [deleteFolderId, setDeleteFolderId] = useState<string | null>(null);

  // Membership management panel
  const [managingFolder, setManagingFolder] = useState<AccountFolder | null>(null);
  // Local member set — instantly tracks toggles so checkboxes never glitch
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set());

  // Sync local member set when managingFolder changes
  useEffect(() => {
    if (managingFolder?.account_ids) {
      setMemberIds(new Set(managingFolder.account_ids));
    } else {
      setMemberIds(new Set());
    }
  }, [managingFolder?.id, managingFolder?.account_ids]);

  // Search in member panel
  const [memberSearch, setMemberSearch] = useState("");

  // Add/remove members
  const addAccounts = useAddAccountsToFolder();
  const removeAccounts = useRemoveAccountsFromFolder();

  // Escape handling
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (managingFolder) {
          setManagingFolder(null);
        } else {
          onOpenChange(false);
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, managingFolder, onOpenChange]);

  // Prevent body scroll
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  const handleCreate = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      await createFolder.mutateAsync(trimmed);
      setNewName("");
    } catch {
      // error handled by react query
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async (folderId: string) => {
    const trimmed = editName.trim();
    if (!trimmed) return;
    try {
      await renameFolder.mutateAsync({ folderId, name: trimmed });
      setEditingFolderId(null);
    } catch {
      // handled by react query
    }
  };

  const handleDelete = async () => {
    if (!deleteFolderId) return;
    try {
      await deleteFolder.mutateAsync(deleteFolderId);
      setDeleteFolderId(null);
    } catch {
      // handled by react query
    }
  };

  const toggleAccountInFolder = async (accountId: string) => {
    if (!managingFolder) return;
    // Optimistic update — toggle instantly in local state
    const next = new Set(memberIds);
    const wasIn = next.has(accountId);
    if (wasIn) {
      next.delete(accountId);
    } else {
      next.add(accountId);
    }
    setMemberIds(next);

    try {
      if (wasIn) {
        await removeAccounts.mutateAsync({
          folderId: managingFolder.id,
          accountIds: [accountId],
        });
      } else {
        await addAccounts.mutateAsync({
          folderId: managingFolder.id,
          accountIds: [accountId],
        });
      }
    } catch {
      // Revert on failure
      setMemberIds(new Set(memberIds));
    }
  };

  const folderList = Array.isArray(folders) ? folders : [];

  // Filter accounts for the manage panel
  const filteredAccounts = Array.isArray(accounts)
    ? accounts.filter((a) => {
        if (!memberSearch) return true;
        const q = memberSearch.toLowerCase();
        return (
          a.first_name?.toLowerCase().includes(q) ||
          a.last_name?.toLowerCase().includes(q) ||
          a.phone?.toLowerCase().includes(q) ||
          a.username?.toLowerCase().includes(q)
        );
      })
    : [];

  const accountCount = (ids: string[] | undefined) => ids?.length ?? 0;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center p-4 pt-12 sm:pt-16"
      onClick={() => {
        if (!managingFolder) onOpenChange(false);
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" style={{ animation: "fadeIn 0.2s ease-out" }} />

      {/* Dialog */}
      <div
        className="relative bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-lg max-h-[75vh] flex flex-col"
        style={{ animation: "scaleIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            {managingFolder ? (
              <button
                onClick={() => setManagingFolder(null)}
                className="p-1 -ml-1 text-gray-400 hover:text-gray-600 transition rounded-lg hover:bg-gray-100"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            ) : null}
            <h3 className="text-lg font-semibold text-gray-900">
              {managingFolder
                ? _("accountFolders.folderAccounts", { name: managingFolder.name })
                : _("accountFolders.title")}
            </h3>
          </div>
          <button
            onClick={() => { setManagingFolder(null); onOpenChange(false); }}
            className="p-1.5 text-gray-400 hover:text-gray-600 transition rounded-lg hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {managingFolder ? (
            /* ─── Manage Members Panel ─── */
            <div className="space-y-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder={_("accountFolders.searchAccounts")}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                />
              </div>

              {/* Account checkboxes */}
              {filteredAccounts.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">
                  {memberSearch ? "No accounts match your search." : _("accountsList.noAccounts")}
                </p>
              ) : (
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {filteredAccounts.map((account) => {
                    const isInFolder = memberIds.has(account.id);
                    return (
                      <label
                        key={account.id}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer transition group"
                      >
                        <input
                          type="checkbox"
                          checked={isInFolder}
                          onChange={() => toggleAccountInFolder(account.id)}
                          className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">
                            {account.first_name || account.phone || "Unnamed"}
                            {account.last_name ? ` ${account.last_name}` : ""}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-gray-400">
                            {account.phone && <span>{account.phone}</span>}
                            {account.username && <span>@{account.username}</span>}
                          </div>
                        </div>
                        {isInFolder && (
                          <Check className="h-4 w-4 text-primary-500 shrink-0" />
                        )}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* ─── Folder List + Create ─── */
            <>
              {/* Loading/Error states */}
              {foldersLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 text-gray-400 animate-spin" />
                </div>
              ) : foldersError ? (
                <p className="text-sm text-red-500 text-center py-4">{_("accountsList.failedToLoad")}</p>
              ) : folderList.length === 0 ? (
                <div className="text-center py-8">
                  <FolderOpen className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">{_("accountFolders.noFolders")}</p>
                </div>
              ) : (
                /* Folder list */
                <div className="space-y-2">
                  {folderList.map((folder) => {
                    const isEditing = editingFolderId === folder.id;
                    const memberCount = accountCount(folder.account_ids);

                    return (
                      <div
                        key={folder.id}
                        className="flex items-center justify-between px-4 py-3 rounded-xl border border-gray-200 hover:border-gray-300 transition group"
                      >
                        {isEditing ? (
                          <div className="flex items-center gap-2 flex-1 mr-2">
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleRename(folder.id);
                                if (e.key === "Escape") setEditingFolderId(null);
                              }}
                              className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                              autoFocus
                            />
                            <button
                              onClick={() => handleRename(folder.id)}
                              className="p-1 text-green-600 hover:bg-green-50 rounded-lg transition"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setEditingFolderId(null)}
                              className="p-1 text-gray-400 hover:bg-gray-100 rounded-lg transition"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={() => setManagingFolder(folder)}
                              className="flex items-center gap-3 flex-1 min-w-0 text-left"
                            >
                              <FolderOpen className="h-5 w-5 text-primary-500 shrink-0" />
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-800 truncate">{folder.name}</p>
                                <p className="text-xs text-gray-400">
                                  {memberCount} account{memberCount !== 1 ? "s" : ""}
                                </p>
                              </div>
                            </button>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                              <button
                                onClick={() => {
                                  setEditingFolderId(folder.id);
                                  setEditName(folder.name);
                                }}
                                className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition"
                                title={_("accountFolders.renameFolder")}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => setDeleteFolderId(folder.id)}
                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                                title={_("accountFolders.deleteFolder")}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Divider */}
              {folderList.length > 0 && <div className="border-t border-gray-100" />}

              {/* Create new folder */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                  }}
                  placeholder={_("accountFolders.folderNamePlaceholder")}
                  className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                />
                <button
                  onClick={handleCreate}
                  disabled={creating || !newName.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition"
                >
                  {creating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FolderPlus className="h-4 w-4" />
                  )}
                  {_("accountFolders.createFolder")}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteFolderId !== null}
        onOpenChange={() => setDeleteFolderId(null)}
        onConfirm={handleDelete}
        title={_("accountFolders.deleteFolder")}
        message={_("accountFolders.deleteConfirm")}
        confirmText={_("accountFolders.delete")}
        cancelText={_("navbar.cancel")}
        variant="warning"
        loading={deleteFolder.isPending}
      />

      {/* Animations */}
      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from {
            opacity: 0;
            transform: scale(0.9) translateY(8px);
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
