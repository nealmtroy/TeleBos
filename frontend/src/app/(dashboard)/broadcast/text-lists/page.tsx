"use client";

import { useState } from "react";
import {
  useTextLists,
  useCreateTextList,
  useUpdateTextList,
  useDeleteTextList,
} from "@/hooks/use-broadcast";
import { CardSkeleton } from "@/components/ui/skeleton-cards";
import { Plus, Trash2, X, FileText } from "lucide-react";
import { useT } from "@/lib/i18n";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{_("textLists.title")}</h1>
          <p className="text-gray-500 mt-1">{_("textLists.desc")}</p>
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
            <div className="bg-white rounded-xl border-2 border-primary-500 p-5 flex flex-col justify-between min-h-[300px] shadow-sm animate-fadeIn">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-gray-900 text-sm">Buat Daftar Baru</span>
                  <button onClick={() => setShowNew(false)} className="text-gray-400 hover:text-gray-600">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={_("textLists.listNamePlaceholder") || "Nama daftar..."}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none transition"
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
                <button
                  onClick={handleCreate}
                  disabled={!newName.trim() || createMutation.isPending}
                  className="flex-1 py-2.5 bg-primary-600 text-white text-xs font-semibold rounded-lg hover:bg-primary-700 disabled:bg-gray-300 flex items-center justify-center gap-1.5 transition"
                >
                  {createMutation.isPending ? "Menyimpan..." : _("textLists.save")}
                </button>
                <button
                  onClick={() => setShowNew(false)}
                  className="px-3 py-2.5 border border-gray-300 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50 transition"
                >
                  Batal
                </button>
              </div>
            </div>
          ) : (
            <div
              onClick={() => setShowNew(true)}
              className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-200 rounded-xl hover:border-primary-500 hover:bg-primary-50/20 hover:shadow-sm cursor-pointer transition min-h-[300px] duration-300 group"
            >
              <div className="p-3 bg-gray-50 text-gray-400 rounded-full mb-3 group-hover:bg-primary-50 group-hover:text-primary-600 transition duration-300">
                <Plus className="h-6 w-6 animate-pulse" />
              </div>
              <span className="font-semibold text-gray-700 text-sm group-hover:text-primary-700 transition duration-300">{_("textLists.newList")}</span>
              <span className="text-xs text-gray-400 mt-1.5 text-center max-w-[180px]">
                Mulai dengan membuat wadah untuk template siaran Anda
              </span>
            </div>
          )}

          {/* Existing Lists */}
          {Array.isArray(lists) &&
            lists.map((list) => (
              <div
                key={list.id}
                className="bg-white rounded-xl border border-gray-200 flex flex-col justify-between min-h-[300px] hover:shadow-md transition duration-300"
              >
                <div>
                  {/* Header */}
                  <div className="px-5 py-4 flex items-center justify-between border-b border-gray-100 bg-gray-50/30">
                    <div className="min-w-0">
                      <h3 className="font-bold text-gray-900 text-sm truncate" title={list.name}>
                        {list.name}
                      </h3>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {Array.isArray(list.texts) ? list.texts.length : 0} {_("textLists.texts")}
                      </p>
                    </div>
                    <button
                      onClick={() => setDeleteTargetId(list.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                      title={_("textLists.delete")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Message items list */}
                  <div className="p-4 space-y-2.5 max-h-60 overflow-y-auto">
                    {!Array.isArray(list.texts) || list.texts.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <FileText className="h-8 w-8 text-gray-300 mb-1" />
                        <p className="text-xs text-gray-400 italic">{_("textLists.noTexts")}</p>
                      </div>
                    ) : (
                      list.texts.map((text, idx) => (
                        <div
                          key={idx}
                          className="group flex items-start justify-between bg-gray-50 hover:bg-gray-100/70 border border-gray-100 rounded-lg px-3 py-2 text-xs transition"
                        >
                          <span className="text-gray-700 whitespace-pre-wrap break-words flex-1 leading-relaxed">
                            {text}
                          </span>
                          <button
                            onClick={() =>
                              handleRemoveText(list.id, idx, list.texts)
                            }
                            className="text-gray-400 hover:text-red-600 p-0.5 ml-2 flex-shrink-0 transition opacity-0 group-hover:opacity-100"
                            title="Hapus pesan"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Add Text Footer */}
                <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/50 flex items-end gap-2">
                  <textarea
                    value={newItemTexts[list.id] || ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      setNewItemTexts((prev) => ({ ...prev, [list.id]: val }));
                    }}
                    placeholder={_("textLists.addTextPlaceholder")}
                    rows={2}
                    className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none bg-white transition"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleAddText(list.id, list.texts);
                      }
                    }}
                  />
                  <button
                    onClick={() => handleAddText(list.id, list.texts)}
                    disabled={!(newItemTexts[list.id] || "").trim() || updateMutation.isPending}
                    className="px-3 py-2 bg-primary-600 text-white text-xs font-semibold rounded-lg hover:bg-primary-700 disabled:bg-gray-200 disabled:text-gray-400 transition h-fit shrink-0"
                  >
                    {_("textLists.add")}
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}

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
    </div>
  );
}
