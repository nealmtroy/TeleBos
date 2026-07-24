"use client";

import { useState } from "react";
import {
  useGroupLists,
  useCreateGroupList,
  useUpdateGroupList,
  useDeleteGroupList,
  type GroupListItem,
} from "@/hooks/use-broadcast";
import { CardSkeleton } from "@/components/ui/skeleton-cards";
import { Plus, Trash2, X, Users, Upload } from "lucide-react";
import { useT } from "@/lib/i18n";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { Textarea } from "@/components/ui/textarea";

/**
 * Parse bulk text input and extract Telegram links/usernames.
 * Supports:
 *   - https://t.me/username  /  http://t.me/username
 *   - https://t.me/+invitehash  /  https://t.me/joinchat/hash
 *   - t.me/username (no scheme)
 *   - @username
 *   - bare username on its own line (e.g. "wananda33ofc")
 *   - Decorative labels and emoji prefixes are skipped.
 */
function parseBulkInput(text: string): GroupListItem[] {
  const items: GroupListItem[] = [];
  const seen = new Set<string>();

  // Telegram username rule: 5–32 chars, starts with letter, then letters/digits/underscores.
  const VALID_USERNAME = /^[a-zA-Z][a-zA-Z0-9_]{4,31}$/;

  const addLink = (raw: string) => {
    // Strip trailing punctuation, normalize to https://
    let clean = raw.replace(/[.,;:!?)\]]+$/, "");
    if (!/^https?:\/\//i.test(clean)) clean = "https://" + clean;
    // Lower-case scheme + host so dedup catches Http://T.ME variants
    clean = clean.replace(/^(https?:\/\/)(t\.me)/i, (_m, s, h) => s.toLowerCase() + h.toLowerCase());
    if (!seen.has(clean)) {
      seen.add(clean);
      items.push({ type: "link", value: clean });
    }
  };

  const addUsername = (name: string) => {
    const bare = name.replace(/^@/, "");
    const key = "@" + bare.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      items.push({ type: "username", value: "@" + bare });
    }
  };

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let matched = false;

    // 1. Any t.me URL on the line (with or without scheme, with joinchat/+ invite paths)
    const urlRegex = /(?:https?:\/\/)?t\.me\/(?:joinchat\/)?[a-zA-Z0-9_+/-]+/gi;
    const urlMatches = trimmed.match(urlRegex);
    if (urlMatches) {
      for (const link of urlMatches) {
        addLink(link);
        matched = true;
      }
    }
    if (matched) continue;

    // 2. @username mentions anywhere on the line
    const atMentions = trimmed.match(/@[a-zA-Z][a-zA-Z0-9_]{4,31}/g);
    if (atMentions) {
      for (const mention of atMentions) {
        addUsername(mention);
        matched = true;
      }
    }
    if (matched) continue;

    // 3. Whole line is a single bare username token (e.g. "wananda33ofc")
    if (VALID_USERNAME.test(trimmed)) {
      addUsername(trimmed);
    }
  }

  return items;
}

export default function GroupListsPage() {
  const _ = useT();
  const { toast } = useToast();
  const { data: lists, isLoading } = useGroupLists();
  const createMutation = useCreateGroupList();
  const updateMutation = useUpdateGroupList();
  const deleteMutation = useDeleteGroupList();

  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");

  // For adding items to an existing list
  const [newItemType, setNewItemType] = useState<"username" | "link" | "group_id">("username");
  const [newItemValue, setNewItemValue] = useState("");

  // Bulk import state
  const [bulkListId, setBulkListId] = useState<string | null>(null);
  const [bulkText, setBulkText] = useState("");
  const [bulkPreview, setBulkPreview] = useState<GroupListItem[]>([]);

  // Expand state
  const [expandedLists, setExpandedLists] = useState<Set<string>>(new Set());

  // Confirm dialog state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  async function handleCreate() {
    if (!newName.trim()) return;
    await createMutation.mutateAsync({ name: newName.trim(), items: [] });
    setNewName("");
    setShowNew(false);
  }

  async function handleAddItem(listId: string, items: GroupListItem[]) {
    const text = newItemValue.trim();
    if (!text) return;

    // Reject if it contains multiple lines or spaces (multiple values pasted together)
    if (text.includes("\n") || text.includes(" ")) {
      toast({
        variant: "error",
        description: _("groupLists.multiValueError")
      });
      return;
    }

    const newItem: GroupListItem = {
      type: newItemType,
      value: text,
    };
    const currentItems = Array.isArray(items) ? items : [];
    await updateMutation.mutateAsync({
      id: listId,
      items: [...currentItems, newItem],
    });
    setNewItemValue("");
  }

  async function handleRemoveItem(listId: string, index: number, items: GroupListItem[]) {
    const currentItems = Array.isArray(items) ? items : [];
    const updated = currentItems.filter((_, i) => i !== index);
    await updateMutation.mutateAsync({ id: listId, items: updated });
  }

  function handleBulkParse() {
    const parsed = parseBulkInput(bulkText);
    setBulkPreview(parsed);
  }

  async function handleBulkImport(listId: string, items: GroupListItem[]) {
    if (bulkPreview.length === 0) return;
    const currentItems = Array.isArray(items) ? items : [];
    await updateMutation.mutateAsync({
      id: listId,
      items: [...currentItems, ...bulkPreview],
    });
    setBulkText("");
    setBulkPreview([]);
    setBulkListId(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{_("groupLists.title")}</h1>
          <p className="text-gray-500 mt-1">{_("groupLists.desc")}</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition"
        >
          <Plus className="h-4 w-4" />
          {_("groupLists.newList")}
        </button>
      </div>

      {/* New list form */}
      {showNew && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={_("groupLists.listName")}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
              autoFocus
            />
            <button
              onClick={handleCreate}
              disabled={!newName.trim() || createMutation.isPending}
              className="px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 disabled:bg-gray-300"
            >
              {createMutation.isPending ? _("groupLists.saving") : _("groupLists.save")}
            </button>
            <button
              onClick={() => setShowNew(false)}
              className="p-2 text-gray-400 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {/* Lists */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <CardSkeleton key={i} lines={4} />
          ))}
        </div>
      ) : !Array.isArray(lists) || lists.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <Users className="h-10 w-10 text-gray-300 mx-auto mb-2" />
          <p className="text-gray-500">{_("groupLists.noLists")}</p>
          <button
            onClick={() => setShowNew(true)}
            className="mt-3 text-primary-600 hover:underline text-sm font-medium"
          >
            {_("groupLists.createFirst")}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {lists.map((list) => (
            <div
              key={list.id}
              className="bg-white rounded-xl border border-gray-200 overflow-hidden"
            >
              <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-100 gap-3 sm:gap-0">
                <div className="flex items-center gap-3">
                  <h3 className="font-semibold text-gray-900">{list.name}</h3>
                  <span className="text-xs font-medium bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                    {Array.isArray(list.items) ? list.items.length : 0} {_("groupLists.groups")}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setExpandedLists((prev) => {
                        const next = new Set(prev);
                        if (next.has(list.id)) next.delete(list.id);
                        else next.add(list.id);
                        return next;
                      });
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary-600 bg-primary-50 hover:bg-primary-100 rounded-lg transition"
                  >
                    {expandedLists.has(list.id) ? _("groupLists.hideDetails") : _("groupLists.viewDetails")}
                  </button>
                  <button
                    onClick={() => {
                      setDeleteTargetId(list.id);
                      setConfirmOpen(true);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition"
                    title={_("groupLists.deleteConfirm")}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {_("groupLists.delete")}
                  </button>
                </div>
              </div>

              {expandedLists.has(list.id) && (
                <>
                  <div className="p-4 space-y-2">
                    <div className="flex justify-end mb-2">
                      <button
                        onClick={() => {
                          setBulkListId(list.id);
                          setBulkText("");
                          setBulkPreview([]);
                        }}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-primary-600 bg-primary-50 hover:bg-primary-100 rounded-md transition"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        {_("groupLists.bulkImportLabel")}
                      </button>
                    </div>
                    {!Array.isArray(list.items) || list.items.length === 0 ? (
                      <p className="text-xs text-gray-400 italic">{_("groupLists.noItems")}</p>
                    ) : (
                      list.items.map((item, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-xs bg-gray-200 px-1.5 py-0.5 rounded font-mono">
                              {item.type}
                            </span>
                            <span className="text-gray-700">{item.value}</span>
                          </div>
                          <button
                            onClick={() => handleRemoveItem(list.id, idx, list.items)}
                            className="text-red-400 hover:text-red-600 p-1"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Bulk import panel */}
                  {bulkListId === list.id && (
                <div className="border-t border-primary-200 bg-primary-50/50 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-primary-800">
                      {_("groupLists.bulkImport")}
                    </h4>
                    <button
                      onClick={() => {
                        setBulkListId(null);
                        setBulkText("");
                        setBulkPreview([]);
                      }}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="text-xs text-primary-600">
                    {_("groupLists.bulkImportDesc")}
                  </p>
                  <Textarea
                    value={bulkText}
                    onChange={(e) => setBulkText(e.target.value)}
                    rows={6}
                    placeholder={`👉 WANANDA 33\nhttps://t.me/WANANDA33OFC\n\n👉 BIRAHIHUB OFFICIAL\nhttps://t.me/birahihub_official\n\n@somegroup\n@anothergroup`}
                    className="resize-none border-primary-300 focus-visible:ring-primary-500"
                  />
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={handleBulkParse}
                      disabled={!bulkText.trim()}
                      className="px-3 py-1.5 bg-primary-600 text-white text-xs rounded hover:bg-primary-700 disabled:bg-gray-300"
                    >
                      {bulkPreview.length > 0
                        ? _("groupLists.bulkRefresh") + ` (${bulkPreview.length})`
                        : _("groupLists.bulkParse")}
                    </button>
                    {bulkPreview.length > 0 && (
                      <button
                        onClick={() => handleBulkImport(list.id, list.items)}
                        className="px-3 py-1.5 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                      >
                        {_("groupLists.bulkImportBtn")} {bulkPreview.length} {_("groupLists.importGroups")}
                      </button>
                    )}
                  </div>

                  {/* Preview parsed items */}
                  {bulkPreview.length > 0 && (
                    <div className="bg-white border border-primary-200 rounded-lg max-h-40 overflow-y-auto divide-y divide-gray-100">
                      {bulkPreview.map((item, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-2 px-3 py-1.5 text-xs"
                        >
                          <span className="bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded font-mono">
                            {item.type}
                          </span>
                          <span className="text-gray-600">{item.value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Add item to this list */}
              <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/50 flex items-center gap-2">
                <select
                  value={newItemType}
                  onChange={(e) => setNewItemType(e.target.value as any)}
                  className="px-2 py-1.5 border border-gray-300 rounded text-xs bg-white"
                >
                  <option value="username">{_("groupLists.typeUsername")}</option>
                  <option value="link">{_("groupLists.typeLink")}</option>
                  <option value="group_id">{_("groupLists.typeGroupId")}</option>
                </select>
                <input
                  value={newItemValue}
                  onChange={(e) => setNewItemValue(e.target.value)}
                  placeholder={
                    newItemType === "username"
                      ? _("groupLists.placeholderUsername")
                      : newItemType === "link"
                        ? _("groupLists.placeholderLink")
                        : _("groupLists.placeholderGroupId")
                  }
                  className="flex-1 px-3 py-1.5 border border-gray-300 rounded text-xs outline-none focus:ring-1 focus:ring-primary-500"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddItem(list.id, list.items);
                  }}
                />
                <button
                  onClick={() => handleAddItem(list.id, list.items)}
                  disabled={!newItemValue.trim()}
                  className="px-3 py-1.5 bg-primary-600 text-white text-xs rounded hover:bg-primary-700 disabled:bg-gray-300"
                >
                  {_("groupLists.add")}
                </button>
              </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={() => {
          if (deleteTargetId) deleteMutation.mutate(deleteTargetId);
          setConfirmOpen(false);
          setDeleteTargetId(null);
        }}
        title={_("groupLists.delete")}
        message={_("groupLists.deleteConfirm")}
        confirmText={_("groupLists.delete")}
        cancelText={_("navbar.cancel")}
        variant="danger"
      />
    </div>
  );
}
