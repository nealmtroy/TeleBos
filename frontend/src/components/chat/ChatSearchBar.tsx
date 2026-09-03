import React from "react";
import { Search, X, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

import { MessageItem } from "./types";

export interface ChatSearchBarProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchMediaType: string | null;
  setSearchMediaType: (type: any) => void;
  searchDateFrom: string;
  setSearchDateFrom: (date: string) => void;
  searchDateTo: string;
  setSearchDateTo: (date: string) => void;
  onClose: () => void;
  searchResultsData?: MessageItem[];
  scrollToMessage: (id: number) => void;
}

const MEDIA_FILTERS = [
  { type: null, label: "All" },
  { type: "photo", label: "Photos" },
  { type: "video", label: "Videos" },
  { type: "document", label: "Files" },
  { type: "voice", label: "Voice" },
  { type: "url", label: "Links" },
  { type: "gif", label: "GIFs" },
] as const;

export function ChatSearchBar({
  searchQuery,
  setSearchQuery,
  searchMediaType,
  setSearchMediaType,
  searchDateFrom,
  setSearchDateFrom,
  searchDateTo,
  setSearchDateTo,
  onClose,
  searchResultsData,
  scrollToMessage,
}: ChatSearchBarProps) {
  return (
    <div className="bg-slate-50 dark:bg-[#1a242f] border-b border-slate-200/60 dark:border-slate-800/80 px-4 py-3 flex flex-col gap-3 z-10 select-none animate-in slide-in-from-top-2 duration-200 flex-shrink-0 text-left">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Search messages..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#202b36] rounded-xl focus:outline-none focus:ring-1 focus:ring-primary text-xs font-semibold text-slate-800 dark:text-white"
          />
          <Search className="absolute left-3 top-2 h-3.5 w-3.5 text-slate-400" />
        </div>
        <button
          onClick={onClose}
          className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 rounded-lg transition"
          title="Close Search"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full sm:max-w-[50%] scrollbar-none">
          {MEDIA_FILTERS.map((filter) => (
            <button
              key={filter.label}
              onClick={() => setSearchMediaType(filter.type)}
              className={cn(
                "px-2.5 py-1 rounded-lg border text-[10px] font-bold transition flex-shrink-0",
                searchMediaType === filter.type
                  ? "bg-primary border-primary text-white"
                  : "bg-white dark:bg-[#202b36] border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            From:
          </span>
          <input
            type="date"
            value={searchDateFrom}
            onChange={(e) => setSearchDateFrom(e.target.value)}
            className="px-2 py-1 border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#202b36] rounded-lg text-slate-700 dark:text-slate-350 focus:outline-none"
          />
          <span className="flex items-center gap-1 ml-2">To:</span>
          <input
            type="date"
            value={searchDateTo}
            onChange={(e) => setSearchDateTo(e.target.value)}
            className="px-2 py-1 border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#202b36] rounded-lg text-slate-700 dark:text-slate-350 focus:outline-none"
          />
        </div>
      </div>

      {searchResultsData && searchResultsData.length > 0 ? (
        <div className="bg-white dark:bg-[#17212b] border border-slate-200/50 dark:border-slate-800/80 rounded-xl p-2 max-h-40 overflow-y-auto custom-scroll flex flex-col gap-1 shadow-sm mt-1">
          {searchResultsData.map((resMsg) => (
            <button
              key={resMsg.id}
              onClick={() => scrollToMessage(resMsg.id)}
              className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-[#202b36] rounded-lg flex items-center justify-between text-xs transition border-b border-slate-100 dark:border-slate-800 last:border-0"
            >
              <div className="flex flex-col flex-1 min-w-0 pr-4">
                <span className="font-bold text-slate-700 dark:text-slate-200 text-[11px] truncate">
                  {resMsg.sender_name || "Unknown"}
                </span>
                <span className="text-slate-400 dark:text-slate-500 truncate text-[11px] mt-0.5 text-left">
                  {resMsg.text || `[${resMsg.media_type || "Media"}]`}
                </span>
              </div>
              <span className="text-[10px] text-slate-400 dark:text-slate-600 font-medium">
                {new Date(resMsg.date).toLocaleDateString()}
              </span>
            </button>
          ))}
        </div>
      ) : searchQuery || searchMediaType || searchDateFrom || searchDateTo ? (
        <div className="text-center py-2 text-[11px] text-slate-400 font-semibold bg-white dark:bg-[#17212b] border border-slate-200/50 dark:border-slate-800 rounded-xl">
          No results found
        </div>
      ) : null}
    </div>
  );
}
