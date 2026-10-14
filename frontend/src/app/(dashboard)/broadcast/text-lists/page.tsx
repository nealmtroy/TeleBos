"use client";

import { useState } from "react";
import {
  useTextLists,
  useCreateTextList,
  useUpdateTextList,
  useDeleteTextList,
} from "@/hooks/use-broadcast";
import { CardSkeleton } from "@/components/ui/skeleton-cards";
import { Plus, Trash2, X, FileText, Edit3 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { TextEditorModal } from "@/components/ui/text-editor";

interface ModalState {
  open: boolean;
  mode: "add" | "edit";
  listId: string;
  listName: string;
  allTexts: string[];
  editIndex?: number;
  initialValue: string;
}

export default function TextListsPage() {
  const _ = useT();
  const { data: lists, isLoading } = useTextLists();
  const createMutation = useCreateTextList();
  const updateMutation = useUpdateTextList();
  const deleteMutation = useDeleteTextList();

  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newItemTexts, setNewItemTexts] = useState<Record<string, string>>({});
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  // Text editor modal state
  const [editorModal, setEditorModal] = useState<ModalState | null>(null);

  async function handleCreate() {
    if (!newName.trim()) return;
    await createMutation.mutateAsync({ name: newName.trim(), texts: [] });
    setNewName("");
    setShowNew(false);
  }

  async function handleAddText(listId: string, texts: string[]) {
    const textToAdd = newItemTexts[listId] || "";
    if (!textToAdd.trim()) return;
    const currentTexts = Array.isArray(texts) ? texts : [];
    await updateMutation.mutateAsync({
      id: listId,
      texts: [...currentTexts, textToAdd.trim()],
    });
    setNewItemTexts((prev) => ({ ...prev, [listId]: "" }));
  }

  async function handleRemoveText(listId: string, index: number, texts: string[]) {
    const currentTexts = Array.isArray(texts) ? texts : [];
    const updated = currentTexts.filter((_, i) => i !== index);
    await updateMutation.mutateAsync({ id: listId, texts: updated });
  }

  function handleOpenAddModal(listId: string, texts: string[], listName: string) {
    setEditorModal({
      open: true,
      mode: "add",
      listId,
      listName,
      allTexts: Array.isArray(texts) ? texts : [],
      initialValue: newItemTexts[listId] || "",
    });
  }

  function handleOpenEditModal(
    listId: string,
    index: number,
    text: string,
    texts: string[],
    listName: string
  ) {
    setEditorModal({
      open: true,
      mode: "edit",
      listId,
      listName,
      allTexts: Array.isArray(texts) ? texts : [],
      editIndex: index,
      initialValue: text,
    });
  }

  async function handleSaveModalText(savedValue: string) {
    if (!editorModal) return;
    const trimmed = savedValue.trim();
    if (!trimmed) return;

    if (editorModal.mode === "add") {
      const updated = [...editorModal.allTexts, trimmed];
      await updateMutation.mutateAsync({
        id: editorModal.listId,
        texts: updated,
      });
      setNewItemTexts((prev) => ({ ...prev, [editorModal.listId]: "" }));
    } else if (editorModal.mode === "edit" && typeof editorModal.editIndex === "number") {
      const updated = [...editorModal.allTexts];
      updated[editorModal.editIndex] = trimmed;
      await updateMutation.mutateAsync({
        id: editorModal.listId,
        texts: updated,
      });
    }

    setEditorModal(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">
            {_("textLists.title")}
          </h1>
          <p className="text-gray-500 dark:text-slate-400 mt-1">
            {_("textLists.desc")}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <CardSkeleton key={i} lines={4} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Create New List Card */}
          {showNew ? (
            <div className="bg-card text-card-foreground rounded-xl border-2 border-primary-500 p-5 flex flex-col justify-between min-h-[300px] shadow-sm animate-fadeIn">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-foreground text-sm">
                    {_("textLists.newList")}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowNew(false)}
                    aria-label={_("common.cancel") || "Batal"}
                    className="h-7 w-7 rounded-md border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 hover:bg-rose-600 hover:text-white flex items-center justify-center transition shadow-2xs cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <input
                  id="new-text-list-name"
                  name="newName"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={
                    _("textLists.listNamePlaceholder") || "Nama daftar..."
                  }
                  aria-label={
                    _("textLists.listNamePlaceholder") || "Nama daftar..."
                  }
                  className="w-full px-3.5 py-2.5 border border-input bg-background text-foreground rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none transition"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleCreate();
                    }
                  }}
                />
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleCreate}
                  disabled={!newName.trim() || createMutation.isPending}
                  className="flex-1 h-9 text-xs font-semibold cursor-pointer"
                >
                  {createMutation.isPending
                    ? "Menyimpan..."
                    : _("textLists.save")}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowNew(false)}
                  className="h-9 px-3 text-xs cursor-pointer"
                >
                  Batal
                </Button>
              </div>
            </div>
          ) : (
            <div
              onClick={() => setShowNew(true)}
              className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-200 dark:border-slate-700 rounded-xl hover:border-primary-500 hover:bg-primary-50/20 dark:hover:bg-primary-950/20 hover:shadow-sm cursor-pointer transition min-h-[300px] duration-300 group"
            >
              <div className="p-3 bg-gray-50 dark:bg-slate-800 text-gray-400 rounded-full mb-3 group-hover:bg-primary-50 dark:group-hover:bg-primary-950/60 group-hover:text-primary-600 transition duration-300">
                <Plus className="h-6 w-6 animate-pulse" />
              </div>
              <span className="font-semibold text-gray-700 dark:text-slate-300 text-sm group-hover:text-primary-600 transition duration-300">
                {_("textLists.newList")}
              </span>
              <span className="text-xs text-gray-400 dark:text-slate-500 mt-1.5 text-center max-w-[180px]">
                Mulai dengan membuat wadah untuk template siaran Anda
              </span>
            </div>
          )}

          {/* Existing Lists */}
          {Array.isArray(lists) &&
            lists.map((list) => (
              <div
                key={list.id}
                className="bg-card text-card-foreground rounded-xl border border-border flex flex-col justify-between min-h-[300px] hover:shadow-md transition duration-300"
              >
                <div>
                  {/* Header */}
                  <div className="px-5 py-4 flex items-center justify-between border-b border-gray-100 dark:border-slate-700/80 bg-gray-50/30 dark:bg-slate-805">
                    <div className="min-w-0">
                      <h3
                        className="font-bold text-gray-900 dark:text-slate-100 text-sm truncate"
                        title={list.name}
                      >
                        {list.name}
                      </h3>
                      <p className="text-xs text-gray-400 dark:text-slate-400 mt-0.5">
                        {Array.isArray(list.texts) ? list.texts.length : 0}{" "}
                        {_("textLists.texts")}
                      </p>
                    </div>
                    <button
                      onClick={() => setDeleteTargetId(list.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition"
                      title={_("textLists.delete")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Message items list */}
                  <div className="p-4 space-y-2.5 max-h-60 overflow-y-auto">
                    {!Array.isArray(list.texts) || list.texts.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <FileText className="h-8 w-8 text-gray-300 dark:text-slate-600 mb-1" />
                        <p className="text-xs text-gray-400 dark:text-slate-500 italic">
                          {_("textLists.noTexts")}
                        </p>
                      </div>
                    ) : (
                      list.texts.map((text, idx) => (
                        <div
                          key={idx}
                          className="group flex items-start justify-between bg-gray-50 dark:bg-slate-900/60 hover:bg-gray-100/70 dark:hover:bg-slate-700/40 border border-gray-100 dark:border-slate-700 rounded-lg px-3 py-2 text-xs transition"
                        >
                          <span className="text-foreground whitespace-pre-wrap break-words flex-1 leading-relaxed">
                            {text}
                          </span>
                          <div className="flex items-center gap-1.5 ml-2 shrink-0 opacity-0 group-hover:opacity-100 transition">
                            <button
                              type="button"
                              onClick={() =>
                                handleOpenEditModal(
                                  list.id,
                                  idx,
                                  text,
                                  list.texts,
                                  list.name
                                )
                              }
                              className="h-7 w-7 flex items-center justify-center rounded-md border border-slate-300 dark:border-slate-700 bg-card hover:bg-accent text-muted-foreground hover:text-foreground transition shadow-2xs cursor-pointer"
                              title={_("textLists.editText")}
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleRemoveText(list.id, idx, list.texts)
                              }
                              className="h-7 w-7 flex items-center justify-center rounded-md border border-rose-200 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/60 transition shadow-2xs cursor-pointer"
                              title="Hapus pesan"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Add Text Footer */}
                <div className="px-4 py-3 border-t border-gray-100 dark:border-slate-700/80 bg-gray-50/50 dark:bg-slate-800/40 space-y-2">
                  <div className="flex items-end gap-2">
                    <Textarea
                      id={`add-text-${list.id}`}
                      name={`itemText_${list.id}`}
                      aria-label={_("textLists.addTextPlaceholder")}
                      value={newItemTexts[list.id] || ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        setNewItemTexts((prev) => ({
                          ...prev,
                          [list.id]: val,
                        }));
                      }}
                      placeholder={_("textLists.addTextPlaceholder")}
                      rows={2}
                      className="flex-1 text-xs resize-none min-h-[46px] bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 transition"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleAddText(list.id, list.texts);
                        }
                      }}
                    />
                    <button
                      onClick={() => handleAddText(list.id, list.texts)}
                      disabled={
                        !(newItemTexts[list.id] || "").trim() ||
                        updateMutation.isPending
                      }
                      className="px-3 py-2 bg-primary-600 text-white text-xs font-semibold rounded-lg hover:bg-primary-700 disabled:bg-gray-200 dark:disabled:bg-slate-700 disabled:text-gray-400 transition h-fit shrink-0"
                    >
                      {_("textLists.add")}
                    </button>
                  </div>

                  {/* Rich Text Editor trigger */}
                  <button
                    type="button"
                    onClick={() =>
                      handleOpenAddModal(list.id, list.texts, list.name)
                    }
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 hover:bg-primary-50 dark:hover:bg-primary-950/40 rounded-lg border border-dashed border-primary-200 dark:border-primary-800/60 transition"
                  >
                    <Edit3 className="h-3 w-3" />
                    <span>Buka Text Editor (Formatting & Preview)</span>
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteTargetId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTargetId(null);
        }}
        onConfirm={() => {
          if (deleteTargetId) deleteMutation.mutate(deleteTargetId);
          setDeleteTargetId(null);
        }}
        title={_("textLists.delete")}
        message={_("textLists.deleteConfirm")}
        confirmText={_("textLists.delete")}
        cancelText={_("navbar.cancel")}
        variant="danger"
      />

      {/* Text Editor Modal for Add / Edit */}
      {editorModal && (
        <TextEditorModal
          open={editorModal.open}
          onOpenChange={(open) => {
            if (!open) setEditorModal(null);
          }}
          title={
            editorModal.mode === "add"
              ? _("textLists.modalAddTitle")
              : _("textLists.modalEditTitle")
          }
          description={`Daftar: ${editorModal.listName}`}
          value={editorModal.initialValue}
          onSave={handleSaveModalText}
          placeholder="Ketik template pesan siaran Anda di sini..."
          saveText={editorModal.mode === "add" ? "Tambah Pesan" : "Simpan Pesan"}
          cancelText="Batal"
          isLoading={updateMutation.isPending}
        />
      )}
    </div>
  );
}
