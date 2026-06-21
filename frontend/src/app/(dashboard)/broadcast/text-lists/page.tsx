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

export default function TextListsPage() {
  const _ = useT();
  const { data: lists, isLoading } = useTextLists();
  const createMutation = useCreateTextList();
  const updateMutation = useUpdateTextList();
  const deleteMutation = useDeleteTextList();

  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newItemText, setNewItemText] = useState("");
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  async function handleCreate() {
    if (!newName.trim()) return;
    await createMutation.mutateAsync({ name: newName.trim(), texts: [] });
    setNewName("");
    setShowNew(false);
  }

  async function handleAddText(listId: string, texts: string[]) {
    if (!newItemText.trim()) return;
    const currentTexts = Array.isArray(texts) ? texts : [];
    await updateMutation.mutateAsync({
      id: listId,
      texts: [...currentTexts, newItemText.trim()],
    });
    setNewItemText("");
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
        <button
          onClick={() => setShowNew(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition"
        >
          <Plus className="h-4 w-4" />
          {_("textLists.newList")}
        </button>
      </div>

      {showNew && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={_("textLists.listNamePlaceholder")}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
              autoFocus
            />
            <button
              onClick={handleCreate}
              disabled={!newName.trim()}
              className="px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 disabled:bg-gray-300"
            >
              {_("textLists.save")}
            </button>
            <button onClick={() => setShowNew(false)} className="p-2 text-gray-400">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <CardSkeleton key={i} lines={4} />
          ))}
        </div>
      ) : !Array.isArray(lists) || lists.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <FileText className="h-10 w-10 text-gray-300 mx-auto mb-2" />
          <p className="text-gray-500">{_("textLists.noLists")}</p>
          <button
            onClick={() => setShowNew(true)}
            className="mt-3 text-primary-600 hover:underline text-sm font-medium"
          >
            {_("textLists.createFirst")}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {lists.map((list) => (
            <div
              key={list.id}
              className="bg-white rounded-xl border border-gray-200 overflow-hidden"
            >
              <div className="px-5 py-4 flex items-center justify-between border-b border-gray-100">
                <div>
                  <h3 className="font-semibold text-gray-900">{list.name}</h3>
                  <p className="text-xs text-gray-400">{Array.isArray(list.texts) ? list.texts.length : 0} {_("textLists.texts")}</p>
                </div>
                <button
                  onClick={() => setDeleteTargetId(list.id)}
                  className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg transition"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <div className="p-4 space-y-2">
                {!Array.isArray(list.texts) || list.texts.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">{_("textLists.noTexts")}</p>
                ) : (
                  list.texts.map((text, idx) => (
                    <div
                      key={idx}
                      className="flex items-start justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm"
                    >
                      <span className="text-gray-700 whitespace-pre-wrap break-words flex-1">
                        {text}
                      </span>
                      <button
                        onClick={() =>
                          handleRemoveText(list.id, idx, list.texts)
                        }
                        className="text-red-400 hover:text-red-600 p-1 ml-2 flex-shrink-0"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Add text */}
              <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/50 flex items-center gap-2">
                <textarea
                  value={newItemText}
                  onChange={(e) => setNewItemText(e.target.value)}
                  placeholder={_("textLists.addTextPlaceholder")}
                  rows={2}
                  className="flex-1 px-3 py-1.5 border border-gray-300 rounded text-xs outline-none focus:ring-1 focus:ring-primary-500 resize-none"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleAddText(list.id, list.texts);
                    }
                  }}
                />
                <button
                  onClick={() => handleAddText(list.id, list.texts)}
                  disabled={!newItemText.trim()}
                  className="px-3 py-1.5 bg-primary-600 text-white text-xs rounded hover:bg-primary-700 disabled:bg-gray-300"
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
        onOpenChange={(open) => { if (!open) setDeleteTargetId(null); }}
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
