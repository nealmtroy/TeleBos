"use client";

import { FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { AccountFolder } from "@/hooks/use-account-folders";

interface FolderFilterBarProps {
  folders: AccountFolder[];
  selectedFolderId: string | null;
  onSelect: (folderId: string | null) => void;
}

export function FolderFilterBar({ folders, selectedFolderId, onSelect }: FolderFilterBarProps) {
  const _ = useT();
  if (folders.length === 0) return null;

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors shrink-0 shadow-2xs cursor-pointer border",
          selectedFolderId === null
            ? "bg-primary border-primary text-primary-foreground"
            : "bg-card border-border text-muted-foreground hover:text-foreground hover:bg-muted"
        )}
      >
        <FolderOpen className="h-3.5 w-3.5" />
        {_("accountFolders.allAccounts") || "All Accounts"}
      </button>
      {folders.map((folder) => (
        <button
          type="button"
          key={folder.id}
          onClick={() => onSelect(folder.id)}
          className={cn(
            "px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors shrink-0 shadow-2xs cursor-pointer border",
            selectedFolderId === folder.id
              ? "bg-primary border-primary text-primary-foreground"
              : "bg-card border-border text-muted-foreground hover:text-foreground hover:bg-muted"
          )}
        >
          {folder.name}
        </button>
      ))}
    </div>
  );
}
