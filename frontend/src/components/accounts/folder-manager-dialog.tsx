"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
import { Checkbox } from "@/components/ui/checkbox";
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

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(val) => {
          if (!val) {
            setManagingFolder(null);
            onOpenChange(false);
          }
        }}
      >
        <DialogContent className="max-w-lg p-0 max-h-[85vh] flex flex-col overflow-hidden">
          {/* Header */}
          <DialogHeader className="px-6 pt-5 pb-3 border-b border-gray-100 shrink-0 text-left pr-12">
            <div className="flex items-center gap-2">
              {managingFolder ? (
                <button
                  onClick={() => setManagingFolder(null)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 dark:border-slate-700 bg-card text-foreground shadow-2xs hover:bg-muted transition-colors cursor-pointer"
                  aria-label="Back to folder list"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              ) : null}
              <DialogTitle className="text-lg font-semibold text-foreground">
                {managingFolder
                  ? _("accountFolders.folderAccounts", { name: managingFolder.name })
                  : _("accountFolders.title")}
              </DialogTitle>
            </div>
            <DialogDescription className="sr-only">
              Folder management dialog
            </DialogDescription>
          </DialogHeader>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {managingFolder ? (
            /* ─── Manage Members Panel ─── */
            <div className="space-y-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  id="folder-member-search"
                  name="memberSearch"
                  type="text"
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder={_("accountFolders.searchAccounts")}
                  aria-label={_("accountFolders.searchAccounts")}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 dark:border-slate-700 bg-card text-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                />
              </div>

              {/* Account checkboxes */}
              {filteredAccounts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  {memberSearch ? "No accounts match your search." : _("accountsList.noAccounts")}
                </p>
              ) : (
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {filteredAccounts.map((account) => {
                    const isInFolder = memberIds.has(account.id);
                    return (
                      <label
                        key={account.id}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/60 cursor-pointer transition-colors group"
                      >
                        <Checkbox
                          checked={isInFolder}
                          onCheckedChange={() => toggleAccountInFolder(account.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {account.first_name || account.phone || "Unnamed"}
                            {account.last_name ? ` ${account.last_name}` : ""}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {account.phone && <span>{account.phone}</span>}
                            {account.username && <span>@{account.username}</span>}
                          </div>
                        </div>
                        {isInFolder && (
                          <Check className="h-4 w-4 text-primary shrink-0" />
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
                  <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
                </div>
              ) : foldersError ? (
                <p className="text-sm text-rose-500 text-center py-4">{_("accountsList.failedToLoad")}</p>
              ) : folderList.length === 0 ? (
                <div className="text-center py-8">
                  <FolderOpen className="h-10 w-10 text-muted-foreground/50 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">{_("accountFolders.noFolders")}</p>
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
                        className="flex items-center justify-between px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-card hover:border-slate-300 dark:hover:border-slate-700 transition-colors group"
                      >
                        {isEditing ? (
                          <div className="flex items-center gap-2 flex-1 mr-2">
                            <input
                              id={`folder-rename-${folder.id}`}
                              name={`renameFolder_${folder.id}`}
                              aria-label={_("accountFolders.renameFolder") || "Rename Folder"}
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleRename(folder.id);
                                if (e.key === "Escape") setEditingFolderId(null);
                              }}
                              className="flex-1 px-2.5 py-1 text-sm border border-slate-300 dark:border-slate-700 bg-card text-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                              autoFocus
                            />
                            <button
                              onClick={() => handleRename(folder.id)}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors cursor-pointer"
                              title="Simpan nama folder"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setEditingFolderId(null)}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 hover:bg-rose-600 hover:text-white transition-colors cursor-pointer"
                              title="Batal"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={() => setManagingFolder(folder)}
                              className="flex items-center gap-3 flex-1 min-w-0 text-left cursor-pointer"
                            >
                              <FolderOpen className="h-5 w-5 text-primary shrink-0" />
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-foreground truncate">{folder.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {memberCount} account{memberCount !== 1 ? "s" : ""}
                                </p>
                              </div>
                            </button>
                            <div className="flex items-center gap-1.5 opacity-90 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => {
                                  setEditingFolderId(folder.id);
                                  setEditName(folder.name);
                                }}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-300 dark:border-slate-700 bg-card text-slate-700 dark:text-slate-300 hover:bg-muted hover:text-foreground shadow-2xs transition-colors cursor-pointer"
                                title={_("accountFolders.renameFolder")}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => setDeleteFolderId(folder.id)}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:border-rose-600 hover:bg-rose-600 hover:text-white shadow-2xs transition-colors cursor-pointer"
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
              {folderList.length > 0 && <div className="border-t border-border" />}

              {/* Create new folder */}
              <div className="flex items-center gap-2">
                <input
                  id="new-folder-name"
                  name="newFolderName"
                  aria-label={_("accountFolders.folderNamePlaceholder")}
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                  }}
                  placeholder={_("accountFolders.folderNamePlaceholder")}
                  className="flex-1 h-9 px-3 text-sm border border-slate-300 dark:border-slate-700 bg-card text-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                />
                <button
                  onClick={handleCreate}
                  disabled={creating || !newName.trim()}
                  className="inline-flex h-9 items-center gap-1.5 px-4 text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors cursor-pointer"
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
      </DialogContent>
    </Dialog>

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
  </>
  );
}
