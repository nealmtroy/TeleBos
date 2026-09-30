"use client";

import { useState, useRef, useMemo } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EMOJI_CATEGORIES } from "@/components/chat/constants";

interface AutoReplyEditorProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
}

export function AutoReplyEditor({
  value,
  onChange,
  placeholder = "Ketik template pesan balasan otomatis...",
  rows = 3,
  disabled = false,
}: AutoReplyEditorProps) {
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
    // A prompt() is unusable on mobile and gives no way to validate the URL, so
    // the link editor is an inline form anchored under the toolbar instead.
    setLinkDraft({ open: true, url: "", text: "" });
  }

  /** Commit the inline link form, wrapping the current selection when present. */
  function commitLink() {
    const url = linkDraft.url.trim();
    if (!url) return;
    const el = textareaRef.current;
    const start = el ? el.selectionStart : value.length;
    const end = el ? el.selectionEnd : value.length;
    const selected = linkDraft.text.trim() || value.substring(start, end) || url;

    // Escape quotes so a URL containing " cannot break out of the attribute and
    // inject markup into the preview below.
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
    // Search across all categories
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
      // Escape generic HTML tags except allowed Telegram tags
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // Only http(s) and Telegram links may become an href. Without this check a
    // pasted javascript: URL would execute inside the preview, which renders
    // through dangerouslySetInnerHTML.
    safe = safe.replace(
      /&lt;a href=(?:&quot;|")([\s\S]*?)(?:&quot;|")&gt;/gi,
      (match, url) => {
        const trimmed = url.trim();
        // Anything outside these schemes becomes an inert "#" so a pasted
        // javascript:/data:/vbscript: URL cannot execute in the preview.
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
      .replace(/&lt;code&gt;([\s\S]*?)&lt;\/code&gt;/gi, "<code class='bg-gray-800 text-pink-400 px-1 py-0.5 rounded text-xs font-mono'>$1</code>")
      .replace(/&lt;pre&gt;([\s\S]*?)&lt;\/pre&gt;/gi, "<pre class='bg-gray-900 text-gray-100 p-2 rounded text-xs font-mono my-1 overflow-x-auto'>$1</pre>")
      .replace(/&lt;blockquote&gt;([\s\S]*?)&lt;\/blockquote&gt;/gi, "<blockquote class='border-l-2 border-primary-400 pl-2 italic my-1 text-gray-300'>$1</blockquote>")
      .replace(/&lt;tg-spoiler&gt;([\s\S]*?)&lt;\/tg-spoiler&gt;/gi, "<span class='bg-gray-600 text-transparent hover:text-white cursor-pointer px-1 rounded transition'>$1</span>")
      .replace(/&lt;a href=&quot;([\s\S]*?)&quot;&gt;([\s\S]*?)&lt;\/a&gt;/gi, "<a href='$1' target='_blank' rel='noreferrer' class='text-blue-400 underline hover:text-blue-300'>$2</a>")
      .replace(/&lt;a href=\"([\s\S]*?)\"&gt;([\s\S]*?)&lt;\/a&gt;/gi, "<a href='$1' target='_blank' rel='noreferrer' class='text-blue-400 underline hover:text-blue-300'>$2</a>")
      // Convert newlines to breaks
      .replace(/\n/g, "<br />");

    return safe;
  }, [value]);

  const charCount = value.length;
  const isOverLimit = charCount > 4096;

  return (
    <div className="border border-gray-300 rounded-lg overflow-hidden bg-white shadow-sm focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-primary-500 transition">
      {/* Editor Header Toolbar */}
      <div className="flex flex-wrap items-center justify-between border-b border-gray-200 bg-gray-50/90 px-3 py-1.5 gap-2 text-xs">
        {/* Formatting buttons */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            title="Tebal (Bold) <b>...</b>"
            onClick={() => applyTag("<b>", "</b>", "tebal")}
            disabled={disabled || activeTab === "preview"}
            className="p-1.5 rounded hover:bg-gray-200 text-gray-700 disabled:opacity-40 transition font-bold"
          >
            <Bold className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Miring (Italic) <i>...</i>"
            onClick={() => applyTag("<i>", "</i>", "miring")}
            disabled={disabled || activeTab === "preview"}
            className="p-1.5 rounded hover:bg-gray-200 text-gray-700 disabled:opacity-40 transition italic"
          >
            <Italic className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Monospace (Code) <code>...</code>"
            onClick={() => applyTag("<code>", "</code>", "kode")}
            disabled={disabled || activeTab === "preview"}
            className="p-2 sm:p-1.5 rounded hover:bg-gray-200 text-gray-700 disabled:opacity-40 transition"
          >
            <Code className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Kutipan (Quote) <blockquote>...</blockquote>"
            onClick={() => applyTag("<blockquote>", "</blockquote>", "kutipan")}
            disabled={disabled || activeTab === "preview"}
            className="p-2 sm:p-1.5 rounded hover:bg-gray-200 text-gray-700 disabled:opacity-40 transition"
          >
            <Quote className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Tautan (Link) <a href='...'>...</a>"
            onClick={handleInsertLink}
            disabled={disabled || activeTab === "preview"}
            className="p-2 sm:p-1.5 rounded hover:bg-gray-200 text-gray-700 disabled:opacity-40 transition"
          >
            <LinkIcon className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Spoiler <tg-spoiler>...</tg-spoiler>"
            onClick={() => applyTag("<tg-spoiler>", "</tg-spoiler>", "rahasia")}
            disabled={disabled || activeTab === "preview"}
            className="px-2.5 sm:px-1.5 py-1 sm:py-0.5 text-[11px] rounded hover:bg-gray-200 text-gray-700 disabled:opacity-40 transition font-mono border border-gray-300"
          >
            spoiler
          </button>

          <div className="h-4 w-[1px] bg-gray-300 mx-1" />

          {/* Emoji Picker toggle */}
          <div className="relative">
            <button
              type="button"
              title="Pilih Emoji"
              onClick={() => setShowEmojiPicker((prev) => !prev)}
              disabled={disabled || activeTab === "preview"}
              className={cn(
                "p-2 sm:p-1.5 rounded hover:bg-gray-200 text-gray-700 disabled:opacity-40 transition flex items-center gap-1",
                showEmojiPicker && "bg-gray-200 text-primary-600"
              )}
            >
              <Smile className="h-3.5 w-3.5" />
            </button>

            {/* Emoji Dropdown Popover */}
            {showEmojiPicker && (
              <div className="absolute left-0 top-full mt-1.5 z-50 w-72 bg-white rounded-lg shadow-xl border border-gray-200 p-2 animate-in fade-in zoom-in-95 duration-100">
                <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-gray-100">
                  <div className="flex items-center gap-1 bg-gray-100 px-2 py-1 rounded text-xs w-full">
                    <Search className="h-3 w-3 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Cari emoji..."
                      value={emojiSearch}
                      onChange={(e) => setEmojiSearch(e.target.value)}
                      className="bg-transparent border-none outline-none text-xs w-full"
                    />
                    {emojiSearch && (
                      <button type="button" onClick={() => setEmojiSearch("")} aria-label="Clear emoji search" className="p-1.5 -m-1">
                        <X className="h-3 w-3 text-gray-400" />
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    aria-label="Close emoji picker"
                    onClick={() => setShowEmojiPicker(false)}
                    className="p-2 hover:bg-gray-100 rounded text-gray-400 ml-1"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Category bar */}
                {!emojiSearch && (
                  <div className="flex items-center gap-1 overflow-x-auto pb-1 mb-1 border-b border-gray-100 scrollbar-none">
                    {EMOJI_CATEGORIES.map((cat, idx) => (
                      <button
                        key={cat.label}
                        type="button"
                        onClick={() => setSelectedEmojiCategory(idx)}
                        className={cn(
                          "px-1.5 py-0.5 text-xs rounded hover:bg-gray-100 transition whitespace-nowrap",
                          selectedEmojiCategory === idx && "bg-primary-50 text-primary-600 font-medium"
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
                      className="h-7 w-7 flex items-center justify-center text-lg hover:bg-gray-100 rounded transition hover:scale-125"
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
          <div className="flex items-center bg-gray-200/80 rounded p-0.5">
            <button
              type="button"
              onClick={() => setActiveTab("edit")}
              className={cn(
                "px-2 py-0.5 rounded text-[11px] font-medium transition flex items-center gap-1",
                activeTab === "edit"
                  ? "bg-white text-gray-900 shadow-xs"
                  : "text-gray-500 hover:text-gray-700"
              )}
            >
              <Edit3 className="h-3 w-3" />
              Tulis
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("preview")}
              className={cn(
                "px-2 py-0.5 rounded text-[11px] font-medium transition flex items-center gap-1",
                activeTab === "preview"
                  ? "bg-white text-gray-900 shadow-xs"
                  : "text-gray-500 hover:text-gray-700"
              )}
            >
              <Eye className="h-3 w-3" />
              Preview
            </button>
          </div>

          <span
            className={cn(
              "text-[10px] tabular-nums font-mono",
              isOverLimit ? "text-red-600 font-bold" : "text-gray-400"
            )}
            title={isOverLimit ? "Melebihi batas maksimal 4096 karakter Telegram!" : "Karakter"}
          >
            {charCount}/4096
          </span>
        </div>
      </div>

      {/* Inline link editor — a form rather than window.prompt, which mobile
          browsers handle poorly and cannot validate. */}
      {linkDraft.open && (
        <div className="border-b border-gray-200 bg-gray-50 px-3 py-2.5 space-y-2">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
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
              className="w-full sm:flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500"
            />
            <input
              type="text"
              value={linkDraft.text}
              onChange={(e) => setLinkDraft((d) => ({ ...d, text: e.target.value }))}
              placeholder="Link text (optional)"
              aria-label="Link text"
              className="w-full sm:flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500"
            />
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setLinkDraft({ open: false, url: "", text: "" })}
              className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-200 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={commitLink}
              disabled={!linkDraft.url.trim()}
              className="px-3.5 py-1.5 text-xs font-semibold text-white bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 rounded-lg transition"
            >
              Insert Link
            </button>
          </div>
        </div>
      )}

      {/* Editor Body */}
      {activeTab === "edit" ? (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          disabled={disabled}
          className="w-full px-3 py-2 text-sm outline-none resize-none bg-white text-gray-900 font-sans"
        />
      ) : (
        /* Telegram Chat Bubble Preview */
        <div className="p-4 bg-[#0e1621] min-h-[90px] flex items-center justify-center rounded-b-lg">
          <div className="relative max-w-sm bg-[#182533] text-white px-3.5 py-2.5 rounded-2xl rounded-tl-none shadow-md text-sm leading-relaxed break-words border border-[#242f3d]">
            <div
              className="prose prose-invert prose-sm max-w-none text-gray-100"
              dangerouslySetInnerHTML={{ __html: renderedHtml }}
            />
            <div className="flex items-center justify-end gap-1 mt-1 text-[10px] text-gray-400">
              <span>Sekarang</span>
              <span className="text-blue-400">✓✓</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
