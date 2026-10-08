"use client";

import { useState, useRef, useMemo, useEffect } from "react";
import {
  Bold,
  Italic,
  Code,
  Quote,
  Link as LinkIcon,
  Smile,
  Eye,
  Edit3,
  X,
  Search,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EMOJI_CATEGORIES } from "@/components/chat/constants";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";

export interface TextEditorProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  className?: string;
  maxLength?: number;
  id?: string;
  name?: string;
  ariaLabel?: string;
}

export function TextEditor({
  value,
  onChange,
  placeholder = "Ketik template pesan...",
  rows = 4,
  disabled = false,
  className,
  maxLength = 4096,
  id = "text-editor-content",
  name = "messageContent",
  ariaLabel,
}: TextEditorProps) {
  const [activeTab, setActiveTab] = useState<"edit" | "preview">("edit");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiSearch, setEmojiSearch] = useState("");
  const [selectedEmojiCategory, setSelectedEmojiCategory] = useState(0);
  const [linkDraft, setLinkDraft] = useState({ open: false, url: "", text: "" });
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Helper to wrap or insert HTML tags at cursor position
  function applyTag(openTag: string, closeTag: string, defaultPlaceholder = "teks") {
    const el = textareaRef.current;
    if (!el) return;

    const start = el.selectionStart;
    const end = el.selectionEnd;
    const currentText = value;

    if (start !== end) {
      // Selected text
      const selected = currentText.substring(start, end);
      const replacement = `${openTag}${selected}${closeTag}`;
      const newText = currentText.substring(0, start) + replacement + currentText.substring(end);
      onChange(newText);
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(start + openTag.length, start + openTag.length + selected.length);
      }, 0);
    } else {
      // No selection, insert tag with placeholder
      const replacement = `${openTag}${defaultPlaceholder}${closeTag}`;
      const newText = currentText.substring(0, start) + replacement + currentText.substring(end);
      onChange(newText);
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(start + openTag.length, start + openTag.length + defaultPlaceholder.length);
      }, 0);
    }
  }

  function handleInsertLink() {
    setLinkDraft({ open: true, url: "", text: "" });
  }

  function commitLink() {
    const url = linkDraft.url.trim();
    if (!url) return;
    const el = textareaRef.current;
    const start = el ? el.selectionStart : value.length;
    const end = el ? el.selectionEnd : value.length;
    const selected = linkDraft.text.trim() || value.substring(start, end) || url;

    const safeUrl = url.replace(/"/g, "&quot;");
    const replacement = `<a href="${safeUrl}">${selected}</a>`;
    const newText = value.substring(0, start) + replacement + value.substring(end);
    onChange(newText);
    setLinkDraft({ open: false, url: "", text: "" });
    setTimeout(() => el?.focus(), 0);
  }

  function handleInsertEmoji(emoji: string) {
    const el = textareaRef.current;
    if (!el) {
      onChange(value + emoji);
      return;
    }

    const start = el.selectionStart;
    const end = el.selectionEnd;
    const newText = value.substring(0, start) + emoji + value.substring(end);
    onChange(newText);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + emoji.length, start + emoji.length);
    }, 0);
  }

  // Filter emojis based on search
  const filteredEmojis = useMemo(() => {
    if (!emojiSearch.trim()) {
      return EMOJI_CATEGORIES[selectedEmojiCategory]?.list || [];
    }
    const q = emojiSearch.toLowerCase();
    const allMatching: string[] = [];
    for (const cat of EMOJI_CATEGORIES) {
      for (const em of cat.list) {
        if (em.includes(q)) {
          allMatching.push(em);
        }
      }
    }
    return allMatching;
  }, [emojiSearch, selectedEmojiCategory]);

  // Safe HTML parser for preview
  const renderedHtml = useMemo(() => {
    if (!value) return "<em>(Pesan kosong)</em>";

    let safe = value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // Only safe schemes may become an href
    safe = safe.replace(
      /&lt;a href=(?:&quot;|")([\s\S]*?)(?:&quot;|")&gt;/gi,
      (match, url) => {
        const trimmed = url.trim();
        const safeScheme = /^(https?:|tg:\/\/|mailto:)/i.test(trimmed);
        return safeScheme ? match : "&lt;a href=&quot;#&quot;&gt;";
      }
    );

    // Un-escape allowed Telegram HTML tags safely
    safe = safe
      .replace(/&lt;b&gt;([\s\S]*?)&lt;\/b&gt;/gi, "<strong>$1</strong>")
      .replace(/&lt;strong&gt;([\s\S]*?)&lt;\/strong&gt;/gi, "<strong>$1</strong>")
      .replace(/&lt;i&gt;([\s\S]*?)&lt;\/i&gt;/gi, "<em>$1</em>")
      .replace(/&lt;em&gt;([\s\S]*?)&lt;\/em&gt;/gi, "<em>$1</em>")
      .replace(
        /&lt;code&gt;([\s\S]*?)&lt;\/code&gt;/gi,
        "<code class='bg-gray-800 text-pink-400 px-1 py-0.5 rounded text-xs font-mono'>$1</code>"
      )
      .replace(
        /&lt;pre&gt;([\s\S]*?)&lt;\/pre&gt;/gi,
        "<pre class='bg-gray-900 text-gray-100 p-2 rounded text-xs font-mono my-1 overflow-x-auto'>$1</pre>"
      )
      .replace(
        /&lt;blockquote&gt;([\s\S]*?)&lt;\/blockquote&gt;/gi,
        "<blockquote class='border-l-2 border-primary-400 pl-2 italic my-1 text-gray-300'>$1</blockquote>"
      )
      .replace(
        /&lt;tg-spoiler&gt;([\s\S]*?)&lt;\/tg-spoiler&gt;/gi,
        "<span class='bg-gray-600 text-transparent hover:text-white cursor-pointer px-1 rounded transition'>$1</span>"
      )
      .replace(
        /&lt;a href=&quot;([\s\S]*?)&quot;&gt;([\s\S]*?)&lt;\/a&gt;/gi,
        "<a href='$1' target='_blank' rel='noreferrer' class='text-blue-400 underline hover:text-blue-300'>$2</a>"
      )
      .replace(
        /&lt;a href=\"([\s\S]*?)\"&gt;([\s\S]*?)&lt;\/a&gt;/gi,
        "<a href='$1' target='_blank' rel='noreferrer' class='text-blue-400 underline hover:text-blue-300'>$2</a>"
      )
      .replace(/\n/g, "<br />");

    return safe;
  }, [value]);

  const charCount = value.length;
  const isOverLimit = charCount > maxLength;

  return (
    <div
      className={cn(
        "border border-gray-300 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-900 shadow-xs focus-within:ring-2 focus-within:ring-primary-500/20 focus-within:border-primary-500 transition",
        className
      )}
    >
      {/* Editor Header Toolbar */}
      <div className="flex flex-wrap items-center justify-between border-b border-gray-200 dark:border-slate-800 bg-gray-50/90 dark:bg-slate-800/60 px-3 py-1.5 gap-2 text-xs">
        {/* Formatting buttons */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            title="Tebal (Bold) <b>...</b>"
            onClick={() => applyTag("<b>", "</b>", "tebal")}
            disabled={disabled || activeTab === "preview"}
            className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-200 disabled:opacity-40 transition font-bold"
          >
            <Bold className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Miring (Italic) <i>...</i>"
            onClick={() => applyTag("<i>", "</i>", "miring")}
            disabled={disabled || activeTab === "preview"}
            className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-200 disabled:opacity-40 transition italic"
          >
            <Italic className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Monospace (Code) <code>...</code>"
            onClick={() => applyTag("<code>", "</code>", "kode")}
            disabled={disabled || activeTab === "preview"}
            className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-200 disabled:opacity-40 transition"
          >
            <Code className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Kutipan (Quote) <blockquote>...</blockquote>"
            onClick={() => applyTag("<blockquote>", "</blockquote>", "kutipan")}
            disabled={disabled || activeTab === "preview"}
            className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-200 disabled:opacity-40 transition"
          >
            <Quote className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Tautan (Link) <a href='...'>...</a>"
            onClick={handleInsertLink}
            disabled={disabled || activeTab === "preview"}
            className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-200 disabled:opacity-40 transition"
          >
            <LinkIcon className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Spoiler <tg-spoiler>...</tg-spoiler>"
            onClick={() => applyTag("<tg-spoiler>", "</tg-spoiler>", "rahasia")}
            disabled={disabled || activeTab === "preview"}
            className="px-2 py-0.5 text-[11px] rounded hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-200 disabled:opacity-40 transition font-mono border border-gray-300 dark:border-slate-600"
          >
            spoiler
          </button>

          <div className="h-4 w-[1px] bg-gray-300 dark:bg-slate-700 mx-1" />

          {/* Emoji Picker toggle */}
          <div className="relative">
            <button
              type="button"
              title="Pilih Emoji"
              onClick={() => setShowEmojiPicker((prev) => !prev)}
              disabled={disabled || activeTab === "preview"}
              className={cn(
                "p-1.5 rounded hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-200 disabled:opacity-40 transition flex items-center gap-1",
                showEmojiPicker && "bg-gray-200 dark:bg-slate-700 text-primary-600"
              )}
            >
              <Smile className="h-3.5 w-3.5" />
            </button>

            {/* Emoji Dropdown Popover */}
            {showEmojiPicker && (
              <div className="absolute left-0 top-full mt-1.5 z-50 w-72 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-gray-200 dark:border-slate-700 p-2 animate-in fade-in zoom-in-95 duration-100">
                <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-gray-100 dark:border-slate-700">
                  <div className="flex items-center gap-1 bg-gray-100 dark:bg-slate-700/60 px-2 py-1 rounded-lg text-xs w-full">
                    <Search className="h-3 w-3 text-gray-400" />
                    <input
                      id="text-editor-emoji-search"
                      name="emojiSearch"
                      aria-label="Cari emoji..."
                      type="text"
                      placeholder="Cari emoji..."
                      value={emojiSearch}
                      onChange={(e) => setEmojiSearch(e.target.value)}
                      className="bg-transparent border-none outline-none text-xs w-full text-gray-900 dark:text-slate-100 placeholder:text-gray-400"
                    />
                    {emojiSearch && (
                      <button
                        type="button"
                        onClick={() => setEmojiSearch("")}
                        aria-label="Clear emoji search"
                        className="p-1 -m-1"
                      >
                        <X className="h-3 w-3 text-gray-400" />
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    aria-label="Close emoji picker"
                    onClick={() => setShowEmojiPicker(false)}
                    className="p-1.5 hover:bg-gray-100 dark:hover:bg-slate-700 rounded text-gray-400 ml-1"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Category bar */}
                {!emojiSearch && (
                  <div className="flex items-center gap-1 overflow-x-auto pb-1 mb-1 border-b border-gray-100 dark:border-slate-700 scrollbar-none">
                    {EMOJI_CATEGORIES.map((cat, idx) => (
                      <button
                        key={cat.label}
                        type="button"
                        onClick={() => setSelectedEmojiCategory(idx)}
                        className={cn(
                          "px-1.5 py-0.5 text-xs rounded hover:bg-gray-100 dark:hover:bg-slate-700 transition whitespace-nowrap",
                          selectedEmojiCategory === idx &&
                            "bg-primary-50 dark:bg-primary-950/60 text-primary-600 dark:text-primary-400 font-medium"
                        )}
                      >
                        {cat.icon}
                      </button>
                    ))}
                  </div>
                )}

                {/* Emoji Grid */}
                <div className="grid grid-cols-8 gap-1 max-h-48 overflow-y-auto p-1">
                  {filteredEmojis.map((em, idx) => (
                    <button
                      key={`${em}-${idx}`}
                      type="button"
                      onClick={() => handleInsertEmoji(em)}
                      className="h-7 w-7 flex items-center justify-center text-lg hover:bg-gray-100 dark:hover:bg-slate-700 rounded transition hover:scale-125"
                    >
                      {em}
                    </button>
                  ))}
                  {filteredEmojis.length === 0 && (
                    <p className="col-span-8 text-center text-xs text-gray-400 py-4">
                      Emoji tidak ditemukan
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right side: Mode Switch (Edit vs Preview) & Char count */}
        <div className="flex items-center gap-2">
          <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as "edit" | "preview")}>
            <TabsList className="h-7 bg-gray-200/80 dark:bg-slate-800 p-0.5">
              <TabsTrigger value="edit" className="h-6 px-2 text-[11px] gap-1">
                <Edit3 className="h-3 w-3" />
                Tulis
              </TabsTrigger>
              <TabsTrigger value="preview" className="h-6 px-2 text-[11px] gap-1">
                <Eye className="h-3 w-3" />
                Preview
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <span
            className={cn(
              "text-[10px] tabular-nums font-mono",
              isOverLimit ? "text-red-600 font-bold" : "text-gray-400 dark:text-slate-500"
            )}
            title={
              isOverLimit
                ? `Melebihi batas maksimal ${maxLength} karakter Telegram!`
                : "Karakter"
            }
          >
            {charCount}/{maxLength}
          </span>
        </div>
      </div>

      {/* Inline link editor */}
      {linkDraft.open && (
        <div className="border-b border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800/80 px-3 py-2.5 space-y-2">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              id="text-editor-link-url"
              name="linkUrl"
              type="url"
              inputMode="url"
              autoFocus
              value={linkDraft.url}
              onChange={(e) => setLinkDraft((d) => ({ ...d, url: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitLink();
                }
              }}
              placeholder="https://t.me/telebos_official"
              aria-label="Link URL"
              className="w-full sm:flex-1 rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm text-gray-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500"
            />
            <input
              id="text-editor-link-text"
              name="linkText"
              type="text"
              value={linkDraft.text}
              onChange={(e) => setLinkDraft((d) => ({ ...d, text: e.target.value }))}
              placeholder="Link text (optional)"
              aria-label="Link text"
              className="w-full sm:flex-1 rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm text-gray-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500"
            />
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setLinkDraft({ open: false, url: "", text: "" })}
              className="px-3 py-1 text-xs font-medium text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={commitLink}
              disabled={!linkDraft.url.trim()}
              className="px-3.5 py-1 text-xs font-semibold text-white bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 dark:disabled:bg-slate-700 rounded-lg transition"
            >
              Insert Link
            </button>
          </div>
        </div>
      )}

      {/* Editor Body */}
      {activeTab === "edit" ? (
        <textarea
          id={id}
          name={name}
          aria-label={ariaLabel || placeholder || "Ketik template pesan..."}
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          disabled={disabled}
          className="w-full px-3.5 py-2.5 text-sm outline-none resize-y min-h-[96px] bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500 font-sans"
        />
      ) : (
        /* Telegram Chat Bubble Preview */
        <div className="p-4 bg-[#0e1621] min-h-[110px] flex items-center justify-center">
          <div className="relative max-w-sm sm:max-w-md w-full bg-[#182533] text-white px-4 py-3 rounded-2xl rounded-tl-none shadow-md text-sm leading-relaxed break-words border border-[#242f3d]">
            <div
              className="prose prose-invert prose-sm max-w-none text-gray-100"
              dangerouslySetInnerHTML={{ __html: renderedHtml }}
            />
            <div className="flex items-center justify-end gap-1 mt-1.5 text-[10px] text-gray-400">
              <span>Sekarang</span>
              <span className="text-blue-400">✓✓</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── TextEditorModal (Radix UI Shadcn Dialog Wrapper) ───────────────────────

export interface TextEditorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  value: string;
  onSave: (value: string) => Promise<void> | void;
  placeholder?: string;
  saveText?: string;
  cancelText?: string;
  isLoading?: boolean;
  rows?: number;
  maxLength?: number;
  extraHeaderContent?: React.ReactNode;
  extraBodyContent?: React.ReactNode;
}

export function TextEditorModal({
  open,
  onOpenChange,
  title = "Text Editor",
  description,
  value,
  onSave,
  placeholder = "Ketik teks pesan...",
  saveText = "Simpan",
  cancelText = "Batal",
  isLoading = false,
  rows = 5,
  maxLength = 4096,
  extraHeaderContent,
  extraBodyContent,
}: TextEditorModalProps) {
  const [draft, setDraft] = useState(value);
  const [internalSaving, setInternalSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sync draft when opened or external value changes
  useEffect(() => {
    if (open) {
      setDraft(value);
      setErrorMsg(null);
    }
  }, [open, value]);

  async function handleSave() {
    setInternalSaving(true);
    setErrorMsg(null);
    try {
      await onSave(draft);
      onOpenChange(false);
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.detail || err?.message || "Gagal menyimpan pesan");
    } finally {
      setInternalSaving(false);
    }
  }

  const busy = isLoading || internalSaving;
  const isOverLimit = draft.length > maxLength;

  return (
    <Dialog open={open} onOpenChange={busy ? undefined : onOpenChange}>
      <DialogContent className="max-w-xl sm:max-w-2xl p-6">
        <DialogHeader className="text-left space-y-1">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="text-lg font-bold text-gray-900 dark:text-slate-100">
              {title}
            </DialogTitle>
          </div>
          {description && (
            <DialogDescription className="text-xs text-gray-500 dark:text-slate-400">
              {description}
            </DialogDescription>
          )}
          {extraHeaderContent && <div className="pt-1">{extraHeaderContent}</div>}
        </DialogHeader>

        <div className="space-y-3 py-1">
          {extraBodyContent}

          <TextEditor
            value={draft}
            onChange={setDraft}
            placeholder={placeholder}
            rows={rows}
            disabled={busy}
            maxLength={maxLength}
          />

          {errorMsg && (
            <p className="text-xs text-red-500 dark:text-red-400 font-medium">
              {errorMsg}
            </p>
          )}
        </div>

        <DialogFooter className="flex flex-row items-center justify-end gap-2 pt-2 sm:space-x-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            {cancelText}
          </Button>

          <Button
            type="button"
            size="sm"
            disabled={busy || isOverLimit}
            onClick={handleSave}
            className="min-w-[80px]"
          >
            {busy ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Menyimpan...
              </>
            ) : (
              saveText
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
