"use client";

import { FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AccountFolder } from "@/hooks/use-account-folders";

interface FolderFilterBarProps {
  folders: AccountFolder[];
  selectedFolderId: string | null;
  onSelect: (folderId: string | null) => void;
}

export function FolderFilterBar({ folders, selectedFolderId, onSelect }: FolderFilterBarProps) {
  if (folders.length === 0) return null;

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
      <button
        onClick={() => onSelect(null)}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition shrink-0",
          selectedFolderId === null
            ? "bg-primary-600 text-white shadow-sm"
            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
        )}
      >
        <FolderOpen className="h-3.5 w-3.5" />
        All Accounts
      </button>
      {folders.map((folder) => (
        <button
          key={folder.id}
          onClick={() => onSelect(folder.id)}
          className={cn(
            "px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition shrink-0",
            selectedFolderId === folder.id
              ? "bg-primary-600 text-white shadow-sm"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          )}
        >
          {folder.name}
        </button>
      ))}
    </div>
  );
}
